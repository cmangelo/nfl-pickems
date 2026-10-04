import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastChecks,
  contrastRatio,
  cssSnippet,
  DEFAULT_THEME,
  deriveTheme,
  isThemeTunerEnabled,
  mix,
  normalizeHex,
  parseStoredTheme,
  PRESETS,
  THEME_BOOT_SCRIPT,
} from './theme-tuner';

describe('isThemeTunerEnabled', () => {
  it('needs THEME_TUNER=1 and is never on in Vercel production', () => {
    expect(isThemeTunerEnabled({})).toBe(false);
    expect(isThemeTunerEnabled({ THEME_TUNER: 'true' })).toBe(false);
    expect(isThemeTunerEnabled({ THEME_TUNER: '1' })).toBe(true);
    expect(isThemeTunerEnabled({ THEME_TUNER: '1', VERCEL_ENV: 'preview' })).toBe(true);
    expect(isThemeTunerEnabled({ THEME_TUNER: '1', VERCEL_ENV: 'production' })).toBe(false);
  });
});

describe('color math', () => {
  it('normalizes hex input', () => {
    expect(normalizeHex('FBBF24')).toBe('#fbbf24');
    expect(normalizeHex(' #abc ')).toBe('#aabbcc');
    expect(normalizeHex('#ggg000')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });
  it('mixes in sRGB', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#fbbf24', '#fbbf24', 0.3)).toBe('#fbbf24');
  });
  it('contrast ratio matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('deriveTheme', () => {
  it('every preset gets readable text colors', () => {
    for (const p of PRESETS) {
      const v = deriveTheme(p.accent);
      for (const c of contrastChecks(v).slice(0, 2)) expect(c.ratio, `${p.name}: ${c.label}`).toBeGreaterThanOrEqual(c.min);
    }
  });
  it('a dark accent gets white text and a much lighter text tint', () => {
    const v = deriveTheme('#1d4ed8');
    expect(v.onAccent).toBe('#ffffff');
    expect(contrastRatio(v.accentBright, '#181b22')).toBeGreaterThanOrEqual(4.5);
  });
  it('a light accent gets a dark tint of itself for text on fills', () => {
    const v = deriveTheme('#fbbf24');
    expect(v.accent).toBe('#fbbf24');
    expect(v.onAccent).toBe(mix('#fbbf24', '#000000', 0.9));
  });
  it('falls back to the default accent for junk', () => {
    expect(deriveTheme('nope').accent).toBe(DEFAULT_THEME.accent);
  });
});

describe('default theme', () => {
  it('is gold, with the text colors deriveTheme gives it (keep globals.css in sync)', () => {
    expect(DEFAULT_THEME).toEqual(deriveTheme('#eab308'));
  });
  it('matches the variables in globals.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const v = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css)?.[1];
    expect({ accent: v('--accent'), accentBright: v('--accent-bright'), onAccent: v('--on-accent') }).toEqual(DEFAULT_THEME);
  });
});

describe('storage and export', () => {
  it('parses a stored theme and rejects malformed ones', () => {
    expect(parseStoredTheme(JSON.stringify(DEFAULT_THEME))).toEqual(DEFAULT_THEME);
    expect(parseStoredTheme(null)).toBeNull();
    expect(parseStoredTheme('{bad')).toBeNull();
    expect(parseStoredTheme(JSON.stringify({ ...DEFAULT_THEME, onAccent: 'red' }))).toBeNull();
  });
  it('css snippet lists the three variables', () => {
    expect(cssSnippet(DEFAULT_THEME)).toBe('  --accent: #eab308;\n  --accent-bright: #efc646;\n  --on-accent: #171201;');
  });
  it('boot script applies a stored theme and ignores bad data', () => {
    const props: Record<string, string> = {};
    const run = (stored: string | null) => {
      const fakeWindow = {
        localStorage: { getItem: () => stored },
        document: { documentElement: { style: { setProperty: (k: string, v: string) => (props[k] = v) } } },
      };
      new Function('localStorage', 'document', THEME_BOOT_SCRIPT)(fakeWindow.localStorage, fakeWindow.document);
    };
    run('garbage');
    expect(props).toEqual({});
    run(JSON.stringify({ accent: '#38bdf8', accentBright: '#7dd3fc', onAccent: '#04131a' }));
    expect(props).toEqual({ '--accent': '#38bdf8', '--accent-bright': '#7dd3fc', '--on-accent': '#04131a' });
  });
});
