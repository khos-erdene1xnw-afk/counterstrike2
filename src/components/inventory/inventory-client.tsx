'use client';

import { useState } from 'react';
import Image from 'next/image';
import { RefreshCw, Info, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/providers/toast-provider';

interface InvItem {
  assetId: string;
  name: string;
  marketHash: string;
  type: string;
  weapon: string;
  rarity: string;
  exterior: string;
  isStatTrak: boolean;
  imageUrl: string;
  inspectLink: string | null;
  tradable: boolean;
}

export function InventoryClient({ steamId, username, hasTradeUrl }: { steamId: string; username: string; hasTradeUrl: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<InvItem[]>([]);
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [listingTarget, setListingTarget] = useState<InvItem | null>(null);

  const sync = async () => {
    setSyncing(true);
    toast('Connecting to Steam', 'Requesting your CS2 inventory from the Steam Web API...', 'info');
    try {
      const res = await fetch(`/api/steam/inventory?steamId=${steamId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load inventory');
      const tradable = (data.items as InvItem[]).filter((i) => i.tradable);
      setItems(tradable);
      setSynced(true);
      toast('Inventory Synced', `Loaded ${tradable.length} tradable CS2 item${tradable.length === 1 ? '' : 's'}.`, 'success');
    } catch (e) {
      toast('Sync failed', e instanceof Error ? e.message : 'Could not load your Steam inventory.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const onListed = (assetId: string) => {
    setItems((prev) => prev.filter((i) => i.assetId !== assetId));
    setListingTarget(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
          <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
            <span>Steam Account</span><RefreshCw className="h-4 w-4 text-gold-500" />
          </h3>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-900 bg-ink-950 p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gold-gradient" />
              <div>
                <div className="text-xs font-extrabold text-white">{username}</div>
                <div className="text-[10px] text-zinc-400">SteamID: {steamId}</div>
              </div>
            </div>
            <hr className="border-zinc-900" />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Status:</span>
              <span className="flex items-center gap-1 font-bold text-green-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> {synced ? 'Synced' : 'Not synced'}</span>
            </div>
          </div>
          {!hasTradeUrl && (
            <p className="rounded-lg border border-gold-500/30 bg-gold-500/5 px-3 py-2 text-[11px] text-gold-400">
              Add your Steam trade URL in your profile before listing items — buyers need it to receive delivery.
            </p>
          )}
          <button onClick={sync} disabled={syncing} className="btn-gold flex w-full items-center justify-center gap-2 py-2.5 text-xs disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> Sync CS2 Inventory
          </button>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Select Skin to Sell</h3>
              <p className="text-xs text-zinc-400">Pick a tradable item to list on the marketplace.</p>
            </div>
            <Badge variant="zinc">{items.length} Items</Badge>
          </div>
          {!synced ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-zinc-500"><Info className="h-6 w-6" /></div>
              <h4 className="text-xs font-bold text-zinc-300">Sync with Steam Web API</h4>
              <p className="mx-auto mt-1 max-w-xs text-[11px] text-zinc-500">Click sync to fetch your CS2 inventory. Your Steam inventory privacy must be set to public.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">No tradable items found in your inventory.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => (
                <div key={item.assetId} className="glass-card flex flex-col justify-between rounded-xl border-t border-t-zinc-800 p-4 transition hover:border-gold-500/20">
                  <div>
                    <div className="relative mb-2.5 flex h-28 items-center justify-center rounded-lg border border-zinc-900 bg-ink-950/60 p-3">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} width={120} height={90} unoptimized className="max-h-full w-auto object-contain" />
                      ) : (
                        <div className="text-[10px] text-zinc-700">No image</div>
                      )}
                      <span className="absolute left-1.5 top-1.5"><Badge variant="green">Tradable</Badge></span>
                    </div>
                    <h4 className="line-clamp-2 text-[11px] font-bold leading-snug text-white">{item.name}</h4>
                    <div className="mt-1 text-[9px] text-zinc-500">{item.isStatTrak ? '★ StatTrak™ ' : ''}{item.rarity}</div>
                  </div>
                  <button
                    onClick={() => setListingTarget(item)}
                    disabled={!hasTradeUrl}
                    className="btn-gold mt-3.5 w-full py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    List to Sell
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {listingTarget && (
        <ListingDialog item={listingTarget} onClose={() => setListingTarget(null)} onListed={onListed} />
      )}
    </div>
  );
}

function ListingDialog({ item, onClose, onListed }: { item: InvItem; onClose: () => void; onListed: (assetId: string) => void }) {
  const { toast } = useToast();
  const [priceMNT, setPriceMNT] = useState(250000);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!priceMNT || priceMNT <= 0) return toast('Invalid price', 'Enter a positive MNT price.', 'error');
    setSubmitting(true);
    try {
      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: item.assetId,
          skinName: item.name,
          priceMNT,
          skinData: {
            marketHash: item.marketHash,
            type: item.type,
            weapon: item.weapon,
            exterior: item.exterior,
            rarity: item.rarity,
            isStatTrak: item.isStatTrak,
            imageUrl: item.imageUrl,
            inspectLink: item.inspectLink,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create listing');
      toast('Listing Created', `${item.name} listed at ₮${priceMNT.toLocaleString()}.`, 'success');
      onListed(item.assetId);
    } catch (e) {
      toast('Listing failed', e instanceof Error ? e.message : 'Try again', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass-card-gold w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">List Item for Sale</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-900 bg-ink-950 p-3">
          {item.imageUrl && <Image src={item.imageUrl} alt={item.name} width={48} height={36} unoptimized className="object-contain" />}
          <div className="text-xs font-bold text-white">{item.name}</div>
        </div>
        <label className="text-xs font-bold text-zinc-400">Selling Price (MNT)</label>
        <div className="relative mt-2">
          <span className="absolute left-3.5 top-3.5 text-xs font-bold text-zinc-500">₮</span>
          <input
            type="number"
            value={priceMNT}
            onChange={(e) => setPriceMNT(Number(e.target.value))}
            className="w-full rounded-xl border border-zinc-800 bg-ink-900 py-3 pl-8 pr-4 text-xs font-bold text-white focus:border-gold-500 focus:outline-none"
          />
        </div>
        <button onClick={submit} disabled={submitting} className="btn-gold mt-4 w-full py-2.5 text-xs disabled:opacity-60">
          {submitting ? 'Listing...' : 'Confirm Listing'}
        </button>
      </div>
    </div>
  );
}
