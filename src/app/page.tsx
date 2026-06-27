import { MarketplaceClient } from '@/components/marketplace/marketplace-client';
import { prisma } from '@/lib/prisma';
import type { SkinListing } from '@/components/marketplace/skin-card';
import { AlertTriangle, Info } from 'lucide-react';

export const revalidate = 30;

async function getListings(): Promise<{ listings: SkinListing[]; dbError: boolean }> {
  try {
    const rows = await prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      include: { skin: true, seller: { select: { username: true, level: true, steamAvatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const listings = rows.map((r) => ({
      id: r.id,
      name: r.skin.name,
      type: r.skin.type,
      weapon: r.skin.weapon,
      exterior: r.skin.exterior,
      rarity: r.skin.rarity,
      isStatTrak: r.skin.isStatTrak,
      imageUrl: r.skin.imageUrl,
      priceMNT: Number(r.priceMNT),
      floatValue: 0,
      seller: { username: r.seller.username ?? 'Trader', level: r.seller.level, steamAvatar: r.seller.steamAvatar },
    }));
    return { listings, dbError: false };
  } catch {
    // A failed DB read must never be disguised as "no listings" or, worse,
    // as fabricated sample listings a buyer could click "Buy Now" on.
    return { listings: [], dbError: true };
  }
}

export default async function MarketplacePage() {
  const { listings, dbError } = await getListings();
  return (
    <div className="flex flex-col gap-6">
      {dbError ? (
        <div className="glass-card flex items-center gap-3 rounded-xl border-red-500/30 p-3.5">
          <div className="rounded-lg bg-red-500/10 p-2 text-red-400"><AlertTriangle className="h-5 w-5" /></div>
          <div>
            <div className="text-xs font-bold text-white">Marketplace temporarily unavailable</div>
            <div className="mt-0.5 text-[11px] text-zinc-400">We couldn&apos;t load listings right now. Please refresh in a moment.</div>
          </div>
        </div>
      ) : (
        <div className="glass-card-gold flex flex-col items-center justify-between gap-2 rounded-xl border-gold-500/20 p-3.5 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold-500/10 p-2 text-gold-500"><Info className="h-5 w-5" /></div>
            <div>
              <div className="text-xs font-bold text-white">Premium CS2 Skin P2P Marketplace</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">Primary pricing in Mongolian Tugrik (MNT) with automatic live USD conversion.</div>
            </div>
          </div>
        </div>
      )}
      <MarketplaceClient initialListings={listings} />
    </div>
  );
}
