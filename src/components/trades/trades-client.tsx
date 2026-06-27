'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CheckCircle2, Clock, Repeat, ShieldAlert } from 'lucide-react';
import { useCurrency } from '@/providers/currency-provider';
import { Badge } from '@/components/ui/badge';

interface Trade {
  id: string;
  skinName: string;
  imageUrl: string;
  priceMNT: number;
  buyer: string;
  seller: string;
  code: string;
  status: 'CREATED' | 'SENT' | 'CONFIRMATION_NEEDED' | 'IN_ESCROW' | 'DISPUTED';
  isBuyer: boolean;
  escrowDays: number;
  expiresAt: string | null;
}

const STATUS_LABEL: Record<Trade['status'], string> = {
  CREATED: 'Preparing',
  SENT: 'Awaiting Steam Confirmation',
  CONFIRMATION_NEEDED: 'Awaiting Steam Confirmation',
  IN_ESCROW: 'Steam Trade Hold',
  DISPUTED: 'Needs Attention',
};

const STATUS_VARIANT: Record<Trade['status'], 'gold' | 'red'> = {
  CREATED: 'gold',
  SENT: 'gold',
  CONFIRMATION_NEEDED: 'gold',
  IN_ESCROW: 'gold',
  DISPUTED: 'red',
};

export function TradesClient() {
  const { format } = useCurrency();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch('/api/trades', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setTrades(data.trades ?? []);
    } catch { /* ignore transient errors, keep showing last known state */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="glass-card rounded-2xl p-12 text-center text-xs text-zinc-500">Loading your trades...</div>;
  }

  if (trades.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-zinc-500"><Repeat className="h-6 w-6" /></div>
        <h4 className="text-xs font-bold text-zinc-300">No active trades</h4>
        <p className="mt-1 text-[11px] text-zinc-500">Trades you buy or sell will appear here while in escrow.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {trades.map((tr) => (
        <div key={tr.id} className="glass-card flex flex-col items-center justify-between gap-5 rounded-2xl border-t border-t-zinc-800 p-5 md:flex-row">
          <div className="flex w-full items-center gap-4 md:w-auto">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-zinc-900 bg-ink-950 p-2.5">
              {tr.imageUrl ? (
                <Image src={tr.imageUrl} alt={tr.skinName} width={56} height={56} unoptimized className="max-h-full w-auto object-contain" />
              ) : (
                <div className="text-[9px] text-zinc-700">No image</div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white">{tr.skinName}</span>
                <Badge variant={STATUS_VARIANT[tr.status]}>{STATUS_LABEL[tr.status]}</Badge>
                {tr.isBuyer && <Badge variant="zinc">You're buying</Badge>}
                {!tr.isBuyer && <Badge variant="zinc">You're selling</Badge>}
              </div>
              <div className="mt-1 flex flex-col gap-1.5 text-[10.5px] font-medium text-zinc-500 sm:flex-row sm:gap-4">
                <span>Seller: <strong className="text-zinc-300">{tr.seller}</strong></span>
                <span>Buyer: <strong className="text-zinc-300">{tr.buyer}</strong></span>
                <span>Price: <strong className="text-gold-500/90">{format(tr.priceMNT)}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col items-center justify-between gap-4 border-t border-zinc-900 pt-3 sm:flex-row md:w-auto md:border-0 md:pt-0">
            <div className="text-center sm:text-right">
              <div className="font-mono text-[9px] uppercase text-zinc-500">Anti-Scam Code</div>
              <div className="mt-1 inline-block rounded-lg border border-gold-500/30 bg-ink-900 px-3 py-1.5 font-mono text-xs font-extrabold tracking-wider text-gold-500">{tr.code}</div>
            </div>
            <StatusIndicator status={tr.status} escrowDays={tr.escrowDays} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusIndicator({ status, escrowDays }: { status: Trade['status']; escrowDays: number }) {
  if (status === 'DISPUTED') {
    return (
      <span className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400">
        <ShieldAlert className="h-4 w-4" /> Flagged for support review
      </span>
    );
  }
  if (status === 'IN_ESCROW') {
    return (
      <span className="flex items-center gap-1.5 rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-xs font-bold text-gold-400">
        <Clock className="h-4 w-4" /> Steam {escrowDays}-day hold in progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-ink-900 px-4 py-2 text-xs font-bold text-zinc-400">
      <CheckCircle2 className="h-4 w-4 text-gold-500" /> Confirm the trade offer in Steam
    </span>
  );
}
