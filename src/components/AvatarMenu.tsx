'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/login/actions';

export default function AvatarMenu({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'block w-full px-4 py-3 text-left text-base text-fg hover:bg-surface-2';
  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="avatar-button"
        onClick={() => setOpen((o) => !o)}
        className="size-10 rounded-full bg-surface-2 text-base font-bold text-fg"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <Link role="menuitem" href="/account/pin" className={item} onClick={() => setOpen(false)}>
            Change PIN
          </Link>
          <form action={logoutAction}>
            <button role="menuitem" type="submit" className={item}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
