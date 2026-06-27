import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, logAudit } from '@/lib/auth';
import { exchangeRateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const admin = await requireRole(['ADMIN']);
    const body = await request.json();
    const parsed = exchangeRateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const existing = await prisma.exchangeRate.findFirst();
    const record = existing
      ? await prisma.exchangeRate.update({ where: { id: existing.id }, data: { rate: parsed.data.rate, source: parsed.data.source } })
      : await prisma.exchangeRate.create({ data: { baseCurrency: 'USD', targetCurrency: 'MNT', rate: parsed.data.rate, source: parsed.data.source } });

    await logAudit({
      userId: admin.id,
      action: 'ADMIN_RATE_CHANGE',
      details: { rate: parsed.data.rate, source: parsed.data.source },
    });

    return NextResponse.json({ success: true, rate: Number(record.rate) });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'UNAUTHORIZED' ? 401 : msg === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
