'use client';

import { useState, useTransition } from 'react';
import TeamLogo from '@/components/TeamLogo';
import type { Side } from '@/lib/scoring';
import { submitPicksAction, type SubmitState } from './actions';

export interface FormGame {
  id: number;
  away: string;
  home: string;
  time: string;
}
export interface FormDay {
  key: string;
  label: string;
  games: FormGame[];
}

const TB_MAX = 200;

export default function PicksForm({
  weekId,
  days,
  initialPicks,
  initialTiebreaker,
  tiebreakerLabel,
  lockShort,
  hasEntry,
  submitAction,
  savedMessage,
}: {
  weekId: number;
  days: FormDay[];
  initialPicks: Record<number, Side>;
  initialTiebreaker: number | null;
  tiebreakerLabel: string;
  lockShort: string;
  hasEntry: boolean;
  /** Override the save action (admin editing another user's picks). */
  submitAction?: (picks: Record<number, Side>, tiebreaker: number) => Promise<SubmitState>;
  savedMessage?: string;
}) {
  const allGames = days.flatMap((d) => d.games);
  const [picks, setPicks] = useState<Record<number, Side>>(initialPicks);
  const [tb, setTb] = useState(initialTiebreaker === null ? '' : String(initialTiebreaker));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const pickedCount = allGames.filter((g) => picks[g.id]).length;
  const remaining = allGames.length - pickedCount;
  const tbValid = /^\d+$/.test(tb) && Number(tb) <= TB_MAX;
  const ready = remaining === 0 && tbValid;
  const label = pending
    ? 'Saving…'
    : remaining > 0
      ? `Pick ${remaining} more`
      : !tbValid
        ? 'Enter tiebreaker'
        : hasEntry || saved
          ? 'Update picks'
          : 'Submit picks';

  const choose = (id: number, side: Side) => {
    setPicks((p) => ({ ...p, [id]: side }));
    setSaved(false);
  };

  const submit = () => {
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await (submitAction ? submitAction(picks, Number(tb)) : submitPicksAction(weekId, picks, Number(tb)));
        if (res.ok) setSaved(true);
        else {
          setSaved(false);
          setError(res.error);
        }
      } catch {
        setSaved(false);
        setError('Something went wrong. Please try again.');
      }
    });
  };

  const teamClass = (on: boolean) =>
    `flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] text-xl font-bold ${
      on ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-fg'
    }`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <p data-testid="progress" className="text-sm font-semibold">
        {pickedCount}/{allGames.length} picked
      </p>

      {days.map((d) => (
        <section key={d.key} aria-label={d.label} className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{d.label}</h2>
          {d.games.map((g) => (
            <div key={g.id} data-testid={`game-${g.id}`} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 text-xs text-muted">{g.time}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={picks[g.id] === 'away'}
                  data-testid={`pick-${g.id}-away`}
                  onClick={() => choose(g.id, 'away')}
                  className={teamClass(picks[g.id] === 'away')}
                >
                  <TeamLogo abbr={g.away} size={26} />
                  <span>{g.away}</span>
                </button>
                <span aria-hidden="true" className="text-sm text-muted">@</span>
                <button
                  type="button"
                  aria-pressed={picks[g.id] === 'home'}
                  data-testid={`pick-${g.id}-home`}
                  onClick={() => choose(g.id, 'home')}
                  className={teamClass(picks[g.id] === 'home')}
                >
                  <TeamLogo abbr={g.home} size={26} />
                  <span>{g.home}</span>
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}

      <section className="rounded-xl border border-border bg-surface p-3">
        <label htmlFor="tiebreaker" className="mb-2 block text-sm font-semibold">
          {tiebreakerLabel}
        </label>
        <input
          id="tiebreaker"
          name="tiebreaker"
          inputMode="numeric"
          autoComplete="off"
          value={tb}
          onChange={(e) => {
            setTb(e.target.value.replace(/\D/g, '').slice(0, 3));
            setSaved(false);
          }}
          className="h-12 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-lg text-fg"
        />
        <p className="mt-2 text-xs text-muted">Closest guess wins if players tie on correct picks.</p>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-wrong/15 px-3 py-2 text-sm text-[#ff9c9c]">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-correct/15 px-3 py-2 text-sm text-[#8ff0bc]">
          {savedMessage ?? `Picks saved. You can change them until ${lockShort}.`}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || pending}
        className="h-[54px] w-full rounded-xl bg-accent text-lg font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
      >
        {label}
      </button>
    </form>
  );
}
