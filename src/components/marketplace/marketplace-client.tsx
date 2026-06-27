'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { SkinCard, type SkinListing } from './skin-card';
import { Filters, SearchSortBar, DEFAULT_FILTERS, type FilterState } from './filters';
import { BuyModal } from './buy-modal';
import { SkinGridSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/providers/toast-provider';
import { useDebounce } from '@/hooks/use-debounce';

export function MarketplaceClient({ initialListings }: { initialListings: SkinListing[] }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [listings, setListings] = useState<SkinListing[]>(initialListings);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SkinListing | null>(null);

  const debouncedFilters = useDebounce(filters, 400);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const reqIdRef = useRef(0);

  const buildQuery = useCallback((f: FilterState, cur: string | null) => {
    const p = new URLSearchParams();
    if (f.search) p.set('search', f.search);
    if (f.type && f.type !== 'ALL') p.set('type', f.type);
    if (f.exterior && f.exterior !== 'ALL') p.set('exterior', f.exterior);
    if (f.rarity && f.rarity !== 'ALL') p.set('rarity', f.rarity);
    if (f.statTrak) p.set('statTrak', 'true');
    if (f.minPrice) p.set('minPrice', f.minPrice);
    if (f.maxPrice) p.set('maxPrice', f.maxPrice);
    if (f.maxFloat && f.maxFloat !== '1') p.set('maxFloat', f.maxFloat);
    if (f.sort) p.set('sort', f.sort);
    if (cur) p.set('cursor', cur);
    return p.toString();
  }, []);

  const fetchPage = useCallback(async (f: FilterState, cur: string | null, replace: boolean) => {
    const id = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/listings?${buildQuery(f, cur)}`, { cache: 'no-store' });
      const data = await res.json();
      if (id !== reqIdRef.current) return; // a newer request superseded this one
      const incoming: SkinListing[] = data.listings ?? [];
      setListings((prev) => (replace ? incoming : [...prev, ...incoming]));
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch {
      if (id === reqIdRef.current && replace) {
        // Fallback to client-side filtering of SSR data if the API is unavailable.
        setListings(initialListings);
        setHasMore(false);
      }
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [buildQuery, initialListings]);

  // Refetch from scratch whenever filters change.
  useEffect(() => {
    fetchPage(debouncedFilters, null, true);
  }, [debouncedFilters, fetchPage]);

  // Infinite scroll via IntersectionObserver.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && cursor) {
        fetchPage(debouncedFilters, cursor, false);
      }
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, cursor, debouncedFilters, fetchPage]);

  const counts = useMemo(() => ({ ALL: listings.length }), [listings.length]);

  const handleConfirm = async (listing: SkinListing) => {
    try {
      const res = await fetch('/api/marketplace/buy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purchase failed');
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      setSelected(null);
      toast('Escrow Locked', data.warning || `Secured ${listing.name}. Trade offer dispatched.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed';
      setSelected(null);
      toast(msg === 'Sign in required' ? 'Sign in required' : 'Purchase failed', msg, 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <Filters filters={filters} setFilters={setFilters} counts={counts} />
      </div>

      <div className="flex flex-col gap-5 lg:col-span-3">
        <SearchSortBar filters={filters} setFilters={setFilters} />

        {loading && listings.length === 0 ? (
          <SkinGridSkeleton count={9} />
        ) : listings.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-zinc-500"><Search className="h-6 w-6" /></div>
            <h3 className="text-sm font-bold text-white">No active listings found</h3>
            <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-400">Try clearing your search or adjusting filters.</p>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="btn-gold mt-4 px-4 py-2 text-xs">Clear Filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {listings.map((l) => <SkinCard key={l.id} listing={l} onBuy={setSelected} />)}
            </div>
            {loading && <SkinGridSkeleton count={3} />}
            <div ref={sentinelRef} className="h-4" />
            {!hasMore && listings.length > 0 && (
              <p className="py-4 text-center text-xs text-zinc-600">You&apos;ve reached the end of the market.</p>
            )}
          </>
        )}
      </div>

      <BuyModal listing={selected} onClose={() => setSelected(null)} onConfirm={handleConfirm} />
    </div>
  );
}
