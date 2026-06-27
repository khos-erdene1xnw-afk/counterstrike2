import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUser, logAudit } from '@/lib/auth';
import { buySchema } from '@/lib/validation';
import { steamBot } from '@/lib/steam-bot';
import { acquireLock, releaseLock } from '@/lib/redis';
import { clientIp } from '@/lib/request';

const STEAM_APPID = 730;
const STEAM_CONTEXTID = '2';

export async function POST(request: Request) {
  let buyerId = '';
  try {
    const buyer = await requireUser();
    buyerId = buyer.id;
    const body = await request.json();
    const parsed = buySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { listingId } = parsed.data;

    if (buyer.isBanned) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }
    if (!buyer.tradeUrl) {
      return NextResponse.json({ error: 'Add your Steam trade URL before buying' }, { status: 400 });
    }

    // Serialize all attempts to buy the same listing.
    const lockKey = `listing:buy:${listingId}`;
    if (!(await acquireLock(lockKey, 30))) {
      return NextResponse.json({ error: 'This item is being purchased by someone else' }, { status: 409 });
    }

    try {
      const { tradeOffer, listing } = await prisma.$transaction(async (tx) => {
        const foundListing = await tx.listing.findUnique({ where: { id: listingId }, include: { skin: true, seller: true } });
        if (!foundListing || foundListing.status !== 'ACTIVE') throw new Error('LISTING_UNAVAILABLE');
        if (foundListing.sellerId === buyer.id) throw new Error('CANNOT_BUY_OWN');

        const wallet = await tx.wallet.findUnique({ where: { userId: buyer.id } });
        if (!wallet) throw new Error('WALLET_NOT_FOUND');

        const priceMNT = foundListing.priceMNT;
        const priceUSD = foundListing.priceUSD;
        if (wallet.balanceMNT.lessThan(priceMNT)) throw new Error('INSUFFICIENT_FUNDS');

        // Move funds: available -> locked (escrow), optimistic version bump.
        await tx.wallet.update({
          where: { userId: buyer.id },
          data: {
            balanceMNT: { decrement: priceMNT },
            balanceUSD: { decrement: priceUSD },
            lockedMNT: { increment: priceMNT },
            lockedUSD: { increment: priceUSD },
            version: { increment: 1 },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amountMNT: priceMNT,
            amountUSD: priceUSD,
            currency: 'MNT',
            type: 'BUY_PAYMENT',
            status: 'PENDING',
            paymentProvider: 'WALLET',
            referenceId: foundListing.id,
            idempotencyKey: `buy:${foundListing.id}:${buyer.id}`,
          },
        });

        await tx.listing.update({
          where: { id: foundListing.id },
          data: { status: 'PENDING' },
        });

        const securityCode = `SEC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const tradeOffer = await tx.tradeOffer.create({
          data: {
            listingId: foundListing.id,
            buyerId: buyer.id,
            sellerId: foundListing.sellerId,
            status: 'CREATED',
            securityCode,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          },
        });

        // Keep the full listing (with skin + sellerId + assetId) for use after the transaction.
        return { tradeOffer, listing: foundListing };
      });

      // Dispatch the bot trade offer OUTSIDE the DB transaction (network I/O).
      let steamOfferId: string | null = null;
      let offerState: string = 'CONFIRMATION_NEEDED';
      let escrowDays = 0;
      try {
        const result = await steamBot.sendOffer({
          partnerTradeUrl: buyer.tradeUrl,
          itemsToGive: [{ appid: STEAM_APPID, contextid: STEAM_CONTEXTID, assetid: listing.assetId }],
          message: `CS2GOLD secure delivery. Authorization code: ${tradeOffer.securityCode}`,
        });
        steamOfferId = result.offerId;
        offerState = result.state;
        escrowDays = result.escrowDays;
      } catch (botErr) {
        // Bot failure must not lose the buyer's money: keep escrow locked, flag for ops.
        await prisma.tradeOffer.update({
          where: { id: tradeOffer.id },
          data: { status: 'DISPUTED' },
        });
        await logAudit({
          userId: buyer.id,
          action: 'STEAM_BOT_SEND_FAILED',
          details: { tradeOfferId: tradeOffer.id, error: (botErr as Error).message },
        });
        return NextResponse.json({
          success: true,
          warning: 'Payment secured in escrow. Delivery is queued — our system will retry automatically.',
          tradeOfferId: tradeOffer.id,
        });
      }

      const mappedStatus = escrowDays > 0 ? 'IN_ESCROW' : 'SENT';
      await prisma.tradeOffer.update({
        where: { id: tradeOffer.id },
        data: { steamOfferId, status: mappedStatus, escrowDays, lastSyncedAt: new Date() },
      });

      await prisma.notification.createMany({
        data: [
          { userId: buyer.id, title: 'Skin On The Way', message: `A Steam trade offer for your purchase has been sent.${escrowDays > 0 ? ` Note: ${escrowDays}-day Steam hold applies.` : ''}`, type: 'TRADE', link: '/trades' },
          { userId: listing.sellerId, title: 'Item Sold', message: `Your ${listing.skin?.name ?? 'item'} sold. Payout will release once delivery confirms.`, type: 'TRADE', link: '/trades' },
        ],
      });

      await logAudit({
        userId: buyer.id,
        action: 'PURCHASE_ESCROW_LOCKED',
        ipAddress: clientIp(request),
        details: { listingId, steamOfferId, escrowDays },
      });

      return NextResponse.json({ success: true, tradeOfferId: tradeOffer.id, steamOfferId, state: offerState, escrowDays });
    } finally {
      await releaseLock(lockKey);
    }
  } catch (e) {
    const map: Record<string, [number, string]> = {
      UNAUTHORIZED: [401, 'Sign in required'],
      LISTING_UNAVAILABLE: [409, 'This listing is no longer available'],
      CANNOT_BUY_OWN: [400, 'You cannot buy your own listing'],
      WALLET_NOT_FOUND: [404, 'Wallet not found'],
      INSUFFICIENT_FUNDS: [402, 'Insufficient wallet balance (MNT)'],
    };
    const [status, message] = map[(e as Error).message] ?? [500, (e as Error).message];
    return NextResponse.json({ error: message }, { status });
  }
}
