import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Star, Shield, TrendingUp, Calendar } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TradeUrlCard } from '@/components/profile/trade-url-card';

export const metadata = { title: 'Profile | CS2 GOLD' };

const XP_PER_LEVEL = 2000;

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=required');

  const [totalTrades, terminalTrades, acceptedTrades] = await Promise.all([
    prisma.tradeOffer.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] } }),
    prisma.tradeOffer.count({
      where: {
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
        status: { in: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'] },
      },
    }),
    prisma.tradeOffer.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }], status: 'ACCEPTED' } }),
  ]);

  const successRate = terminalTrades > 0 ? Math.round((acceptedTrades / terminalTrades) * 100) : 100;
  const xpIntoLevel = user.xp % XP_PER_LEVEL;
  const xpPercent = Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100));
  const memberSince = user.createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const stats = [
    { label: 'Trade Success', value: terminalTrades > 0 ? `${successRate}%` : '—', icon: Shield, color: 'text-green-400 bg-green-500/10' },
    { label: 'Total Trades', value: String(totalTrades), icon: TrendingUp, color: 'text-gold-400 bg-gold-500/10' },
    { label: 'Reputation', value: user.ratingCount > 0 ? `${Number(user.ratingAvg).toFixed(2)} / 5` : 'No ratings yet', icon: Star, color: 'text-gold-400 bg-gold-500/10' },
    { label: 'Member Since', value: memberSince, icon: Calendar, color: 'text-indigo-400 bg-indigo-500/10' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-card-gold flex flex-col items-center gap-5 rounded-2xl p-6 sm:flex-row">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gold-gradient">
          {user.steamAvatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.steamAvatar} alt={user.username ?? 'avatar'} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="font-display text-xl font-bold text-white">{user.username ?? user.steamName}</h1>
            <Badge variant="gold">LVL {user.level}</Badge>
            {user.isVerified && <Badge variant="green">Verified</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-400">SteamID: {user.steamId} · Joined {memberSince}</p>
          <div className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-ink-700">
            <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${xpPercent}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">{xpIntoLevel.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP to Level {user.level + 1}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass-card flex items-center gap-3 rounded-xl p-4">
            <div className={`rounded-lg p-2.5 ${s.color}`}><s.icon className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] uppercase text-zinc-400">{s.label}</div>
              <div className="text-sm font-extrabold text-white">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-xl">
        <TradeUrlCard initialTradeUrl={user.tradeUrl} />
      </div>
    </div>
  );
}
