import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Expire ACTIVE listings older than 30 days.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.listing.updateMany({
    where: { status: 'ACTIVE', createdAt: { lt: cutoff } },
    data: { status: 'EXPIRED' },
  });
  return NextResponse.json({ success: true, expired: result.count });
}
