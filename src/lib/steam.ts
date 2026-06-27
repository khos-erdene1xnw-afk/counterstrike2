import 'server-only';
import crypto from 'crypto';
import { steamBot, type OfferState } from '@/lib/steam-bot';

export interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
}

export interface CS2ItemFloatData {
  floatValue: number;
  paintSeed: number;
  paintIndex: number;
  imageUrl: string;
}

const TRADE_URL_RE = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[a-zA-Z0-9_-]+$/;

export class SteamIntegrationService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.STEAM_WEB_API_KEY || '';
  }

  /** Fetch user profile from the Steam Web API. Returns null on any failure. */
  async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
    if (!this.apiKey) throw new Error('STEAM_WEB_API_KEY is not configured');
    try {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamId}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const p = data?.response?.players?.[0];
      if (!p) return null;
      return { steamid: p.steamid, personaname: p.personaname, avatarfull: p.avatarfull, profileurl: p.profileurl };
    } catch {
      return null;
    }
  }

  /**
   * Fetch authoritative wear/float data from the CSFloat inspect API.
   * Returns null when unavailable — callers must handle the null rather than
   * relying on fabricated values.
   */
  async getSkinWearData(inspectLink: string): Promise<CS2ItemFloatData | null> {
    try {
      const url = `https://api.csfloat.com/?url=${encodeURIComponent(inspectLink)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const info = data?.iteminfo;
      if (!info) return null;
      return {
        floatValue: Number(info.floatvalue),
        paintSeed: Number(info.paintseed),
        paintIndex: Number(info.paintindex),
        imageUrl: info.imageurl || '',
      };
    } catch {
      return null;
    }
  }

  /** Cryptographically random 6-char anti-scam authorization code. */
  generateAntiScamCode(): string {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  /** Validate a Steam trade URL. */
  validateTradeUrl(tradeUrl: string): boolean {
    return TRADE_URL_RE.test(tradeUrl);
  }

  /** Authoritative trade-offer state via the live bot session. */
  async getTradeOfferState(steamOfferId: string): Promise<OfferState> {
    return steamBot.getOfferState(steamOfferId);
  }
}
