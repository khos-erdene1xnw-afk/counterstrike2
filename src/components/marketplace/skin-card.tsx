'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useCurrency } from '@/providers/currency-provider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SkinListing {
  id: string;
  skinId?: string;
  name: string;
  type: string;
  weapon: string;
  exterior: string;
  rarity: string;
  isStatTrak: boolean;
  imageUrl: string;
  priceMNT: number;
  floatValue: number;
  seller: { username: string; level: number; steamAvatar?: string; rating?: number; verified?: boolean };
}

export function SkinCard({ listing, onBuy }: { listing: SkinListing; onBuy: (l: SkinListing) => void }) {
  const { format, currency, rate } = useCurrency();
  const [wished, setWished] = useState(false);
  const [pending, setPending] = useState(false);

  const secondary = currency === 'MNT'
    ? `$${(listing.priceMNT / rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `\u20ae${listing.priceMNT.toLocaleString()}`;

  const toggleWish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending || !listing.skinId) { setWished((w) => !w); return; }
    setPending(true);
    const next = !wished;
    setWished(next);
    try {
      if (next) {
        await fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId: listing.skinId }) });
      } else {
        await fetch(`/api/wishlist?skinId=${listing.skinId}`, { method: 'DELETE' });
      }
    } catch { /* optimistic */ } finally { setPending(false); }
  };

  return (
    <div className="glass-card group flex flex-col justify-between rounded-2xl border-t border-t-zinc-800 p-4 transition duration-300 hover:border-gold-500/30 hover:shadow-xl hover:shadow-gold-500/5">
      <div>
        <div className="mb-3 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
            <span className="font-bold text-zinc-400">{listing.seller.username}</span>
            <Badge variant="gold">LVL {listing.seller.level}</Badge>
            {listing.seller.verified && <Badge variant="green">✓</Badge>}
          </div>
          <button onClick={toggleWish} aria-label="Toggle wishlist" className="text-zinc-500 transition hover:text-gold-400">
            <Heart className={cn('h-4 w-4', wished && 'fill-gold-500 text-gold-500')} />
          </button>
        </div>

        <div className="relative mb-3 flex h-36 items-center justify-center rounded-xl border border-zinc-900 bg-ink-950/40 p-4">
          {listing.imageUrl ? (
            <Image src={listing.imageUrl} alt={listing.name} width={180} height={140} className="max-h-full w-auto object-contain drop-shadow-[0_10px_15px_rgba(212,175,55,0.15)]" unoptimized />
          ) : (
            <div className="text-xs text-zinc-700">No image</div>
          )}
          <div className="absolute bottom-2.5 right-2.5 rounded border border-zinc-800 bg-ink-900/90 px-1.5 py-0.5 font-mono text-[8.5px] text-zinc-400">
            Float: {listing.floatValue.toFixed(4)}
          </div>
        </div>

        <h4 className="line-clamp-1 text-xs font-extrabold leading-tight text-white">{listing.name}</h4>
        <div className="mt-1 flex items-center gap-1 text-[10px]">
          <span className={listing.isStatTrak ? 'font-semibold text-gold-500' : 'text-zinc-400'}>
            {listing.isStatTrak ? '\u2605 StatTrak\u2122 ' : ''}{listing.rarity} \u00b7 {listing.exterior}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-900/80 pt-3">
        <div>
          <div className="text-[10px] uppercase leading-none text-zinc-500">Price</div>
          <div className="mt-1 text-sm font-extrabold leading-none tracking-wide text-white">{format(listing.priceMNT)}</div>
          <div className="mt-0.5 text-[9px] leading-none text-zinc-500">{secondary}</div>
        </div>
        <button onClick={() => onBuy(listing)} className="btn-gold px-4 py-2 text-xs">Buy Now</button>
      </div>
    </div>
  );
}
