import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await requireUser();
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);
    return NextResponse.json({ items, unread });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    if (body.id) {
      await prisma.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { isRead: true } });
    } else {
      await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}
