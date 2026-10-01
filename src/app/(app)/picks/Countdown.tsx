'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '@/lib/countdown';

/**
 * Live countdown anchored to SERVER time (not the device clock): remaining =
 * lockAt - (serverNow + elapsed since mount). The first render uses serverNow
 * exactly so it matches the server-rendered HTML.
 */
export default function Countdown({ lockAt, serverNow }: { lockAt: string; serverNow: string }) {
  const router = useRouter();
  const lockMs = new Date(lockAt).getTime();
  const serverMs = new Date(serverNow).getTime();
  const [remaining, setRemaining] = useState(lockMs - serverMs);
  const refreshed = useRef(false);

  useEffect(() => {
    // Date.now() here is only a monotonic-ish elapsed timer, never "the current time".
    const mountedAt = Date.now();
    const tick = () => setRemaining(lockMs - (serverMs + (Date.now() - mountedAt)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockMs, serverMs]);

  useEffect(() => {
    if (remaining <= 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);

  if (remaining <= 0) {
    return (
      <div data-testid="countdown" className="text-sm text-muted">
        Picks are locked
      </div>
    );
  }
  return (
    <div data-testid="countdown" className="text-sm text-muted">
      {formatCountdown(remaining)} · edit anytime until then
    </div>
  );
}
