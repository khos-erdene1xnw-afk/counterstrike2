import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { currencyPrefSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const body = await request.json();
    const parsed = currencyPrefSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { currencyPreference: parsed.data.currency },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 });
  }
}
