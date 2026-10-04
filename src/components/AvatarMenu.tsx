'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogOut, Palette } from 'lucide-react';
import { logoutAction } from '@/app/login/actions';
import { OPEN_THEME_TUNER } from './ThemeTuner';

export default function AvatarMenu({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  // The staging-only theme tuner is on when the root layout marked <html data-theme-tuner="1">.
  const [tuner, setTuner] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setTuner(document.documentElement.dataset.themeTuner === '1'), []);

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

  const item = 'flex w-full items-center gap-3 px-4 py-3 text-left text-base text-fg hover:bg-surface-2';
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
            <KeyRound size={18} className="text-muted" aria-hidden="true" />
            Change PIN
          </Link>
          {tuner && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_THEME_TUNER));
              }}
            >
              <Palette size={18} className="text-muted" aria-hidden="true" />
              Theme tuner
            </button>
          )}
          <form action={logoutAction}>
            <button role="menuitem" type="submit" className={item}>
              <LogOut size={18} className="text-muted" aria-hidden="true" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
