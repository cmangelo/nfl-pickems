'use client';

import { useState, useTransition } from 'react';
import { clearOverrideAction, overrideGameAction } from '../actions';

export interface AdminGame {
  id: number;
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  final: boolean;
  winner: 'home' | 'away' | 'tie' | null;
  manual: boolean;
  kickoff: string;
}

type Winner = 'home' | 'away' | 'tie';

const derive = (a: string, h: string): Winner | null => {
  if (!/^\d+$/.test(a) || !/^\d+$/.test(h)) return null;
  return Number(a) === Number(h) ? 'tie' : Number(h) > Number(a) ? 'home' : 'away';
};

const btn = 'h-10 rounded-lg border-[1.5px] border-border bg-surface-2 px-3 text-sm font-semibold text-fg disabled:opacity-60';
const field = 'h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-fg';

export default function GameEditor({ game: g }: { game: AdminGame }) {
  const [editing, setEditing] = useState(false);
  const [away, setAway] = useState(g.awayScore === null ? '' : String(g.awayScore));
  const [home, setHome] = useState(g.homeScore === null ? '' : String(g.homeScore));
  const [winner, setWinner] = useState<Winner | null>(g.winner);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const line = g.final
    ? `${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore} · Final`
    : `${g.away} @ ${g.home} · ${g.kickoff}`;

  const onScore = (setter: (v: string) => void, other: string, isAway: boolean) => (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 3);
    setter(clean);
    if (!touched) setWinner(derive(isAway ? clean : other, isAway ? other : clean));
  };

  const save = () =>
    start(async () => {
      setError(null);
      if (!/^\d+$/.test(away) || !/^\d+$/.test(home)) return setError('Enter both scores.');
      if (!winner) return setError('Pick a winner.');
      try {
        const res = await overrideGameAction(g.id, Number(home), Number(away), winner);
        if (res.ok) setEditing(false);
        else setError(res.error);
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });

  const clear = () =>
    start(async () => {
      setError(null);
      try {
        const res = await clearOverrideAction(g.id);
        if (res.ok) setEditing(false);
        else setError(res.error);
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });

  return (
    <div data-testid={`admin-game-${g.id}`} className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex min-h-11 items-center gap-2">
        <span className="flex-1 font-semibold">{line}</span>
        {g.manual && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-accent-bright">manual</span>}
        {!editing && (
          <button type="button" className={btn} aria-label={`Edit ${g.away} at ${g.home}`} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-col gap-3 pb-2">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-sm text-muted">
              {g.away} (away) score
              <input inputMode="numeric" value={away} onChange={(e) => onScore(setAway, home, true)(e.target.value)} className={field} />
            </label>
            <label className="flex-1 text-sm text-muted">
              {g.home} (home) score
              <input inputMode="numeric" value={home} onChange={(e) => onScore(setHome, away, false)(e.target.value)} className={field} />
            </label>
          </div>
          <label className="text-sm text-muted">
            Winner
            <select
              value={winner ?? ''}
              onChange={(e) => {
                setTouched(true);
                setWinner((e.target.value || null) as Winner | null);
              }}
              className={field}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="away">{g.away}</option>
              <option value="home">{g.home}</option>
              <option value="tie">tie</option>
            </select>
          </label>
          <p className="text-xs text-muted">Status: Final. Saving marks the game final and keeps it from being overwritten by syncs.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={save} className="h-10 rounded-lg bg-accent px-3 text-sm font-bold text-[#04201c] disabled:opacity-60">
              Save
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className={btn}>
              Cancel
            </button>
            {g.manual && (
              <button type="button" disabled={pending} onClick={clear} className={btn}>
                Clear override
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[#ff9c9c]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
