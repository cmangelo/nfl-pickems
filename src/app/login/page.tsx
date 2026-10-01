import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="px-6 pb-8 pt-16">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-bg">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-40 12 12)" />
            <path d="M9 15l6-6M10 11.5l2.5 2.5M11.5 10l2.5 2.5" />
          </svg>
        </div>
        <h1 className="mb-1.5 mt-[18px] text-5xl font-bold leading-none text-accent-bright">Pick&apos;em</h1>
        <p className="text-[17px] leading-snug text-muted">Pick every winner. Closest Monday-night guess breaks ties.</p>
      </div>
      <AuthForm />
    </main>
  );
}
