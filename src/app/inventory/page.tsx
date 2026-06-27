import { redirect } from 'next/navigation';
import { InventoryClient } from '@/components/inventory/inventory-client';
import { getCurrentUser } from '@/lib/auth';

export const metadata = { title: 'My Inventory | CS2 GOLD' };

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=required');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-bold text-white">My Steam Inventory</h1>
      <InventoryClient steamId={user.steamId} username={user.username ?? user.steamName} hasTradeUrl={Boolean(user.tradeUrl)} />
    </div>
  );
}
