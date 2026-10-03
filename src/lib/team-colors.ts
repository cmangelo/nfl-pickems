/**
 * Team colors for the Games pick-split bar. Pure; safe to import from client code.
 *
 * Each team lists its primary color first, then a secondary. On the dark card a navy or black primary
 * would vanish, so `barColors` lightens a color just enough to stay visible, and when the two teams of
 * a game end up too close to tell apart it switches the home team (then the away team) to its
 * secondary. Team names are always printed next to the bar, so color is never the only cue.
 * Keys are ESPN abbreviations.
 */
export const TEAM_COLORS: Record<string, [primary: string, secondary: string]> = {
  ARI: ['#97233F', '#FFB612'],
  ATL: ['#A71930', '#A5ACAF'],
  BAL: ['#241773', '#9E7C0C'],
  BUF: ['#00338D', '#C60C30'],
  CAR: ['#0085CA', '#BFC0BF'],
  CHI: ['#0B162A', '#C83803'],
  CIN: ['#FB4F14', '#000000'],
  CLE: ['#311D00', '#FF3C00'],
  DAL: ['#003594', '#869397'],
  DEN: ['#FB4F14', '#002244'],
  DET: ['#0076B6', '#B0B7BC'],
  GB: ['#203731', '#FFB612'],
  HOU: ['#03202F', '#A71930'],
  IND: ['#002C5F', '#A2AAAD'],
  JAX: ['#006778', '#D7A22A'],
  KC: ['#E31837', '#FFB81C'],
  LV: ['#000000', '#A5ACAF'],
  LAC: ['#0080C6', '#FFC20E'],
  LAR: ['#003594', '#FFA300'],
  MIA: ['#008E97', '#FC4C02'],
  MIN: ['#4F2683', '#FFC62F'],
  NE: ['#002244', '#C60C30'],
  NO: ['#D3BC8D', '#101820'],
  NYG: ['#0B2265', '#A71930'],
  NYJ: ['#125740', '#FFFFFF'],
  PHI: ['#004C54', '#A5ACAF'],
  PIT: ['#101820', '#FFB612'],
  SF: ['#AA0000', '#B3995D'],
  SEA: ['#002244', '#69BE28'],
  TB: ['#D50A0A', '#FF7900'],
  TEN: ['#0C2340', '#4B92DB'],
  WSH: ['#5A1414', '#FFB612'],
};

/** Unknown teams fall back to a validated blue / orange pair. */
export const FALLBACK_AWAY = '#3987e5';
export const FALLBACK_HOME = '#d95926';
/** The card surface the bar sits on (--surface). */
export const BAR_SURFACE = '#181b22';
/** A bar segment needs at least this contrast against the card to read as a mark. */
export const MIN_CONTRAST = 2;
/** Two segments closer than this (OKLab distance x100) are too hard to tell apart. */
export const MIN_DISTANCE = 15;

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(c: Rgb): number {
  const [r, g, b] = c.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

function oklab(c: Rgb): Rgb {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance between two colors (OKLab Delta E x100). */
export function distance(a: string, b: string): number {
  const [x, y] = [oklab(parse(a)), oklab(parse(b))];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

function fromOklab([L, A, B]: Rgb): Rgb | null {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (lin.some((v) => v < -1e-4 || v > 1 + 1e-4)) return null; // outside sRGB
  const enc = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  };
  return lin.map(enc) as Rgb;
}

/**
 * Raises a color's lightness (same hue, same saturation where sRGB allows) in small steps until it
 * reaches MIN_CONTRAST on the card, so a navy stays a recognizable blue instead of turning grey.
 */
export function visibleOnCard(hex: string): string {
  if (contrast(hex, BAR_SURFACE) >= MIN_CONTRAST) return hex.toLowerCase();
  const [L0, A, B] = oklab(parse(hex));
  for (let L = L0; L <= 1; L += 0.01) {
    // Reduce chroma only if the lighter color falls outside sRGB.
    for (let k = 1; k >= 0; k -= 0.05) {
      const rgb = fromOklab([L, A * k, B * k]);
      if (!rgb) continue;
      const out = toHex(rgb);
      if (contrast(out, BAR_SURFACE) >= MIN_CONTRAST) return out;
      break;
    }
  }
  return '#ffffff';
}

/** Colors for a game's away | home bar segments: team primaries, kept visible and distinct. */
export function barColors(awayTeam: string, homeTeam: string): { away: string; home: string } {
  const a = TEAM_COLORS[awayTeam];
  const h = TEAM_COLORS[homeTeam];
  if (!a || !h) return { away: FALLBACK_AWAY, home: FALLBACK_HOME };
  const [a1, a2] = a.map(visibleOnCard);
  const [h1, h2] = h.map(visibleOnCard);
  const options: [string, string][] = [
    [a1, h1],
    [a1, h2],
    [a2, h1],
    [a2, h2],
  ];
  const ok = options.find(([x, y]) => distance(x, y) >= MIN_DISTANCE);
  // No combination is distinct enough (very rare): keep the primaries; the team labels carry identity.
  const [away, home] = ok ?? options.reduce((best, o) => (distance(o[0], o[1]) > distance(best[0], best[1]) ? o : best));
  return { away, home };
}
