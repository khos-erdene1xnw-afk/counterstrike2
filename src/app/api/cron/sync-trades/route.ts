import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { steamBot } from '@/lib/steam-bot';
import { commissionMNT, mntToUsd } from '@/lib/money';

/**
 * Polls Steam for the live state of in-flight trade offers and reconciles money:
 *  - ACCEPTED  -> release escrow to seller (minus commission), mark listing SOLD
 *  - DECLINED/CANCELED/EXPIRED -> refund buyer, re-activate listing
 *  - IN_ESCROW -> keep waiting (Steam hold)
 *  - past expiresAt & still un-accepted -> cancel offer + refund
 * Idempotent: only acts on offers in non-terminal states.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const active = await prisma.tradeOffer.findMany({
    where: { status: { in: ['SENT', 'IN_ESCROW', 'CONFIRMATION_NEEDED'] } },
    include: { listing: true },
    take: 200,
  });

  let released = 0, refunded = 0, pending = 0;

  for (const offer of active) {
    try {
      // Time-based auto-cancel for un-accepted offers.
      if (offer.expiresAt && offer.expiresAt < new Date()) {
        if (offer.steamOfferId) await steamBot.cancelOffer(offer.steamOfferId).catch(() => {});
        await refundBuyer(offer.id);
        refunded++;
        continue;
      }

      if (!offer.steamOfferId) { pending++; continue; }

      const state = await steamBot.getOfferState(offer.steamOfferId);

      if (state === 'ACCEPTED') {
        await releaseToSeller(offer.id);
        released++;
      } else if (state === 'DECLINED' || state === 'CANCELED' || state === 'EXPIRED' || state === 'INVALID_ITEMS') {
        await refundBuyer(offer.id);
        refunded++;
      } else {
        await prisma.tradeOffer.update({
          where: { id: offer.id },
          data: { status: state === 'IN_ESCROW' ? 'IN_ESCROW' : 'SENT', lastSyncedAt: new Date() },
        });
        pending++;
      }
    } catch {
      pending++;
    }
  }

  return NextResponse.json({ success: true, released, refunded, pending, scanned: active.length });
}

async function releaseToSeller(tradeOfferId: string) {
  await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({ where: { id: tradeOfferId }, include: { listing: true } });
    if (!offer || offer.status === 'ACCEPTED') return;

    const priceMNT = Number(offer.listing.priceMNT);
    const fee = commissionMNT(priceMNT);
    const sellerNetMNT = priceMNT - fee;
    const sellerNetUSD = await mntToUsd(sellerNetMNT);
    const feeUSD = await mntToUsd(fee);

    // Buyer: clear locked escrow (already debited at purchase).
    await tx.wallet.update({
      where: { userId: offer.buyerId },
      data: { lockedMNT: { decrement: priceMNT }, lockedUSD: { decrement: Number(offer.listing.priceUSD) }, version: { increment: 1 } },
    });

    // Seller: credit net proceeds.
    const sellerWallet = await tx.wallet.findUnique({ where: { userId: offer.sellerId } });
    if (sellerWallet) {
      await tx.wallet.update({
        where: { userId: offer.sellerId },
        data: { balanceMNT: { increment: sellerNetMNT }, balanceUSD: { increment: sellerNetUSD }, version: { increment: 1 } },
      });
      await tx.transaction.createMany({
        data: [
          { walletId: sellerWallet.id, amountMNT: sellerNetMNT, amountUSD: sellerNetUSD, currency: 'MNT', type: 'SELL_REVENUE', status: 'COMPLETED', paymentProvider: 'WALLET', referenceId: offer.listingId },
          { walletId: sellerWallet.id, amountMNT: fee, amountUSD: feeUSD, currency: 'MNT', type: 'COMMISSION_FEE', status: 'COMPLETED', paymentProvider: 'SYSTEM', referenceId: offer.listingId },
        ],
      });
    }

    await tx.tradeOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', lastSyncedAt: new Date() } });
    await tx.listing.update({ where: { id: offer.listingId }, data: { status: 'SOLD' } });
    await tx.transaction.updateMany({ where: { referenceId: offer.listingId, type: 'BUY_PAYMENT', status: 'PENDING' }, data: { status: 'COMPLETED' } });

    await tx.notification.createMany({
      data: [
        { userId: offer.buyerId, title: 'Trade Complete', message: 'Your CS2 skin has been delivered to your inventory.', type: 'TRADE', link: '/trades' },
        { userId: offer.sellerId, title: 'Payout Released', message: `\u20ae${sellerNetMNT.toLocaleString()} credited (after ${(fee).toLocaleString()} commission).`, type: 'WALLET', link: '/wallet' },
      ],
    });
  });
}

async function refundBuyer(tradeOfferId: string) {
  await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({ where: { id: tradeOfferId }, include: { listing: true } });
    if (!offer || ['ACCEPTED', 'CANCELLED', 'DECLINED', 'EXPIRED', 'DISPUTED'].includes(offer.status)) return;

    const priceMNT = Number(offer.listing.priceMNT);
    const priceUSD = Number(offer.listing.priceUSD);

    await tx.wallet.update({
      where: { userId: offer.buyerId },
      data: {
        lockedMNT: { decrement: priceMNT }, lockedUSD: { decrement: priceUSD },
        balanceMNT: { increment: priceMNT }, balanceUSD: { increment: priceUSD },
        version: { increment: 1 },
      },
    });

    const wallet = await tx.wallet.findUnique({ where: { userId: offer.buyerId } });
    if (wallet) {
      await tx.transaction.create({
        data: { walletId: wallet.id, amountMNT: priceMNT, amountUSD: priceUSD, currency: 'MNT', type: 'REFUND', status: 'COMPLETED', paymentProvider: 'WALLET', referenceId: offer.listingId },
      });
    }

    await tx.tradeOffer.update({ where: { id: offer.id }, data: { status: 'CANCELLED', lastSyncedAt: new Date() } });
    await tx.listing.update({ where: { id: offer.listingId }, data: { status: 'ACTIVE' } });
    await tx.transaction.updateMany({ where: { referenceId: offer.listingId, type: 'BUY_PAYMENT', status: 'PENDING' }, data: { status: 'FAILED' } });

    await tx.notification.create({
      data: { userId: offer.buyerId, title: 'Purchase Refunded', message: `\u20ae${priceMNT.toLocaleString()} has been refunded to your wallet.`, type: 'WALLET', link: '/wallet' },
    });
  });
}
