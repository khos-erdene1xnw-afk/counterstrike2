'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterState {
  search: string;
  type: string;
  exterior: string;
  rarity: string;
  statTrak: boolean;
  minPrice: string;
  maxPrice: string;
  maxFloat: string;
  sort: string;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '', type: 'ALL', exterior: 'ALL', rarity: 'ALL',
  statTrak: false, minPrice: '', maxPrice: '', maxFloat: '', sort: 'newest',
};

const TYPES = ['ALL', 'Knife', 'Gloves', 'Rifle', 'Pistol', 'SMG', 'Sticker'];
const EXTERIORS = ['ALL', 'Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const RARITIES = ['ALL', 'Consumer', 'Industrial', 'Mil-Spec', 'Restricted', 'Classified', 'Covert', 'Contraband'];

export function Filters({
  filters,
  setFilters,
  counts,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  counts: Record<string, number>;
}) {
  const update = (patch: Partial<FilterState>) => setFilters({ ...filters, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
        <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
          <span>Categories</span>
          <SlidersHorizontal className="h-4 w-4 text-gold-500" />
        </h3>
        <div className="flex flex-col gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => update({ type: t })}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition',
                filters.type === t
                  ? 'border border-gold-500/30 bg-gold-500/15 text-gold-400'
                  : 'text-zinc-300 hover:bg-ink-900 hover:text-white'
              )}
            >
              <span>{t === 'ALL' ? 'All Weapons' : t}</span>
              {counts[t] !== undefined && <span className="rounded-md bg-ink-700 px-1.5 text-[10px] text-zinc-400">{counts[t]}</span>}
            </button>
          ))}
        </div>

        <hr className="border-zinc-800" />

        <Field label="Wear Exterior">
          <select value={filters.exterior} onChange={(e) => update({ exterior: e.target.value })} className={selectClass}>
            {EXTERIORS.map((e) => <option key={e} value={e}>{e === 'ALL' ? 'All Wear' : e}</option>)}
          </select>
        </Field>

        <Field label="Rarity">
          <select value={filters.rarity} onChange={(e) => update({ rarity: e.target.value })} className={selectClass}>
            {RARITIES.map((r) => <option key={r} value={r}>{r === 'ALL' ? 'All Rarities' : r}</option>)}
          </select>
        </Field>

        <Field label="Price Range (MNT)">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" placeholder="Min" value={filters.minPrice} onChange={(e) => update({ minPrice: e.target.value })} className={inputClass} />
            <span className="text-zinc-600">\u2013</span>
            <input type="number" inputMode="numeric" placeholder="Max" value={filters.maxPrice} onChange={(e) => update({ maxPrice: e.target.value })} className={inputClass} />
          </div>
        </Field>

        <Field label={`Max Float: ${filters.maxFloat || '1.00'}`}>
          <input
            type="range" min="0" max="1" step="0.01"
            value={filters.maxFloat || '1'}
            onChange={(e) => update({ maxFloat: e.target.value })}
            className="w-full accent-gold-500"
          />
        </Field>

        <label className="mt-1 flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={filters.statTrak} onChange={(e) => update({ statTrak: e.target.checked })} className="h-4 w-4 rounded border-zinc-800 bg-ink-900 accent-gold-500" />
          <span className="select-none text-xs font-medium text-zinc-300">StatTrak\u2122 Only</span>
        </label>

        <button onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="mt-1 rounded-lg border border-zinc-800 py-2 text-xs font-semibold text-zinc-400 transition hover:border-gold-500/40 hover:text-white">
          Reset Filters
        </button>
      </div>
    </div>
  );
}

const selectClass = 'w-full rounded-lg border border-zinc-800 bg-ink-900 px-3 py-2 text-xs text-white focus:border-gold-500 focus:outline-none';
const inputClass = 'w-full rounded-lg border border-zinc-800 bg-ink-900 px-2.5 py-2 text-xs text-white focus:border-gold-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-zinc-400">{label}</span>
      {children}
    </div>
  );
}

export function SearchSortBar({ filters, setFilters }: { filters: FilterState; setFilters: (f: FilterState) => void }) {
  const update = (patch: Partial<FilterState>) => setFilters({ ...filters, ...patch });
  return (
    <div className="glass-card flex flex-col items-center justify-between gap-4 rounded-2xl p-4 sm:flex-row">
      <div className="relative w-full sm:max-w-md">
        <input type="text" value={filters.search} onChange={(e) => update({ search: e.target.value })} placeholder="Search skins, knives, attributes..." className="w-full rounded-xl border border-zinc-800 bg-ink-900/80 py-2 pl-9 pr-4 text-xs text-white transition focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500" />
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
      </div>
      <div className="flex w-full items-center gap-2.5 sm:w-auto">
        <span className="hidden whitespace-nowrap text-xs text-zinc-400 sm:inline">Sort By:</span>
        <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className="w-full rounded-lg border border-zinc-800 bg-ink-900 px-3 py-2 text-xs text-white focus:border-gold-500 focus:outline-none sm:w-44">
          <option value="newest">Newest Listings</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="popular">Most Viewed</option>
        </select>
      </div>
    </div>
  );
}
