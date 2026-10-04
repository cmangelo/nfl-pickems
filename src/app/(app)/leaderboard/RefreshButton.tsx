'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useAction } from '@/components/use-action';
import { refreshAction, type RefreshState } from './actions';

const MESSAGE: Record<RefreshState, string> = {
  updated: 'Scores refreshed.',
  fresh: 'Already up to date (scores refresh at most every 5 minutes).',
  error: "Couldn't reach the score feed. Showing the latest saved scores.",
};

export default function RefreshButton() {
  const { pending, run, call } = useAction();
  const [state, setState] = useState<RefreshState | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="refresh"
        disabled={pending}
        onClick={() =>
          run(async () => {
            try {
              setState(await call(refreshAction()));
            } catch {
              setState('error');
            }
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-bright disabled:opacity-60"
      >
        <RotateCw size={14} strokeWidth={2.5} aria-hidden="true" className={pending ? 'animate-spin' : ''} />
        {pending ? 'Refreshing…' : 'Refresh'}
      </button>
      <span role="status" data-testid="refresh-status" className="sr-only">
        {state ? MESSAGE[state] : ''}
      </span>
      {state && <span aria-hidden="true" className="max-w-[16rem] text-right text-xs text-muted">{MESSAGE[state]}</span>}
    </div>
  );
}
