'use client';

import { useCurrency } from '@/providers/currency-provider';
import { cn } from '@/lib/utils';

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className="flex items-center rounded-lg border border-zinc-800 bg-ink-900/80 p-0.5">
      <button
        onClick={() => setCurrency('MNT')}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition',
          currency === 'MNT' ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white'
        )}
        aria-pressed={currency === 'MNT'}
      >
        ₮ <span className="hidden md:inline">MNT</span>
      </button>
      <button
        onClick={() => setCurrency('USD')}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition',
          currency === 'USD' ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white'
        )}
        aria-pressed={currency === 'USD'}
      >
        $ <span className="hidden md:inline">USD</span>
      </button>
    </div>
  );
}
