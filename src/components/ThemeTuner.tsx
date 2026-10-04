'use client';

import { Check, Copy, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  contrastChecks,
  CSS_VARS,
  cssSnippet,
  DEFAULT_THEME,
  deriveTheme,
  normalizeHex,
  parseStoredTheme,
  PRESETS,
  THEME_STORAGE_KEY,
  type ThemeVars,
} from '@/lib/theme-tuner';

export const OPEN_THEME_TUNER = 'theme-tuner:open';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function apply(v: ThemeVars | null) {
  const s = document.documentElement.style;
  for (const key of Object.keys(CSS_VARS) as (keyof ThemeVars)[]) {
    if (v) s.setProperty(CSS_VARS[key], v[key]);
    else s.removeProperty(CSS_VARS[key]);
  }
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface-2 p-1"
      />
      <label htmlFor={id} className="w-28 shrink-0 text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        value={text}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) onChange(hex);
        }}
        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 font-mono text-sm text-fg"
      />
    </div>
  );
}

/**
 * Staging-only accent color tuner. Rendered by the root layout only when THEME_TUNER=1 (never in Vercel
 * production); opened from the account menu. Changes apply live and are kept on this device only.
 */
export default function ThemeTuner() {
  const [open, setOpen] = useState(false);
  const [vars, setVars] = useState<ThemeVars>(DEFAULT_THEME);
  const [custom, setCustom] = useState(false);
  const [auto, setAuto] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stored: ThemeVars | null = null;
    try {
      stored = parseStoredTheme(storage()?.getItem(THEME_STORAGE_KEY) ?? null);
    } catch {
      // Unavailable storage: start from the defaults.
    }
    if (stored) {
      setVars(stored);
      setCustom(true);
      const derived = deriveTheme(stored.accent);
      setAuto(derived.accentBright === stored.accentBright && derived.onAccent === stored.onAccent);
    }
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_THEME_TUNER, onOpen);
    return () => window.removeEventListener(OPEN_THEME_TUNER, onOpen);
  }, []);

  const update = (next: ThemeVars) => {
    setVars(next);
    setCustom(true);
    setCopied(false);
    apply(next);
    try {
      storage()?.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore: the change still applies for this page view.
    }
  };
  const setAccent = (hex: string) => update(auto ? deriveTheme(hex) : { ...vars, accent: hex });
  const reset = () => {
    try {
      storage()?.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Ignore.
    }
    apply(null);
    setVars(DEFAULT_THEME);
    setCustom(false);
    setAuto(true);
    setCopied(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cssSnippet(vars));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!open) return null;
  return (
    <section
      data-testid="theme-tuner"
      aria-label="Theme tuner"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[62dvh] max-w-xl overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-surface p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold">
          Theme tuner <span className="text-xs font-normal text-muted">· staging only, this device</span>
        </h2>
        <button type="button" aria-label="Close theme tuner" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            data-testid={`preset-${p.name.toLowerCase()}`}
            onClick={() => setAccent(p.accent)}
            aria-pressed={vars.accent === p.accent}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              vars.accent === p.accent ? 'border-fg' : 'border-border'
            }`}
          >
            <span className="size-3.5 rounded-full" style={{ background: p.accent }} aria-hidden="true" />
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <ColorField id="tuner-accent" label="Accent" value={vars.accent} onChange={setAccent} />
        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              if (e.target.checked) update(deriveTheme(vars.accent));
            }}
          />
          Derive text colors automatically
        </label>
        {!auto && (
          <>
            <ColorField id="tuner-bright" label="Accent text" value={vars.accentBright} onChange={(hex) => update({ ...vars, accentBright: hex })} />
            <ColorField id="tuner-on" label="Text on accent" value={vars.onAccent} onChange={(hex) => update({ ...vars, onAccent: hex })} />
          </>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-xs" aria-label="Contrast">
        {contrastChecks(vars).map((c) => {
          const ok = c.ratio >= c.min;
          return (
            <li key={c.label} data-testid="contrast" className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5">
              <span className="text-muted">{c.label}</span>
              <span className={`font-mono font-semibold ${ok ? 'text-[#8ff0bc]' : 'text-[#ff9c9c]'}`}>
                {c.ratio.toFixed(2)}:1 {ok ? '✓' : `✗ needs ${c.min}`}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-bg p-3" aria-label="Preview">
        <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-on-accent">Submit picks</span>
        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">YOU</span>
        <span className="text-sm font-bold text-accent-bright">$180 pot</span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="tuner-copy"
          onClick={copy}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-bold text-on-accent"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copied CSS' : 'Copy CSS'}
        </button>
        <button
          type="button"
          data-testid="tuner-reset"
          onClick={reset}
          disabled={!custom}
          className="flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-border bg-surface-2 px-3 text-sm font-semibold text-fg disabled:opacity-50"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      </div>
      <pre data-testid="tuner-css" className="mt-2 overflow-x-auto rounded-lg bg-bg p-2 font-mono text-[11px] text-muted">
        {cssSnippet(vars)}
      </pre>
    </section>
  );
}
