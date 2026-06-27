'use client';

import Image from 'next/image';
import { X, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useCurrency } from '@/providers/currency-provider';
import type { SkinListing } from './skin-card';

export function BuyModal({
  listing,
  onClose,
  onConfirm,
}: {
  listing: SkinListing | null;
  onClose: () => void;
  onConfirm: (listing: SkinListing) => Promise<void>;
}) {
  const { format, rate } = useCurrency();
  const [loading, setLoading] = useState(false);

  if (!listing) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(listing);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="glass-card-gold animate-fade-in relative w-full max-w-md rounded-2xl p-6">
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-zinc-800 pb-4 text-center">
          <h3 className="text-base font-bold text-white">Secure P2P Purchase</h3>
          <p className="mt-1 text-xs text-zinc-400">CS2GOLD escrow secures your funds until trade receipt.</p>
        </div>

        <div className="my-5 flex items-center gap-4 rounded-xl border border-zinc-900 bg-ink-950 p-3">
          <Image src={listing.imageUrl} alt={listing.name} width={64} height={64} unoptimized className="h-16 w-16 rounded border border-zinc-800 object-contain" />
          <div>
            <div className="text-xs font-bold text-white">{listing.name}</div>
            <div className="mt-0.5 text-[10px] text-zinc-400">{listing.exterior} (Float: {listing.floatValue.toFixed(6)})</div>
            <div className="mt-1 text-[10px] font-semibold text-gold-500">
              {listing.isStatTrak ? '★ StatTrak™ ' : ''}{listing.rarity}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <Row label="Seller" value={listing.seller.username} />
          <Row label="Price" value={format(listing.priceMNT)} bold />
          <Row label="Equivalent USD" value={`$${(listing.priceMNT / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} gold />
        </div>

        <div className="my-5 flex items-start gap-2.5 rounded-xl border border-red-500/10 bg-red-500/5 p-3 text-[10px] leading-relaxed text-zinc-400">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
          <div>
            <span className="font-bold text-white">Security check:</span> Only accept a Steam trade offer that includes your unique authorization code. Ignore any offer that does not match.
          </div>
        </div>

        <button onClick={handleConfirm} disabled={loading} className="btn-gold flex w-full items-center justify-center gap-2 py-3 text-xs disabled:opacity-60">
          {loading ? 'Locking escrow...' : 'Securely Buy Skin (Escrow Lock)'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold, gold }: { label: string; value: string; bold?: boolean; gold?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-zinc-400">{label}:</span>
      <span className={bold ? 'font-extrabold text-white' : gold ? 'font-semibold text-gold-500' : 'font-semibold text-white'}>{value}</span>
    </div>
  );
}
