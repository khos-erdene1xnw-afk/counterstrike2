import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, logAudit } from '@/lib/auth';
import { tradeUrlSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = tradeUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { tradeUrl: parsed.data.tradeUrl },
    });

    await logAudit({ userId: user.id, action: 'TRADE_URL_UPDATED' });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}
