import { AdminClient } from '@/components/admin/admin-client';

export const metadata = { title: 'Admin | CS2 GOLD' };

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-bold text-white">Admin Control Center</h1>
      <AdminClient />
    </div>
  );
}
