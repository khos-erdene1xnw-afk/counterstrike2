import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, logAudit } from '@/lib/auth';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'MODERATOR']);
    const items = await prisma.withdrawal.findMany({
      where: { status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] } },
      include: { user: { select: { username: true, steamId: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ items });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'FORBIDDEN' ? 403 : 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireRole(['ADMIN']);
    const { id, action, reason } = await request.json();
    if (!id || !['APPROVE', 'REJECT', 'COMPLETE'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });

    if (action === 'REJECT') {
      // Funds are in pendingMNT if REQUESTED, or lockedMNT if APPROVED — return to balance.
      const fromLocked = withdrawal.status === 'APPROVED';
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal.update({ where: { id }, data: { status: 'REJECTED', reviewedBy: admin.id, rejectReason: reason ?? 'Rejected by admin' } });
        await tx.wallet.update({
          where: { userId: withdrawal.userId },
          data: {
            ...(fromLocked
              ? { lockedMNT: { decrement: withdrawal.amountMNT } }
              : { pendingMNT: { decrement: withdrawal.amountMNT } }),
            balanceMNT: { increment: withdrawal.amountMNT },
            version: { increment: 1 },
          },
        });
        await tx.transaction.updateMany({ where: { type: 'WITHDRAW', status: 'PENDING', wallet: { userId: withdrawal.userId } }, data: { status: 'FAILED' } });
        await tx.notification.create({ data: { userId: withdrawal.userId, title: 'Withdrawal Rejected', message: `Your withdrawal of \u20ae${Number(withdrawal.amountMNT).toLocaleString()} was rejected. Funds returned to your balance.`, type: 'WALLET', link: '/wallet' } });
      });
    } else if (action === 'COMPLETE') {
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal.update({ where: { id }, data: { status: 'COMPLETED', reviewedBy: admin.id } });
        await tx.wallet.update({ where: { userId: withdrawal.userId }, data: { lockedMNT: { decrement: withdrawal.amountMNT }, version: { increment: 1 } } });
        await tx.transaction.updateMany({ where: { type: 'WITHDRAW', status: 'PENDING', wallet: { userId: withdrawal.userId } }, data: { status: 'COMPLETED' } });
        await tx.notification.create({ data: { userId: withdrawal.userId, title: 'Withdrawal Paid', message: `\u20ae${Number(withdrawal.amountMNT).toLocaleString()} has been sent to your bank account.`, type: 'WALLET', link: '/wallet' } });
      });
    } else {
      // Move funds from pending -> locked while admin processes the bank transfer.
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal.update({ where: { id }, data: { status: 'APPROVED', reviewedBy: admin.id } });
        await tx.wallet.update({
          where: { userId: withdrawal.userId },
          data: {
            pendingMNT: { decrement: withdrawal.amountMNT },
            lockedMNT: { increment: withdrawal.amountMNT },
            version: { increment: 1 },
          },
        });
      });
    }

    await logAudit({ userId: admin.id, action: `WITHDRAWAL_${action}`, details: { withdrawalId: id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'FORBIDDEN' ? 403 : 401 });
  }
}
