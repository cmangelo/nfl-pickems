import { requireAdmin } from '@/lib/auth';
import AdminTabs from './AdminTabs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      <AdminTabs />
      {children}
    </div>
  );
}
