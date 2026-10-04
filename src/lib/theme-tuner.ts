/**
 * Staging-only theme tuner (pure, client-safe). Lets the owner try accent colors live on a device; nothing is
 * saved on the server and players never see it. Production stays on the colors in globals.css.
 */

/** Enabled only with THEME_TUNER=1, and never on Vercel's production deployment. */
export function isThemeTunerEnabled(env: Record<string, string | undefined>): boolean {
  return env.THEME_TUNER === '1' && env.VERCEL_ENV !== 'production';
}

export const THEME_STORAGE_KEY = 'pickems:theme-tuner:v1';

export interface ThemeVars {
  accent: string;
  accentBright: string;
  onAccent: string;
}

/** CSS variable names in globals.css. */
export const CSS_VARS: Record<keyof ThemeVars, string> = {
  accent: '--accent',
  accentBright: '--accent-bright',
  onAccent: '--on-accent',
};

export const DEFAULT_THEME: ThemeVars = { accent: '#fbbf24', accentBright: '#fcd34d', onAccent: '#1a1300' };

/** Cards sit on --surface; text on dark backgrounds is checked against it. */
const SURFACE = '#181b22';
const BG = '#0f1115';

export const PRESETS: { name: string; accent: string }[] = [
  { name: 'Amber', accent: '#fbbf24' },
  { name: 'Gold', accent: '#eab308' },
  { name: 'Lime', accent: '#a3e635' },
  { name: 'Teal', accent: '#2dd4bf' },
  { name: 'Sky', accent: '#38bdf8' },
  { name: 'Blue', accent: '#3b82f6' },
  { name: 'Indigo', accent: '#818cf8' },
  { name: 'Violet', accent: '#a78bfa' },
  { name: 'Mono', accent: '#e6e8ec' },
];

export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix `hex` toward `toward` by `t` (0..1) in sRGB. */
export function mix(hex: string, toward: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(toward);
  return toHex(a.map((c, i) => c + (b[i] - c) * t));
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text colors for an accent: `accentBright` (accent text on the dark cards) is the accent lightened just
 * enough for 4.5:1 on the surface; `onAccent` (text on an accent fill) is a near-black tint of the accent, or
 * white when that reads better.
 */
export function deriveTheme(accentHex: string): ThemeVars {
  const accent = normalizeHex(accentHex) ?? DEFAULT_THEME.accent;
  let accentBright = mix(accent, '#ffffff', 0.25);
  for (let t = 0.25; t <= 1 && contrastRatio(accentBright, SURFACE) < 4.5; t += 0.05) accentBright = mix(accent, '#ffffff', t);
  const dark = mix(accent, '#000000', 0.9);
  const onAccent = contrastRatio(dark, accent) >= contrastRatio('#ffffff', accent) ? dark : '#ffffff';
  return { accent, accentBright, onAccent };
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  /** WCAG minimum for this use: 4.5 for text, 3 for large shapes. */
  min: number;
}

export function contrastChecks(v: ThemeVars): ContrastCheck[] {
  return [
    { label: 'Accent text on cards', ratio: contrastRatio(v.accentBright, SURFACE), min: 4.5 },
    { label: 'Text on accent buttons', ratio: contrastRatio(v.onAccent, v.accent), min: 4.5 },
    { label: 'Accent fill vs background', ratio: contrastRatio(v.accent, BG), min: 3 },
  ];
}

/** Lines to paste into globals.css `:root`. */
export function cssSnippet(v: ThemeVars): string {
  return `  --accent: ${v.accent};\n  --accent-bright: ${v.accentBright};\n  --on-accent: ${v.onAccent};`;
}

/** A stored theme, or null when missing or malformed. */
export function parseStoredTheme(raw: string | null): ThemeVars | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<ThemeVars>;
    const accent = normalizeHex(String(d.accent ?? ''));
    const accentBright = normalizeHex(String(d.accentBright ?? ''));
    const onAccent = normalizeHex(String(d.onAccent ?? ''));
    return accent && accentBright && onAccent ? { accent, accentBright, onAccent } : null;
  } catch {
    return null;
  }
}

/** Inline <head> script: applies a stored theme before first paint (staging only), so pages don't flash amber. */
export const THEME_BOOT_SCRIPT = `try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||'null');var h=/^#[0-9a-f]{6}$/;if(d&&h.test(d.accent)&&h.test(d.accentBright)&&h.test(d.onAccent)){var s=document.documentElement.style;s.setProperty('--accent',d.accent);s.setProperty('--accent-bright',d.accentBright);s.setProperty('--on-accent',d.onAccent);}}catch(e){}`;
