'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type Currency = 'MNT' | 'USD';

interface CurrencyContextValue {
  currency: Currency;
  rate: number; // 1 USD = `rate` MNT
  setCurrency: (c: Currency) => void;
  format: (mntValue: number) => string;
  convert: (mntValue: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children, initialRate = 3420 }: { children: ReactNode; initialRate?: number }) {
  const [currency, setCurrencyState] = useState<Currency>('MNT');
  const [rate, setRate] = useState<number>(initialRate);

  // Load saved preference
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('currency')) as Currency | null;
    if (saved === 'MNT' || saved === 'USD') setCurrencyState(saved);
  }, []);

  // Live exchange-rate refresh every 5 minutes
  useEffect(() => {
    let active = true;
    const fetchRate = async () => {
      try {
        const res = await fetch('/api/exchange-rate', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.rate) setRate(Number(data.rate));
      } catch { /* keep last good rate */ }
    };
    fetchRate();
    const id = setInterval(fetchRate, 5 * 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== 'undefined') localStorage.setItem('currency', c);
    // Persist server-side preference (best-effort)
    fetch('/api/user/currency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: c }),
    }).catch(() => {});
  }, []);

  const convert = useCallback((mntValue: number) => (currency === 'MNT' ? mntValue : mntValue / rate), [currency, rate]);

  const format = useCallback((mntValue: number) => {
    if (currency === 'MNT') return `₮${Math.round(mntValue).toLocaleString('en-US')}`;
    return `$${(mntValue / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currency, rate]);

  return (
    <CurrencyContext.Provider value={{ currency, rate, setCurrency, format, convert }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
