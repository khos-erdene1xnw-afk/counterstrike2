import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelInvoice } from '@/lib/qpay';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const stale = await prisma.paymentInvoice.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    take: 100,
  });
  let expired = 0;
  for (const inv of stale) {
    if (inv.qpayInvoiceId) await cancelInvoice(inv.qpayInvoiceId).catch(() => {});
    await prisma.paymentInvoice.update({ where: { id: inv.id }, data: { status: 'EXPIRED' } });
    expired++;
  }
  return NextResponse.json({ success: true, expired });
}
