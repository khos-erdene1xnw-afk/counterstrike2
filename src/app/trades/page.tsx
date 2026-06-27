import { redirect } from 'next/navigation';
import { TradesClient } from '@/components/trades/trades-client';
import { getCurrentUser } from '@/lib/auth';

export const metadata = { title: 'Trade Hub | CS2 GOLD' };

export default async function TradesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=required');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="glass-card rounded-2xl p-5">
        <h1 className="mb-2 font-display text-sm font-bold text-white">CS2 Skin Trading Escrow Hub</h1>
        <p className="text-xs leading-relaxed text-zinc-400">
          CS2GOLD protects both parties with an escrow system. Sellers must send the trade offer containing the matching
          anti-scam authorization code within 12 hours. Buyer funds are held in escrow until Steam trade confirmation.
        </p>
      </div>
      <TradesClient />
    </div>
  );
}
