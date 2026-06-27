'use client';

import { useEffect, useState } from 'react';
import { Users, ShoppingBag, ShieldAlert, Settings, TrendingUp, Banknote, Repeat, Check, X } from 'lucide-react';
import { useCurrency } from '@/providers/currency-provider';
import { useToast } from '@/providers/toast-provider';
import { RevenueChart } from './revenue-chart';
import { cn } from '@/lib/utils';

interface Kpis { users: number; activeListings: number; completedTrades: number; openDisputes: number; pendingWithdrawals: number; totalCommissionMNT: number; totalDepositsMNT: number; }
interface Point { date: string; revenue: number; volume: number; }
interface Withdrawal { id: string; amountMNT: string; bankName: string; bankAccount: string; accountName: string; status: string; user: { username: string | null; steamId: string }; }

const EMPTY_KPIS: Kpis = { users: 0, activeListings: 0, completedTrades: 0, openDisputes: 0, pendingWithdrawals: 0, totalCommissionMNT: 0, totalDepositsMNT: 0 };
const EMPTY_SERIES: Point[] = [];

export function AdminClient() {
  const { rate } = useCurrency();
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'withdrawals' | 'settings'>('overview');
  const [kpis, setKpis] = useState<Kpis>(EMPTY_KPIS);
  const [series, setSeries] = useState<Point[]>(EMPTY_SERIES);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateInput, setRateInput] = useState(rate);

  useEffect(() => {
    fetch('/api/admin/analytics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.kpis) { setKpis(d.kpis); setSeries(d.series ?? []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch('/api/admin/withdrawals', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.items) setWithdrawals(d.items); })
      .catch(() => {});
  }, []);

  const applyRate = async () => {
    if (rateInput <= 0) return toast('Invalid rate', 'Rate must be positive.', 'error');
    try {
      const res = await fetch('/api/admin/exchange-rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rate: rateInput, source: 'MANUAL' }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast('Exchange Rate Updated', `1 USD = \u20ae${rateInput.toLocaleString()}.`, 'success');
    } catch (e) {
      toast('Update failed', e instanceof Error ? e.message : 'Admin role required', 'error');
    }
  };

  const reviewWithdrawal = async (id: string, action: 'COMPLETE' | 'REJECT') => {
    setWithdrawals((prev) => prev.filter((w) => w.id !== id));
    try {
      await fetch('/api/admin/withdrawals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      toast(action === 'COMPLETE' ? 'Payout Completed' : 'Withdrawal Rejected', 'The user has been notified.', 'success');
    } catch {
      toast('Action failed', 'Could not update the withdrawal.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1 self-start rounded-xl border border-zinc-800 bg-ink-900/80 p-1">
        {(['overview', 'withdrawals', 'settings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-lg px-4 py-2 text-xs font-bold capitalize transition', tab === t ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white')}>
            {t}{t === 'withdrawals' && kpis.pendingWithdrawals > 0 ? ` (${kpis.pendingWithdrawals})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={Users} color="text-gold-500 bg-gold-500/10" label="Total Users" value={kpis.users.toLocaleString()} />
            <Stat icon={ShoppingBag} color="text-green-400 bg-green-500/10" label="Active Listings" value={kpis.activeListings.toLocaleString()} />
            <Stat icon={Repeat} color="text-indigo-400 bg-indigo-500/10" label="Completed Trades" value={kpis.completedTrades.toLocaleString()} />
            <Stat icon={ShieldAlert} color="text-red-400 bg-red-500/10" label="Open Disputes" value={kpis.openDisputes.toLocaleString()} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="glass-card rounded-2xl p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Revenue & Volume (14 days)</h3>
                <TrendingUp className="h-4 w-4 text-gold-500" />
              </div>
              {loading ? (
                <div className="flex h-[260px] items-center justify-center text-xs text-zinc-500">Loading analytics...</div>
              ) : series.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-xs text-zinc-500">No revenue data yet.</div>
              ) : (
                <RevenueChart data={series} />
              )}
            </div>
            <div className="flex flex-col gap-4">
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400"><Banknote className="h-4 w-4 text-gold-500" /> Commission Earned</div>
                <div className="mt-3 text-2xl font-extrabold text-white">\u20ae{kpis.totalCommissionMNT.toLocaleString()}</div>
                <div className="text-xs text-gold-500/80">${(kpis.totalCommissionMNT / rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Total Deposits</div>
                <div className="mt-3 text-2xl font-extrabold text-white">\u20ae{kpis.totalDepositsMNT.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Lifetime QPay volume</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'withdrawals' && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Pending Withdrawals</h3>
          {withdrawals.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No pending withdrawals.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {withdrawals.map((wd) => (
                <div key={wd.id} className="flex flex-col items-start justify-between gap-3 rounded-xl border border-zinc-900 bg-ink-950 p-4 sm:flex-row sm:items-center">
                  <div className="text-xs">
                    <div className="font-bold text-white">\u20ae{Number(wd.amountMNT).toLocaleString()} <span className="text-zinc-500">\u2192 {wd.bankName}</span></div>
                    <div className="mt-1 text-[11px] text-zinc-400">{wd.accountName} \u00b7 {wd.bankAccount} \u00b7 @{wd.user.username ?? wd.user.steamId}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => reviewWithdrawal(wd.id, 'COMPLETE')} className="flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-green-400"><Check className="h-3.5 w-3.5" /> Mark Paid</button>
                    <button onClick={() => reviewWithdrawal(wd.id, 'REJECT')} className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/20"><X className="h-3.5 w-3.5" /> Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
            <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400"><span>Exchange Rate</span><Settings className="h-4 w-4 text-gold-500" /></h3>
            <label className="text-xs font-bold text-zinc-400">Manual Rate (1 USD \u2192 MNT)</label>
            <input type="number" value={rateInput} onChange={(e) => setRateInput(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-ink-900 px-3 py-2.5 text-xs font-bold text-white focus:border-gold-500 focus:outline-none" />
            <button onClick={applyRate} className="btn-gold w-full py-2.5 text-xs">Apply Custom Rate</button>
            <p className="text-[10px] text-zinc-500">Setting a manual rate disables automatic hourly sync until reverted.</p>
          </div>
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Platform Configuration</h3>
            <ConfigRow label="Commission Rate" value="2.5%" />
            <ConfigRow label="Min Deposit" value="\u20ae1,000" />
            <ConfigRow label="Min Withdrawal" value="\u20ae5,000" />
            <ConfigRow label="Trade Offer Expiry" value="12 hours" />
            <ConfigRow label="QPay Provider" value="Connected" ok />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, color, label, value }: { icon: React.ComponentType<{ className?: string }>; color: string; label: string; value: string }) {
  return (
    <div className="glass-card flex items-center gap-3 rounded-xl p-4">
      <div className={cn('rounded-lg p-2', color)}><Icon className="h-5 w-5" /></div>
      <div><div className="text-[10px] uppercase text-zinc-400">{label}</div><span className="text-sm font-extrabold text-white">{value}</span></div>
    </div>
  );
}
function ConfigRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 py-2 text-xs last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className={cn('font-bold', ok ? 'text-green-500' : 'text-white')}>{value}</span>
    </div>
  );
}
