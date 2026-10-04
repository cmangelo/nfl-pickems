/**
 * Entry fee and pot (pure, client-safe). Payments are collected outside the app; this only does the arithmetic.
 * An admin sets a fee on a week and it carries over to later weeks until another week sets a new one.
 */

export interface FeeWeek {
  season: number;
  weekNumber: number;
  entryFeeCents: number | null;
}

export interface EffectiveFee {
  cents: number;
  /** The week the fee was set on (the target week itself, or the latest earlier week with a fee). */
  season: number;
  weekNumber: number;
}

/** Largest fee accepted: $10,000. */
export const MAX_FEE_CENTS = 1_000_000;

const order = (a: Pick<FeeWeek, 'season' | 'weekNumber'>, b: Pick<FeeWeek, 'season' | 'weekNumber'>) =>
  a.season - b.season || a.weekNumber - b.weekNumber;

/** The fee for `target`: its own, else the latest earlier week's (earlier seasons too). Null when none is set. */
export function effectiveEntryFee(weeks: FeeWeek[], target: Pick<FeeWeek, 'season' | 'weekNumber'>): EffectiveFee | null {
  let best: FeeWeek | null = null;
  for (const w of weeks) {
    if (w.entryFeeCents === null || order(w, target) > 0) continue;
    if (!best || order(w, best) > 0) best = w;
  }
  return best ? { cents: best.entryFeeCents!, season: best.season, weekNumber: best.weekNumber } : null;
}

/** "$10", "$7.50", "$1,200". */
export function formatMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Parses the admin's fee input: "10", "$12.50", "7.5". Empty = clear (carry over the earlier fee).
 * A fee of 0 is allowed (a free week: no pot is shown).
 */
export function parseFeeInput(value: string): { ok: true; cents: number | null } | { ok: false; error: string } {
  const v = value.trim().replace(/^\$\s*/, '').replace(/,/g, '');
  if (v === '') return { ok: true, cents: null };
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return { ok: false, error: 'Enter an amount like 10 or 12.50.' };
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (cents > MAX_FEE_CENTS) return { ok: false, error: `The fee can be at most ${formatMoney(MAX_FEE_CENTS)}.` };
  return { ok: true, cents };
}

/** Value to prefill the fee input with ("10", "12.50"). */
export function feeInputValue(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export interface Pot {
  feeCents: number;
  paidEntries: number;
  totalCents: number;
}

/** The pot from paid entries; null when there is no fee (or a $0 fee) so nothing is shown. */
export function computePot(feeCents: number | null | undefined, paidEntries: number): Pot | null {
  if (!feeCents || feeCents <= 0) return null;
  return { feeCents, paidEntries, totalCents: feeCents * paidEntries };
}

/** "Pot $180 · 18 paid entries at $10". */
export function potLine(pot: Pot): string {
  const n = pot.paidEntries;
  return `Pot ${formatMoney(pot.totalCents)} · ${n} paid ${n === 1 ? 'entry' : 'entries'} at ${formatMoney(pot.feeCents)}`;
}

/** Pot card detail: "18 paid entries × $10". */
export function potDetail(pot: Pot): string {
  const n = pot.paidEntries;
  return `${n} paid ${n === 1 ? 'entry' : 'entries'} × ${formatMoney(pot.feeCents)}`;
}

/**
 * Payout copy for the final recap: "Wins the $180 pot" or, for co-winners, "Split the $180 pot · $60 each".
 * A share that does not divide evenly is rounded down to the cent. Null with no pot or no winners.
 */
export function payoutLine(pot: Pot | null, winners: number): string | null {
  if (!pot || pot.totalCents <= 0 || winners < 1) return null;
  const total = formatMoney(pot.totalCents);
  if (winners === 1) return `Wins the ${total} pot`;
  return `Split the ${total} pot · ${formatMoney(Math.floor(pot.totalCents / winners))} each`;
}
