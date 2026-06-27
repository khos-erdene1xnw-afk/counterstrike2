import { redirect } from 'next/navigation';
import { WalletClient } from '@/components/wallet/wallet-client';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const metadata = { title: 'Wallet | CS2 GOLD' };

const OUTGOING_TYPES = new Set(['WITHDRAW', 'BUY_PAYMENT', 'COMMISSION_FEE']);

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=required');

  const wallet = user.wallet ?? (await prisma.wallet.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } }));

  const txRows = await prisma.transaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  const initialTx = txRows.map((tx) => {
    const sign = OUTGOING_TYPES.has(tx.type) ? -1 : 1;
    return {
      id: `TX-${tx.id.slice(0, 6).toUpperCase()}`,
      type: tx.type,
      amountMNT: sign * Number(tx.amountMNT),
      amountUSD: sign * Number(tx.amountUSD),
      status: tx.status,
      date: tx.createdAt.toISOString().slice(0, 16).replace('T', ' '),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-bold text-white">Wallet & Payments</h1>
      <WalletClient
        initialBalanceMNT={Number(wallet.balanceMNT)}
        initialLockedMNT={Number(wallet.lockedMNT)}
        initialPendingMNT={Number(wallet.pendingMNT)}
        initialTx={initialTx}
      />
    </div>
  );
}
