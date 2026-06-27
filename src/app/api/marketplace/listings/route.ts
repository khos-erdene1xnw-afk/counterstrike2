import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, logAudit } from '@/lib/auth';
import { createListingSchema } from '@/lib/validation';
import { getExchangeRate, commissionMNT, roundUSD } from '@/lib/money';
import { cacheDel } from '@/lib/redis';

const PAGE_SIZE = 24;

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const search = sp.get('search')?.trim() ?? '';
  const type = sp.get('type') ?? '';
  const weapon = sp.get('weapon') ?? '';
  const exterior = sp.get('exterior') ?? '';
  const rarity = sp.get('rarity') ?? '';
  const statTrak = sp.get('statTrak') === 'true';
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const maxFloat = sp.get('maxFloat') ? Number(sp.get('maxFloat')) : undefined;
  const sort = sp.get('sort') ?? 'newest';
  const cursor = sp.get('cursor') ?? undefined;

  const skinFilter: Prisma.SkinWhereInput = {
    ...(type && type !== 'ALL' ? { type } : {}),
    ...(weapon ? { weapon } : {}),
    ...(exterior && exterior !== 'ALL' ? { exterior } : {}),
    ...(rarity ? { rarity } : {}),
    ...(statTrak ? { isStatTrak: true } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const where: Prisma.ListingWhereInput = {
    status: 'ACTIVE',
    ...(minPrice !== undefined || maxPrice !== undefined
      ? { priceMNT: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } }
      : {}),
    ...(maxFloat !== undefined ? { floatValue: { lte: maxFloat } } : {}),
    skin: skinFilter,
  };

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    sort === 'price_asc' ? { priceMNT: 'asc' }
    : sort === 'price_desc' ? { priceMNT: 'desc' }
    : sort === 'popular' ? { viewCount: 'desc' }
    : { createdAt: 'desc' };

  const rows = await prisma.listing.findMany({
    where,
    orderBy,
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { skin: true, seller: { select: { username: true, level: true, steamAvatar: true, ratingAvg: true, isVerified: true } } },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const listings = page.map((r) => ({
    id: r.id,
    name: r.skin.name,
    type: r.skin.type,
    weapon: r.skin.weapon,
    exterior: r.skin.exterior,
    rarity: r.skin.rarity,
    isStatTrak: r.skin.isStatTrak,
    imageUrl: r.skin.imageUrl,
    priceMNT: Number(r.priceMNT),
    floatValue: r.floatValue ? Number(r.floatValue) : 0,
    seller: {
      username: r.seller.username ?? 'Trader',
      level: r.seller.level,
      steamAvatar: r.seller.steamAvatar,
      rating: Number(r.seller.ratingAvg),
      verified: r.seller.isVerified,
    },
  }));

  return NextResponse.json({ listings, nextCursor: hasMore ? page[page.length - 1].id : null });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.isBanned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 });

    const body = await request.json();
    const parsed = createListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { assetId, skinName, priceMNT } = parsed.data;
    const skinData = body.skinData ?? {};

    const rate = await getExchangeRate();
    const priceUSD = roundUSD(priceMNT / rate);
    const commMNT = commissionMNT(priceMNT);
    const commUSD = roundUSD(commMNT / rate);

    const skin = await prisma.skin.upsert({
      where: { name: skinName },
      update: {
        imageUrl: skinData.imageUrl ?? undefined,
      },
      create: {
        name: skinName,
        marketHash: skinData.marketHash ?? skinName,
        type: skinData.type ?? 'Other',
        weapon: skinData.weapon ?? 'Unknown',
        exterior: skinData.exterior ?? 'Not Painted',
        rarity: skinData.rarity ?? 'Common',
        isStatTrak: Boolean(skinData.isStatTrak),
        imageUrl: skinData.imageUrl ?? '',
      },
    });

    const listing = await prisma.listing.create({
      data: {
        sellerId: user.id,
        skinId: skin.id,
        assetId,
        inspectLink: skinData.inspectLink ?? null,
        floatValue: skinData.floatValue ?? null,
        priceMNT,
        priceUSD,
        commissionMNT: commMNT,
        commissionUSD: commUSD,
        status: 'ACTIVE',
      },
      include: { skin: true },
    });

    await logAudit({ userId: user.id, action: 'LISTING_CREATED', details: { listingId: listing.id, priceMNT } });
    await cacheDel('listings:featured');

    return NextResponse.json({ success: true, listing });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Sign in required' : msg }, { status });
  }
}
