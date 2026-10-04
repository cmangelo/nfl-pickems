'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TIMEOUT_MS, ActionTimeoutError, withTimeout } from '@/lib/action-timeout';

/**
 * Runs server actions OUTSIDE a React transition. Use this instead of
 * `startTransition(async () => await someAction())`, `useActionState` or `<form action={serverAction}>`.
 *
 * Why: React 19 entangles every transition started while an async transition is pending, so a Link tap or
 * router.push made during such an action cannot commit until the action settles. A request that never comes
 * back (phone slept or switched networks mid-save) left the bottom nav dead until a reload.
 *
 * - `run(fn)`: runs `fn` with `pending` set; `fn` handles its own errors.
 * - `call(promise, ms?)`: the action promise with a timeout (ActionTimeoutError). On timeout, if the user is still
 *   here, the page is re-requested: Next runs server actions one at a time, so the hung one would otherwise hold
 *   back a retry, and only a navigation supersedes it.
 * - `stillHere()`: false once the component unmounted or the user tapped a link / went back while `run` was busy.
 *   Check it before navigating after an action, so a finished save never yanks the user back from another tab.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const left = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const stillHere = useCallback(() => mounted.current && !left.current, []);

  const run = useCallback((fn: () => Promise<void>) => {
    left.current = false;
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      // Only a click that navigates this tab (same rules as next/link): not new-tab/window, not a download.
      const elsewhere = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      if (a && !elsewhere && !a.hasAttribute('download') && (a.getAttribute('target') ?? '_self') === '_self') {
        left.current = true;
      }
    };
    const onPop = () => {
      left.current = true;
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    setPending(true);
    fn()
      .catch((e) => console.error(e))
      .finally(() => {
        document.removeEventListener('click', onClick, true);
        window.removeEventListener('popstate', onPop);
        if (mounted.current) setPending(false);
      });
  }, []);

  const call = useCallback(
    <T,>(promise: Promise<T>, ms: number = ACTION_TIMEOUT_MS): Promise<T> =>
      withTimeout(promise, ms).catch((e: unknown) => {
        if (e instanceof ActionTimeoutError && stillHere()) {
          router.replace(window.location.pathname + window.location.search, { scroll: false });
        }
        throw e;
      }),
    [router, stillHere],
  );

  return { pending, run, call, stillHere };
}
