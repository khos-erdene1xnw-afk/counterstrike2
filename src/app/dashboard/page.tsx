import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendingUp, Package, Repeat, Wallet, Star, ArrowUpRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const metadata = { title: 'Dashboard | CS2 GOLD' };

const XP_PER_LEVEL = 2000;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=required');

  const [activeListingsCount, activeListingsValue, completedTrades, lifetimeVolume] = await Promise.all([
    prisma.listing.count({ where: { sellerId: user.id, status: 'ACTIVE' } }),
    prisma.listing.aggregate({ _sum: { priceMNT: true }, where: { sellerId: user.id, status: 'ACTIVE' } }),
    prisma.tradeOffer.count({ where: { status: 'ACCEPTED', OR: [{ buyerId: user.id }, { sellerId: user.id }] } }),
    prisma.transaction.aggregate({
      _sum: { amountMNT: true },
      where: { type: 'BUY_PAYMENT', status: 'COMPLETED', wallet: { userId: user.id } },
    }),
  ]);

  const balanceMNT = Number(user.wallet?.balanceMNT ?? 0);
  const xpIntoLevel = user.xp % XP_PER_LEVEL;
  const xpPercent = Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100));

  const stats = [
    { label: 'Wallet Balance', value: `₮${balanceMNT.toLocaleString()}`, sub: `Locked: ₮${Number(user.wallet?.lockedMNT ?? 0).toLocaleString()}`, icon: Wallet, color: 'text-gold-400 bg-gold-500/10' },
    { label: 'Active Listings', value: `${activeListingsCount} Skin${activeListingsCount === 1 ? '' : 's'}`, sub: `₮${Number(activeListingsValue._sum.priceMNT ?? 0).toLocaleString()} value`, icon: Package, color: 'text-green-400 bg-green-500/10' },
    { label: 'Completed Trades', value: String(completedTrades), sub: 'all-time', icon: Repeat, color: 'text-indigo-400 bg-indigo-500/10' },
    { label: 'Total Volume', value: `₮${Number(lifetimeVolume._sum.amountMNT ?? 0).toLocaleString()}`, sub: 'as buyer, all-time', icon: TrendingUp, color: 'text-gold-400 bg-gold-500/10' },
  ];

  const healthChecks = [
    { label: 'Steam Verified', ok: user.isVerified },
    { label: 'Trade URL Set', ok: Boolean(user.tradeUrl) },
    { label: 'Email on File', ok: Boolean(user.email) },
    { label: 'Account Standing', ok: !user.isBanned },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Welcome back, {user.username ?? user.steamName}</h1>
          <p className="text-xs text-zinc-400">Here is your trading overview.</p>
        </div>
        <div className="glass-card flex items-center gap-3 rounded-xl px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-gradient text-black"><Star className="h-4 w-4" /></div>
          <div>
            <div className="text-[10px] uppercase text-zinc-400">Level {user.level} Trader</div>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${xpPercent}%` }} />
            </div>
            <div className="mt-0.5 text-[9px] text-zinc-500">{xpIntoLevel.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass-card flex items-center gap-3 rounded-xl p-4">
            <div className={`rounded-lg p-2.5 ${s.color}`}><s.icon className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] uppercase text-zinc-400">{s.label}</div>
              <div className="text-sm font-extrabold text-white">{s.value}</div>
              <div className="text-[10px] text-zinc-500">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { href: '/', label: 'Buy Skins', icon: Package },
              { href: '/inventory', label: 'Sell Skins', icon: ArrowUpRight },
              { href: '/wallet', label: 'Add Funds', icon: Wallet },
              { href: '/trades', label: 'Trade Hub', icon: Repeat },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-ink-900/60 p-4 transition hover:border-gold-500/30 hover:bg-ink-900">
                <a.icon className="h-5 w-5 text-gold-500" />
                <span className="text-xs font-semibold text-white">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Account Health</h3>
          <div className="flex flex-col gap-3 text-xs">
            {healthChecks.map((h) => <Row key={h.label} label={h.label} ok={h.ok} />)}
          </div>
          {!user.tradeUrl && (
            <Link href="/profile" className="mt-4 block rounded-lg border border-gold-500/30 bg-gold-500/5 px-3 py-2 text-center text-[11px] font-semibold text-gold-400 hover:bg-gold-500/10">
              Add your Steam trade URL to buy skins
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className={`flex items-center gap-1 font-semibold ${ok ? 'text-green-500' : 'text-red-500'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />{ok ? 'Active' : 'Pending'}
      </span>
    </div>
  );
}
