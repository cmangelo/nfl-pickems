import { describe, expect, it } from 'vitest';
import {
  BAR_SURFACE,
  FALLBACK_AWAY,
  FALLBACK_HOME,
  MIN_CONTRAST,
  MIN_DISTANCE,
  TEAM_COLORS,
  barColors,
  contrast,
  distance,
  visibleOnCard,
} from './team-colors';

const TEAMS = Object.keys(TEAM_COLORS);

describe('team colors', () => {
  it('covers all 32 teams with valid hex', () => {
    expect(TEAMS).toHaveLength(32);
    for (const t of TEAMS) for (const c of TEAM_COLORS[t]) expect(c, t).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('keeps a primary that is already visible, and lightens a dark one just enough', () => {
    expect(visibleOnCard('#E31837')).toBe('#e31837'); // KC red is fine as is
    const navy = visibleOnCard('#00338D'); // BUF royal blue is too dark on the card
    expect(navy).not.toBe('#00338d');
    expect(contrast(navy, BAR_SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrast(navy, BAR_SURFACE)).toBeLessThan(MIN_CONTRAST + 0.6);
  });

  it('uses both primaries when they differ', () => {
    expect(barColors('BUF', 'KC')).toEqual({ away: visibleOnCard('#00338D'), home: '#e31837' });
  });

  it('switches the home team to its secondary when the primaries clash', () => {
    // Both navy: New England switches to red.
    const c = barColors('SEA', 'NE');
    expect(c.away).toBe(visibleOnCard('#002244'));
    expect(c.home).toBe(visibleOnCard('#C60C30'));
  });

  it('every matchup is visible on the card and, where possible, distinct', () => {
    let clashes = 0;
    for (const a of TEAMS)
      for (const h of TEAMS) {
        if (a === h) continue;
        const c = barColors(a, h);
        expect(contrast(c.away, BAR_SURFACE), `${a}@${h}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(contrast(c.home, BAR_SURFACE), `${a}@${h}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        if (distance(c.away, c.home) < MIN_DISTANCE) clashes++;
      }
    expect(clashes).toBe(0);
  });

  it('unknown teams fall back to the blue / orange pair', () => {
    expect(barColors('H0', 'A0')).toEqual({ away: FALLBACK_AWAY, home: FALLBACK_HOME });
  });
});
