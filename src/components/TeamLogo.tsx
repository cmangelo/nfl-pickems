'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ESPN_LOGO_BASE, logoVariants, teamLogoUrl } from '@/lib/game-view';

const LogoBase = createContext<string>(ESPN_LOGO_BASE);

/** Set by the (app) layout: ESPN's CDN normally, a local stub under TEST_MODE (tests never hit the network). */
export function LogoBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <LogoBase.Provider value={base}>{children}</LogoBase.Provider>;
}

/**
 * Decorative team logo shown next to the abbreviation (which stays the accessible text). Tries ESPN's
 * dark-background variant, then the standard one (reversed with `onLight`, e.g. on a selected pick's light
 * fill); if both fail it keeps an empty box of the same size so the layout does not shift.
 */
export default function TeamLogo({
  abbr,
  size = 24,
  onLight = false,
  className = '',
}: {
  abbr: string;
  size?: number;
  onLight?: boolean;
  className?: string;
}) {
  const base = useContext(LogoBase);
  const variants = logoVariants(onLight);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const failed = attempt >= variants.length;
  const next = () => setAttempt((a) => a + 1);

  // A server-rendered <img> can fail before hydration attaches onError; catch that case on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setAttempt((a) => a + 1);
  }, [attempt]);

  if (failed) return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static logos from a CDN; no optimizer needed
    <img
      ref={ref}
      src={teamLogoUrl(abbr, variants[attempt], base)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={next}
      data-testid="team-logo"
      data-team={abbr}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
