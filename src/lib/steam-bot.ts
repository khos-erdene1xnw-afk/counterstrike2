import 'server-only';
import SteamUser from 'steam-user';
import SteamTotp from 'steam-totp';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';

/**
 * Production Steam trade bot wrapper.
 *
 * Responsibilities:
 *  - Authenticate the bot account with Steam Guard (TOTP from shared secret)
 *  - Maintain a web session for the trade-offer manager + community
 *  - Send trade offers (with the anti-scam token in the message)
 *  - Auto-confirm outgoing offers via the identity secret (mobile confirmations)
 *  - Detect trade holds / escrow and surface them
 *  - Poll/translate offer state, with retry + reconnect handling
 *
 * Requires env: STEAM_BOT_USERNAME, STEAM_BOT_PASSWORD,
 *               STEAM_BOT_SHARED_SECRET, STEAM_BOT_IDENTITY_SECRET, STEAM_WEB_API_KEY
 *
 * NOTE: A single hot bot instance is reused across requests (module singleton).
 * For horizontal scale, run the bot(s) as a dedicated worker service and call it
 * over an internal queue; this module is structured so that worker can import it directly.
 */

export type OfferState =
  | 'INVALID' | 'ACTIVE' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED'
  | 'DECLINED' | 'INVALID_ITEMS' | 'CONFIRMATION_NEEDED' | 'IN_ESCROW';

const STATE_MAP: Record<number, OfferState> = {
  1: 'INVALID', 2: 'ACTIVE', 3: 'ACCEPTED', 4: 'EXPIRED', 5: 'CANCELED',
  6: 'DECLINED', 7: 'INVALID_ITEMS', 8: 'CONFIRMATION_NEEDED', 9: 'IN_ESCROW',
  11: 'IN_ESCROW',
};

interface SendOfferParams {
  partnerTradeUrl: string;     // buyer or seller trade URL
  itemsToGive: { appid: number; contextid: string; assetid: string }[];
  itemsToReceive?: { appid: number; contextid: string; assetid: string }[];
  message: string;             // includes anti-scam security code
}

interface SendOfferResult {
  offerId: string;
  state: OfferState;
  needsMobileConfirmation: boolean;
  escrowDays: number;
}

class SteamBot {
  private client: SteamUser;
  private community: SteamCommunity;
  private manager: TradeOfferManager;
  private ready = false;
  private loggingIn: Promise<void> | null = null;

  constructor() {
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.manager = new TradeOfferManager({
      steam: this.client,
      community: this.community,
      language: 'en',
      pollInterval: 10_000,
      cancelTime: 10 * 60_000, // auto-cancel un-accepted outgoing offers after 10 min
    });

    this.client.on('webSession', (_sid, cookies) => {
      this.manager.setCookies(cookies, (err) => {
        if (err) {
          this.ready = false;
          return;
        }
        this.community.setCookies(cookies);
        this.community.startConfirmationChecker(20_000, process.env.STEAM_BOT_IDENTITY_SECRET);
        this.ready = true;
      });
    });

    this.client.on('error', () => {
      this.ready = false;
      this.loggingIn = null;
    });

    this.client.on('disconnected', () => {
      this.ready = false;
      this.loggingIn = null;
    });
  }

