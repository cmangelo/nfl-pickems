'use client';

import { useState, useTransition } from 'react';
import { loadScheduleAction } from '@/app/(app)/admin/actions';

export default function LoadScheduleButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setMsg(null);
      try {
        const res = await loadScheduleAction();
        setMsg(res.ok ? { ok: true, text: res.message ?? 'Loaded.' } : { ok: false, text: res.error });
      } catch {
        setMsg({ ok: false, text: 'Load failed. Please try again.' });
      }
    });
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="h-10 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent disabled:opacity-60"
      >
        {pending ? 'Loading…' : 'Load season schedule from ESPN'}
      </button>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-[#8ff0bc]' : 'text-[#ff9c9c]'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
