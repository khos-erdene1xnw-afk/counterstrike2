import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'MODERATOR']);

    const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);

    const [users, activeListings, completedTrades, openDisputes, pendingWithdrawals, commissionAgg, depositAgg, recentTx] =
      await Promise.all([
        prisma.user.count(),
        prisma.listing.count({ where: { status: 'ACTIVE' } }),
        prisma.tradeOffer.count({ where: { status: 'ACCEPTED' } }),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        prisma.withdrawal.count({ where: { status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] } } }),
        prisma.transaction.aggregate({ _sum: { amountMNT: true }, where: { type: 'COMMISSION_FEE', status: 'COMPLETED' } }),
        prisma.transaction.aggregate({ _sum: { amountMNT: true }, where: { type: 'DEPOSIT', status: 'COMPLETED' } }),
        prisma.transaction.findMany({ where: { createdAt: { gte: since } }, select: { type: true, amountMNT: true, createdAt: true } }),
      ]);

    // Build a 14-day revenue/volume series.
    const days: { date: string; revenue: number; volume: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      days.push({ date: d.toISOString().slice(5, 10), revenue: 0, volume: 0 });
    }
    for (const tx of recentTx) {
      const key = tx.createdAt.toISOString().slice(5, 10);
      const bucket = days.find((x) => x.date === key);
      if (!bucket) continue;
      if (tx.type === 'COMMISSION_FEE') bucket.revenue += Number(tx.amountMNT);
      if (tx.type === 'BUY_PAYMENT') bucket.volume += Number(tx.amountMNT);
    }

    return NextResponse.json({
      kpis: {
        users,
        activeListings,
        completedTrades,
        openDisputes,
        pendingWithdrawals,
        totalCommissionMNT: Number(commissionAgg._sum.amountMNT ?? 0),
        totalDepositsMNT: Number(depositAgg._sum.amountMNT ?? 0),
      },
      series: days,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'UNAUTHORIZED' ? 401 : msg === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
