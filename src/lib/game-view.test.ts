import { describe, expect, it } from 'vitest';
import { ESPN_LOGO_BASE, liveLabel, logoVariants, periodLabel, teamLogoUrl } from './game-view';

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
