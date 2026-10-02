import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="px-6 pb-8 pt-16">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <Trophy size={30} aria-hidden="true" />
        </div>
        <h1 className="mb-1.5 mt-[18px] text-5xl font-bold leading-none text-accent-bright">Pick&apos;em</h1>
        <p className="text-[17px] leading-snug text-muted">Pick every winner. Closest Monday-night guess breaks ties.</p>
      </div>
      <AuthForm />
    </main>
  );
}
