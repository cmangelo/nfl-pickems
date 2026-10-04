'use client';

import { useState } from 'react';
import { loadScheduleAction } from '@/app/(app)/admin/actions';
import { useAction } from '@/components/use-action';
import { SLOW_ACTION_TIMEOUT_MS, actionErrorMessage } from '@/lib/action-timeout';

export default function LoadScheduleButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { pending, run: start, call } = useAction();
  const run = () =>
    start(async () => {
      setMsg(null);
      try {
        const res = await call(loadScheduleAction(), SLOW_ACTION_TIMEOUT_MS);
        setMsg(res.ok ? { ok: true, text: res.message ?? 'Loaded.' } : { ok: false, text: res.error });
      } catch (e) {
        setMsg({ ok: false, text: actionErrorMessage(e, 'Load failed. Please try again.') });
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
