'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { useToast } from '@/providers/toast-provider';

export function TradeUrlCard({ initialTradeUrl }: { initialTradeUrl: string | null }) {
  const { toast } = useToast();
  const [tradeUrl, setTradeUrl] = useState(initialTradeUrl ?? '');
  const [saved, setSaved] = useState(Boolean(initialTradeUrl));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/trade-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save trade URL');
      setSaved(true);
      toast('Trade URL Saved', 'Buyers can now send you items, and you can now buy on the marketplace.', 'success');
    } catch (e) {
      toast('Could not save', e instanceof Error ? e.message : 'Check the URL format and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
        <Link2 className="h-4 w-4 text-gold-500" /> Steam Trade URL
      </h3>
      <p className="text-[11px] text-zinc-500">Required to buy or sell skins. Find it on your Steam inventory privacy settings page.</p>
      <input
        value={tradeUrl}
        onChange={(e) => { setTradeUrl(e.target.value); setSaved(false); }}
        placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
        className="w-full rounded-xl border border-zinc-800 bg-ink-900 px-3 py-2.5 text-xs font-medium text-white focus:border-gold-500 focus:outline-none"
      />
      <button onClick={save} disabled={saving || !tradeUrl} className="btn-gold flex items-center justify-center gap-1.5 py-2.5 text-xs disabled:opacity-60">
        {saved ? <Check className="h-3.5 w-3.5" /> : null} {saving ? 'Saving...' : saved ? 'Saved' : 'Save Trade URL'}
      </button>
    </div>
  );
}
