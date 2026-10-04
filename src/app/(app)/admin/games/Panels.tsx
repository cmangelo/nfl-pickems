'use client';

import { useState } from 'react';
import { useAction } from '@/components/use-action';
import { SLOW_ACTION_TIMEOUT_MS, actionErrorMessage } from '@/lib/action-timeout';
import { setLockAction, syncNowAction } from '../actions';

const btn = 'h-10 rounded-lg border-[1.5px] border-border bg-surface-2 px-3 text-sm font-semibold text-fg disabled:opacity-60';
const primary = 'h-10 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent disabled:opacity-60';

export function SyncPanel({ weekId, lastSynced }: { weekId: number; lastSynced: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { pending, run: start, call } = useAction();
  const run = () =>
    start(async () => {
      setMsg(null);
      try {
        const res = await call(syncNowAction(weekId), SLOW_ACTION_TIMEOUT_MS);
        setMsg(res.ok ? { ok: true, text: res.message ?? 'Synced.' } : { ok: false, text: res.error });
      } catch (e) {
        setMsg({ ok: false, text: actionErrorMessage(e, 'Sync failed. Please try again.') });
      }
    });
  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <p data-testid="last-synced" className="text-sm text-muted">
        Scores from ESPN · Last synced {lastSynced}
      </p>
      <button type="button" onClick={run} disabled={pending} className={`${btn} mt-2 w-full`}>
        {pending ? 'Syncing…' : 'Sync from ESPN now'}
      </button>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-[#8ff0bc]' : 'text-[#ff9c9c]'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

export function LockPanel({
  weekId,
  lockLabel,
  isOverride,
  inputValue,
}: {
  weekId: number;
  lockLabel: string;
  isOverride: boolean;
  inputValue: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(inputValue);
  const [error, setError] = useState<string | null>(null);
  const { pending, run: start, call } = useAction();

  const save = (v: string | null) =>
    start(async () => {
      setError(null);
      try {
        const res = await call(setLockAction(weekId, v));
        if (res.ok) setEditing(false);
        else setError(res.error);
      } catch (e) {
        setError(actionErrorMessage(e, 'Something went wrong. Please try again.'));
      }
    });

  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <p data-testid="lock-time" className="flex-1 font-semibold">
          Picks lock {lockLabel}
          {isOverride && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-accent-bright">custom</span>}
        </p>
        {!editing && (
          <button
            type="button"
            className={btn}
            onClick={() => {
              setValue(inputValue);
              setEditing(true);
            }}
          >
            Change
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor="lock-input" className="text-sm text-muted">
            Lock time (Pacific Time)
          </label>
          <input
            id="lock-input"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 rounded-[10px] border border-border bg-surface-2 px-3 text-fg"
          />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => save(value)} className={primary}>
              Save lock time
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className={btn}>
              Cancel
            </button>
            {isOverride && (
              <button type="button" disabled={pending} onClick={() => save(null)} className={btn}>
                Reset to default
              </button>
            )}
          </div>
        </div>
      )}
      {!editing && isOverride && (
        <button type="button" disabled={pending} onClick={() => save(null)} className={`${btn} mt-2`}>
          Reset to default
        </button>
      )}
      {error && (
        <p role="alert" data-testid="lock-error" className="mt-2 text-sm text-[#ff9c9c]">
          {error}
        </p>
      )}
    </section>
  );
}
