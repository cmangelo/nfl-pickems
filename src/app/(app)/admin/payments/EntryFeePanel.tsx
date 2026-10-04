'use client';

import { useState, useTransition } from 'react';
import { feeInputValue, formatMoney } from '@/lib/pot';
import { setEntryFeeAction } from '../actions';

const btn = 'h-10 rounded-lg border-[1.5px] border-border bg-surface-2 px-3 text-sm font-semibold text-fg disabled:opacity-60';
const primary = 'h-10 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent disabled:opacity-60';

/** Entry fee for the selected week: set here, it carries over to later weeks until one sets another. */
export default function EntryFeePanel({
  weekId,
  weekNumber,
  feeCents,
  fromLabel,
  ownFeeCents,
}: {
  weekId: number;
  weekNumber: number;
  /** Fee in effect for this week (own or carried over); null = none set. */
  feeCents: number | null;
  /** Week the fee in effect was set on, e.g. "Week 5" (when it is not this week, it was carried over). */
  fromLabel: string | null;
  /** This week's own fee (null = carried over or none). */
  ownFeeCents: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (v: string) =>
    start(async () => {
      setError(null);
      try {
        const res = await setEntryFeeAction(weekId, v);
        if (res.ok) setEditing(false);
        else setError(res.error);
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });

  const inherited = feeCents !== null && ownFeeCents === null && fromLabel !== null;
  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p data-testid="entry-fee" className="font-semibold">
            Entry fee {feeCents === null ? 'not set' : formatMoney(feeCents)}
          </p>
          <p data-testid="entry-fee-note" className="text-xs text-muted">
            {feeCents === null
              ? 'Set one to show the pot to players.'
              : inherited
                ? `Carried over from ${fromLabel}.`
                : `Set on Week ${weekNumber}; later weeks use it until you change it.`}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            className={btn}
            onClick={() => {
              setValue(feeInputValue(feeCents));
              setError(null);
              setEditing(true);
            }}
          >
            {feeCents === null ? 'Set' : 'Change'}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
        >
          <label htmlFor="fee-input" className="text-sm text-muted">
            Entry fee for Week {weekNumber} and later (dollars)
          </label>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-lg text-muted">$</span>
            <input
              id="fee-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-lg text-fg"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primary}>
              Save fee
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className={btn}>
              Cancel
            </button>
            {ownFeeCents !== null && (
              <button type="button" disabled={pending} onClick={() => save('')} className={btn}>
                Use earlier week&apos;s fee
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" data-testid="fee-error" className="mt-2 text-sm text-[#ff9c9c]">
          {error}
        </p>
      )}
    </section>
  );
}
