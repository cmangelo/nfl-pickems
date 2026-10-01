import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  await requireAdmin();
  const { week } = await searchParams;
  const w = Array.isArray(week) ? week[0] : week;
  redirect(w && /^\d+$/.test(w) ? `/admin/payments?week=${w}` : '/admin/payments');
}
