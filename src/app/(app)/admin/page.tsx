import { requireAdmin } from '@/lib/auth';

export default async function AdminPage() {
  await requireAdmin();
  return <h1 className="text-2xl font-bold">Admin</h1>;
}
