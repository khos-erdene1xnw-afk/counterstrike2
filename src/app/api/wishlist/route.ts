import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await prisma.wishlist.findMany({
      where: { userId: user.id },
      include: { skin: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { skinId } = await request.json();
    if (!skinId) return NextResponse.json({ error: 'skinId required' }, { status: 400 });
    const item = await prisma.wishlist.upsert({
      where: { userId_skinId: { userId: user.id, skinId } },
      update: {},
      create: { userId: user.id, skinId },
    });
    return NextResponse.json({ success: true, item });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const skinId = new URL(request.url).searchParams.get('skinId');
    if (!skinId) return NextResponse.json({ error: 'skinId required' }, { status: 400 });
    await prisma.wishlist.deleteMany({ where: { userId: user.id, skinId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
}
