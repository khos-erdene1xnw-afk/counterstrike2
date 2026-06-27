import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Triggered hourly by Vercel Cron. Pulls live USD->MNT rate.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let rate = Number(process.env.DEFAULT_USD_MNT_RATE ?? 3420);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
      const data = await res.json();
      if (data?.rates?.MNT) rate = Number(data.rates.MNT);
    } catch { /* keep fallback */ }

    const existing = await prisma.exchangeRate.findFirst();
    if (existing && existing.source === 'MANUAL') {
      return NextResponse.json({ skipped: true, reason: 'Manual override active', rate: Number(existing.rate) });
    }
    if (existing) {
      await prisma.exchangeRate.update({ where: { id: existing.id }, data: { rate, source: 'AUTOMATIC' } });
    } else {
      await prisma.exchangeRate.create({ data: { baseCurrency: 'USD', targetCurrency: 'MNT', rate, source: 'AUTOMATIC' } });
    }
    return NextResponse.json({ success: true, rate });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
