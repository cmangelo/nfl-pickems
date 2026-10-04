'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import TeamLogo from '@/components/TeamLogo';
import { draftKeyWeek, makeDraft, readDraft, serializeDraftState, type DraftState } from '@/lib/picks-draft';
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

/** localStorage, or null where it is unavailable (private mode, blocked storage). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  target,
  savedHrefBase,
  initialSaved = false,
  draft,
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
  /** Which entry the default action saves: omitted = the first one, `{ entryId }`, or `{ newEntry: true }`. */
  target?: { entryId?: number; newEntry?: boolean };
  /** After a successful save, navigate to this URL + the saved entry id (used for a brand-new entry). */
  savedHrefBase?: string;
  /** Show the "saved" notice on mount (after navigating to a just-created entry). */
  initialSaved?: boolean;
  /**
   * Keep unsaved picks in this browser under `key` (the player's own picks page only). A draft is offered back
   * (Restore / Discard), never applied or submitted by itself, and only while the saved entry is unchanged.
   */
  draft?: { key: string; userId: number };
}) {
  const router = useRouter();
  const allGames = days.flatMap((d) => d.games);
  const [picks, setPicks] = useState<Record<number, Side>>(initialPicks);
  const [tb, setTb] = useState(initialTiebreaker === null ? '' : String(initialTiebreaker));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  // A save that creates an entry navigates to it; until then the form must not save again (it would add another).
  const [navigating, setNavigating] = useState(false);
  // Saved state the draft is measured against: the entry as the server last rendered it.
  const base = serializeDraftState({ picks: initialPicks, tb: initialTiebreaker === null ? '' : String(initialTiebreaker) });
  const [offer, setOffer] = useState<DraftState | null>(null);
  const [restored, setRestored] = useState(false);
  // Drafts are written only after the stored one was read, so loading the page never overwrites it.
  const [draftChecked, setDraftChecked] = useState(false);
  const mountRef = useRef({ base, gameIds: allGames.map((g) => g.id) });
  // Primitives, so a server refresh (new props object) never re-runs the mount-time read.
  const draftKey = draft?.key;
  const draftUserId = draft?.userId;

  useEffect(() => {
    if (!draftKey || draftUserId === undefined) return;
    const ls = storage();
    try {
      if (ls) {
        // Drafts for other weeks can never be used again (only the current week is open).
        for (let i = ls.length - 1; i >= 0; i--) {
          const k = ls.key(i);
          const w = k ? draftKeyWeek(k, draftUserId) : null;
          if (k && w !== null && w !== weekId) ls.removeItem(k);
        }
        const found = readDraft(ls.getItem(draftKey), mountRef.current.base, mountRef.current.gameIds);
        if (found) setOffer(found);
        else ls.removeItem(draftKey);
      }
    } catch {
      // Storage can throw (quota, privacy settings): the form works without drafts.
    }
    setDraftChecked(true);
  }, [draftKey, draftUserId, weekId]);

  useEffect(() => {
    // While a draft is on offer, leave it alone until the player restores or discards it.
    if (!draftKey || !draftChecked || offer) return;
    try {
      const ls = storage();
      if (!ls) return;
      if (serializeDraftState({ picks, tb }) === base) ls.removeItem(draftKey);
      else ls.setItem(draftKey, makeDraft(base, { picks, tb }));
    } catch {
      // Ignore: drafts are a convenience.
    }
  }, [draftKey, draftChecked, offer, picks, tb, base]);

  const clearDraft = () => {
    if (!draftKey) return;
    try {
      storage()?.removeItem(draftKey);
    } catch {
      // Ignore.
    }
  };
  const restoreDraft = () => {
    if (!offer) return;
    setPicks(offer.picks);
    setTb(offer.tb);
    setOffer(null);
    setRestored(true);
    setSaved(false);
  };
  const discardDraft = () => {
    clearDraft();
    setOffer(null);
  };

  // The "saved" notice came from ?saved=1 after creating an entry: drop the param so a reload doesn't repeat it.
  useEffect(() => {
    if (!initialSaved) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('saved')) return;
    url.searchParams.delete('saved');
    window.history.replaceState(window.history.state, '', url);
  }, [initialSaved]);

  const pickedCount = allGames.filter((g) => picks[g.id]).length;
  const remaining = allGames.length - pickedCount;
  const tbValid = /^\d+$/.test(tb) && Number(tb) <= TB_MAX;
  const ready = remaining === 0 && tbValid;
  const label = pending || navigating
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
    setOffer(null); // editing instead of restoring: the new edits become the draft
  };

  const submit = () => {
    if (!ready || pending || navigating) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await (submitAction ? submitAction(picks, Number(tb)) : submitPicksAction(weekId, picks, Number(tb), target));
        if (res.ok) {
          clearDraft();
          setSaved(true);
          setRestored(false);
          if (savedHrefBase && res.entryId) {
            setNavigating(true);
            router.replace(`${savedHrefBase}${res.entryId}`);
          }
        } else {
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
      // Same outline + tint as a pending pick in LockedPicks, which turns green/red once the game is final.
      on ? 'border-accent bg-accent/15 text-accent-bright' : 'border-border bg-surface-2 text-fg'
    }`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {offer && (
        <div data-testid="draft-offer" role="status" className="rounded-xl border border-accent bg-accent/10 p-3">
          <p className="text-sm font-semibold">You have unsaved picks on this device</p>
          <p className="mt-0.5 text-xs text-muted">
            {allGames.filter((g) => offer.picks[g.id]).length}/{allGames.length} picked
            {offer.tb ? ` · tiebreaker ${offer.tb}` : ''}. They were never submitted.
            {hasEntry ? ' Your submitted picks stay as they are unless you restore these and submit.' : ''}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="draft-restore"
              onClick={restoreDraft}
              className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent"
            >
              Restore
            </button>
            <button
              type="button"
              data-testid="draft-discard"
              onClick={discardDraft}
              className="h-10 rounded-lg border-[1.5px] border-border bg-surface-2 px-4 text-sm font-semibold text-fg"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {restored && !saved && (
        <p data-testid="draft-restored" role="status" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          Unsaved picks restored. They aren&apos;t saved until you {hasEntry ? 'update' : 'submit'}.
        </p>
      )}

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
            setOffer(null);
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
        disabled={!ready || pending || navigating}
        className="h-[54px] w-full rounded-xl bg-accent text-lg font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
      >
        {label}
      </button>
    </form>
  );
}
