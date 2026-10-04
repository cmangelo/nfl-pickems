import { describe, expect, it } from 'vitest';
import { computePot, effectiveEntryFee, feeInputValue, formatMoney, parseFeeInput, payoutLine, potDetail, potLine } from './pot';

const w = (season: number, weekNumber: number, entryFeeCents: number | null) => ({ season, weekNumber, entryFeeCents });

describe('effectiveEntryFee', () => {
  const weeks = [w(2026, 5, 1000), w(2026, 6, null), w(2026, 7, null), w(2026, 8, 2000), w(2026, 9, null)];

  it('uses the week\'s own fee', () => {
    expect(effectiveEntryFee(weeks, { season: 2026, weekNumber: 5 })).toEqual({ cents: 1000, season: 2026, weekNumber: 5 });
    expect(effectiveEntryFee(weeks, { season: 2026, weekNumber: 8 })).toEqual({ cents: 2000, season: 2026, weekNumber: 8 });
  });
  it('carries the latest earlier fee forward', () => {
    expect(effectiveEntryFee(weeks, { season: 2026, weekNumber: 7 })).toMatchObject({ cents: 1000, weekNumber: 5 });
    expect(effectiveEntryFee(weeks, { season: 2026, weekNumber: 9 })).toMatchObject({ cents: 2000, weekNumber: 8 });
  });
  it('never uses a later week\'s fee; null when nothing is set yet', () => {
    expect(effectiveEntryFee(weeks, { season: 2026, weekNumber: 4 })).toBeNull();
    expect(effectiveEntryFee([], { season: 2026, weekNumber: 4 })).toBeNull();
  });
  it('carries over from an earlier season; a $0 fee counts as set', () => {
    expect(effectiveEntryFee([w(2025, 18, 1500)], { season: 2026, weekNumber: 1 })).toMatchObject({ cents: 1500, season: 2025 });
    expect(effectiveEntryFee([w(2026, 5, 1000), w(2026, 6, 0)], { season: 2026, weekNumber: 7 })).toMatchObject({ cents: 0 });
  });
});

describe('formatMoney', () => {
  it('drops cents for whole dollars and groups thousands', () => {
    expect(formatMoney(1000)).toBe('$10');
    expect(formatMoney(750)).toBe('$7.50');
    expect(formatMoney(3333)).toBe('$33.33');
    expect(formatMoney(120000)).toBe('$1,200');
    expect(formatMoney(0)).toBe('$0');
  });
});

describe('parseFeeInput', () => {
  it('accepts dollars, cents, a leading $ and commas', () => {
    expect(parseFeeInput('10')).toEqual({ ok: true, cents: 1000 });
    expect(parseFeeInput(' $12.5 ')).toEqual({ ok: true, cents: 1250 });
    expect(parseFeeInput('7.05')).toEqual({ ok: true, cents: 705 });
    expect(parseFeeInput('1,000')).toEqual({ ok: true, cents: 100000 });
    expect(parseFeeInput('0')).toEqual({ ok: true, cents: 0 });
  });
  it('empty clears the fee', () => {
    expect(parseFeeInput('  ')).toEqual({ ok: true, cents: null });
  });
  it('rejects junk, negatives, fractions of a cent and huge amounts', () => {
    for (const bad of ['abc', '-5', '10.505', '1e3', '10.', '.5', '10000.01']) expect(parseFeeInput(bad).ok).toBe(false);
    expect(parseFeeInput('10000')).toEqual({ ok: true, cents: 1_000_000 });
  });
  it('round-trips through feeInputValue', () => {
    for (const c of [0, 5, 1000, 1250, 999999]) expect(parseFeeInput(feeInputValue(c))).toEqual({ ok: true, cents: c });
    expect(feeInputValue(null)).toBe('');
  });
});

describe('pot copy', () => {
  it('no pot without a positive fee', () => {
    expect(computePot(null, 5)).toBeNull();
    expect(computePot(0, 5)).toBeNull();
  });
  it('pot line counts paid entries', () => {
    expect(potLine(computePot(1000, 18)!)).toBe('Pot $180 · 18 paid entries at $10');
    expect(potLine(computePot(1000, 1)!)).toBe('Pot $10 · 1 paid entry at $10');
    expect(potLine(computePot(1000, 0)!)).toBe('Pot $0 · 0 paid entries at $10');
  });
  it('pot card detail', () => {
    expect(potDetail(computePot(1000, 18)!)).toBe('18 paid entries × $10');
    expect(potDetail(computePot(750, 1)!)).toBe('1 paid entry × $7.50');
  });
  it('payout: one winner takes it, co-winners split (rounded down to the cent)', () => {
    expect(payoutLine(computePot(1000, 18), 1)).toBe('Wins the $180 pot');
    expect(payoutLine(computePot(1000, 18), 2)).toBe('Split the $180 pot · $90 each');
    expect(payoutLine(computePot(1000, 10), 3)).toBe('Split the $100 pot · $33.33 each');
    expect(payoutLine(computePot(1000, 0), 1)).toBeNull();
    expect(payoutLine(null, 1)).toBeNull();
    expect(payoutLine(computePot(1000, 4), 0)).toBeNull();
  });
});