  private requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Steam bot configuration error: ${name} is not set`);
    return v;
  }

  /** Log in once; concurrent callers await the same promise. */
  async ensureLoggedIn(): Promise<void> {
    if (this.ready) return;
    if (this.loggingIn) return this.loggingIn;

    this.loggingIn = new Promise<void>((resolve, reject) => {
      const sharedSecret = this.requireEnv('STEAM_BOT_SHARED_SECRET');
      const timeout = setTimeout(() => reject(new Error('Steam bot login timed out')), 30_000);

      const onReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          clearInterval(poll);
          this.client.removeAllListeners('webSession');
          resolve();
        }
      };
      const check = () => setTimeout(onReady, 500);

      this.client.removeAllListeners('webSession');
      this.client.on('webSession', check);

      this.client.logOn({
        accountName: this.requireEnv('STEAM_BOT_USERNAME'),
        password: this.requireEnv('STEAM_BOT_PASSWORD'),
        twoFactorCode: SteamTotp.generateAuthCode(sharedSecret),
      });

      // Poll readiness as a fallback to the event
      const poll = setInterval(() => {
        if (this.ready) {
          clearInterval(poll);
          clearTimeout(timeout);
          resolve();
        }
      }, 500);
    }).finally(() => {
      this.loggingIn = null;
    });

    return this.loggingIn;
  }

  /** Send a trade offer with retry + escrow detection. */
  async sendOffer(params: SendOfferParams, attempt = 1): Promise<SendOfferResult> {
    await this.ensureLoggedIn();

    return new Promise<SendOfferResult>((resolve, reject) => {
      const offer = this.manager.createOffer(params.partnerTradeUrl);
      params.itemsToGive.forEach((i) => offer.addMyItem(i));
      (params.itemsToReceive ?? []).forEach((i) => offer.addTheirItem(i));
      offer.setMessage(params.message);

      // Pre-flight escrow estimate
      offer.getUserDetails((detErr: Error | null, _me: unknown, them: { escrowDays: number }) => {
        const escrowDays = detErr ? 0 : (them?.escrowDays ?? 0);

        offer.send(async (err: Error | null, status: string) => {
          if (err) {
            if (attempt < 3) {
              // transient — back off and retry with a fresh session
              this.ready = false;
              setTimeout(() => {
                this.sendOffer(params, attempt + 1).then(resolve).catch(reject);
              }, 1500 * attempt);
              return;
            }
            return reject(err);
          }

          const needsConfirm = status === 'pending';
          if (needsConfirm) {
            // Accept the mobile confirmation for this specific offer
            this.community.acceptConfirmationForObject(
              this.requireEnv('STEAM_BOT_IDENTITY_SECRET'),
              offer.id,
              (confErr: Error | null) => {
                if (confErr) {
                  return reject(new Error(`Offer ${offer.id} sent but confirmation failed: ${confErr.message}`));
                }
                resolve({
                  offerId: offer.id,
                  state: escrowDays > 0 ? 'IN_ESCROW' : 'ACTIVE',
                  needsMobileConfirmation: false,
                  escrowDays,
                });
              }
            );
          } else {
            resolve({
              offerId: offer.id,
              state: escrowDays > 0 ? 'IN_ESCROW' : 'ACTIVE',
              needsMobileConfirmation: false,
              escrowDays,
            });
          }
        });
      });
    });
  }

  /** Authoritative state of an existing offer. */
  async getOfferState(offerId: string): Promise<OfferState> {
    await this.ensureLoggedIn();
    return new Promise<OfferState>((resolve, reject) => {
      this.manager.getOffer(offerId, (err: Error | null, offer: { state: number; isOurOffer: boolean } | undefined) => {
        if (err) return reject(err);
        if (!offer) return resolve('INVALID');
        resolve(STATE_MAP[offer.state] ?? 'INVALID');
      });
    });
  }

  /** Cancel an outgoing offer (e.g. seller never confirmed in time). */
  async cancelOffer(offerId: string): Promise<void> {
    await this.ensureLoggedIn();
    return new Promise<void>((resolve, reject) => {
      this.manager.getOffer(offerId, (err: Error | null, offer: { cancel: (cb: (e: Error | null) => void) => void } | undefined) => {
        if (err) return reject(err);
        if (!offer) return resolve();
        offer.cancel((cancelErr: Error | null) => (cancelErr ? reject(cancelErr) : resolve()));
      });
    });
  }
}

// Module singleton (one hot bot per server instance)
const globalForBot = globalThis as unknown as { steamBot?: SteamBot };
export const steamBot = globalForBot.steamBot ?? new SteamBot();
if (process.env.NODE_ENV !== 'production') globalForBot.steamBot = steamBot;
