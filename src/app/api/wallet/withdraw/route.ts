import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, logAudit } from '@/lib/auth';
import { withdrawSchema } from '@/lib/validation';
import { mntToUsd } from '@/lib/money';
import { clientIp } from '@/lib/request';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = withdrawSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { amountMNT, bankAccount, bankName } = parsed.data;
    const accountName = (body.accountName as string)?.trim() || user.username || 'Account holder';

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet) throw new Error('WALLET_NOT_FOUND');
      if (wallet.balanceMNT.lessThan(amountMNT)) throw new Error('INSUFFICIENT_FUNDS');

      const amountUSD = await mntToUsd(amountMNT);

      // Move funds to pending until an admin approves the payout.
      await tx.wallet.update({
        where: { userId: user.id },
        data: {
          balanceMNT: { decrement: amountMNT },
          balanceUSD: { decrement: amountUSD },
          pendingMNT: { increment: amountMNT },
          pendingUSD: { increment: amountUSD },
          version: { increment: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amountMNT,
          amountUSD,
          currency: 'MNT',
          type: 'WITHDRAW',
          status: 'PENDING',
          paymentProvider: 'BANK',
        },
      });

      return tx.withdrawal.create({
        data: { userId: user.id, amountMNT, bankName, bankAccount, accountName, status: 'REQUESTED' },
      });
    });

    await logAudit({
      userId: user.id,
      action: 'WITHDRAW_REQUESTED',
      ipAddress: clientIp(request),
      details: { withdrawalId: result.id, amountMNT },
    });

    return NextResponse.json({ success: true, withdrawalId: result.id, status: result.status });
  } catch (e) {
    const map: Record<string, [number, string]> = {
      UNAUTHORIZED: [401, 'Sign in required'],
      WALLET_NOT_FOUND: [404, 'Wallet not found'],
      INSUFFICIENT_FUNDS: [402, 'Insufficient wallet balance'],
    };
    const [status, message] = map[(e as Error).message] ?? [500, (e as Error).message];
    return NextResponse.json({ error: message }, { status });
  }
}
