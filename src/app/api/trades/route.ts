import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await requireUser();

    const offers = await prisma.tradeOffer.findMany({
      where: {
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
        status: { in: ['CREATED', 'SENT', 'CONFIRMATION_NEEDED', 'IN_ESCROW', 'DISPUTED'] },
      },
      include: {
        listing: { include: { skin: true } },
        buyer: { select: { username: true, steamId: true } },
        seller: { select: { username: true, steamId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const trades = offers.map((o) => ({
      id: o.id,
      skinName: o.listing.skin.name,
      imageUrl: o.listing.skin.imageUrl,
      priceMNT: Number(o.listing.priceMNT),
      buyer: o.buyer.username ?? o.buyer.steamId,
      seller: o.seller.username ?? o.seller.steamId,
      code: o.securityCode,
      status: o.status,
      isBuyer: o.buyerId === user.id,
      escrowDays: o.escrowDays,
      expiresAt: o.expiresAt,
    }));

    return NextResponse.json({ trades });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}
