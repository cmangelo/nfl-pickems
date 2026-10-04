import { describe, expect, it } from 'vitest';
import { ESPN_LOGO_BASE, displayScore, entryCount, liveLabel, liveStanding, logoVariants, periodLabel, splitPercents, teamLogoUrl } from './game-view';

const live = (over: Partial<Parameters<typeof liveLabel>[0]> = {}) =>
  liveLabel({ status: 'scheduled', liveStatus: 'STATUS_IN_PROGRESS', livePeriod: 3, liveClock: '4:12', ...over });

describe('periodLabel', () => {
  it('names quarters and overtimes', () => {
    expect([1, 2, 3, 4, 5, 6].map(periodLabel)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT']);
  });
});

describe('liveLabel', () => {
  it('quarter and clock while in progress', () => {
    expect(live()).toBe('Q3 · 4:12');
    expect(live({ livePeriod: 5, liveClock: '2:00' })).toBe('OT · 2:00');
    expect(live({ liveClock: null })).toBe('Q3');
  });

  it('halftime, end of a quarter, delayed', () => {
    expect(live({ liveStatus: 'STATUS_HALFTIME', livePeriod: 2, liveClock: '0:00' })).toBe('Halftime');
    expect(live({ liveStatus: 'STATUS_END_PERIOD', livePeriod: 1, liveClock: '0:00' })).toBe('End of Q1');
    expect(live({ liveStatus: 'STATUS_DELAYED' })).toBe('Delayed');
  });

  it('live with no period yet', () => {
    expect(live({ livePeriod: null })).toBe('Live');
  });

  it('null when not live', () => {
    expect(live({ liveStatus: null })).toBeNull();
    for (const status of ['final', 'postponed', 'void'] as const) expect(live({ status })).toBeNull();
  });
});

describe('logoVariants', () => {
  it('dark-background logo first on dark surfaces, standard first on light ones', () => {
    expect(logoVariants(false)).toEqual(['500-dark', '500']);
    expect(logoVariants(true)).toEqual(['500', '500-dark']);
  });
});

describe('teamLogoUrl', () => {
  it('uses the lowercase ESPN abbreviation', () => {
    expect(teamLogoUrl('WSH')).toBe(`${ESPN_LOGO_BASE}/500-dark/wsh.png`);
    expect(ESPN_LOGO_BASE).toBe('https://a.espncdn.com/i/teamlogos/nfl');
    expect(teamLogoUrl('KC', '500', '/api/test/logo')).toBe('/api/test/logo/500/kc.png');
  });
});

describe('splitPercents / entryCount', () => {
  it('adds up to 100 and handles one-sided and empty splits', () => {
    expect(splitPercents(1, 2)).toEqual({ away: 33, home: 67 });
    expect(splitPercents(2, 1)).toEqual({ away: 67, home: 33 });
    expect(splitPercents(1, 1)).toEqual({ away: 50, home: 50 });
    expect(splitPercents(0, 5)).toEqual({ away: 0, home: 100 });
    expect(splitPercents(3, 0)).toEqual({ away: 100, home: 0 });
    expect(splitPercents(0, 0)).toBeNull();
    for (let a = 0; a <= 7; a++) for (let h = 0; h <= 7; h++) {
      const p = splitPercents(a, h);
      if (p) expect(p.away + p.home).toBe(100);
    }
  });
  it('pluralizes entries', () => {
    expect(entryCount(1)).toBe('1 entry');
    expect(entryCount(0)).toBe('0 entries');
    expect(entryCount(3)).toBe('3 entries');
  });
});

describe('displayScore / liveStanding', () => {
  const base = {
    status: 'scheduled' as const,
    winner: null,
    homeScore: null,
    awayScore: null,
    liveStatus: 'STATUS_IN_PROGRESS',
    livePeriod: 3,
    liveClock: '4:12',
    liveHomeScore: 17,
    liveAwayScore: 10,
  };

  it('live score while in progress', () => {
    expect(displayScore(base)).toEqual({ home: 17, away: 10, live: true });
  });

  it('final score once settled, even if stale live data remains', () => {
    expect(displayScore({ ...base, status: 'final', winner: 'away', homeScore: 20, awayScore: 23 })).toEqual({ home: 20, away: 23, live: false });
  });

  it('null when not live and not settled', () => {
    expect(displayScore({ ...base, liveStatus: null })).toBeNull();
    expect(displayScore({ ...base, status: 'postponed' })).toBeNull();
    expect(displayScore({ ...base, status: 'void' })).toBeNull();
    expect(displayScore({ ...base, liveHomeScore: null })).toBeNull();
    expect(displayScore({ ...base, status: 'final', winner: null, homeScore: 1, awayScore: 0 })).toBeNull();
  });

  it('standing of a pick in a live game', () => {
    const s = displayScore(base);
    expect(liveStanding('home', s)).toBe('leading');
    expect(liveStanding('away', s)).toBe('trailing');
    expect(liveStanding('away', { home: 7, away: 7, live: true })).toBe('tied');
  });

  it('no standing without a pick, a score, or once final', () => {
    expect(liveStanding(undefined, displayScore(base))).toBeNull();
    expect(liveStanding('home', null)).toBeNull();
    expect(liveStanding('home', { home: 20, away: 3, live: false })).toBeNull();
  });
});
