import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const record = await prisma.exchangeRate.findFirst({ orderBy: { updatedAt: 'desc' } });
    const rate = record ? Number(record.rate) : Number(process.env.DEFAULT_USD_MNT_RATE ?? 3420);
    const source = record?.source ?? 'AUTOMATIC';
    return NextResponse.json({ rate, source, updatedAt: record?.updatedAt ?? new Date().toISOString() });
  } catch {
    return NextResponse.json({ rate: Number(process.env.DEFAULT_USD_MNT_RATE ?? 3420), source: 'FALLBACK' });
  }
}
