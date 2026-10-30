import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_LENGTH,
  chatDayKey,
  chatDayLabel,
  chatErrorMessage,
  chatLength,
  chatRemaining,
  chatTimeLabel,
  groupChatByDay,
  mergeChatMessages,
  normalizeChatBody,
  unreadBadgeLabel,
  validateChatBody,
} from './chat-view';

describe('chat body validation', () => {
  it('rejects empty and whitespace-only bodies', () => {
    for (const s of ['', ' ', '\n\n', ' \t\r\n ', '\u0000']) expect(validateChatBody(s), JSON.stringify(s)).toEqual({ ok: false, error: 'empty' });
  });

  it('trims, normalizes line endings and drops NULs', () => {
    expect(normalizeChatBody('  hi\r\nthere\rfriend \u0000 ')).toBe('hi\nthere\nfriend');
    expect(validateChatBody('  go bills  ')).toEqual({ ok: true, body: 'go bills' });
    expect(validateChatBody('line 1\n\nline 2')).toEqual({ ok: true, body: 'line 1\n\nline 2' });
  });

  it('allows exactly 500 characters and rejects 501', () => {
    expect(validateChatBody('a'.repeat(CHAT_MAX_LENGTH))).toEqual({ ok: true, body: 'a'.repeat(500) });
    expect(validateChatBody('a'.repeat(501))).toEqual({ ok: false, error: 'too_long' });
    // Surrounding whitespace doesn't count.
    expect(validateChatBody(`  ${'a'.repeat(500)}\n`).ok).toBe(true);
  });

  it('counts an emoji as one character (code points, not UTF-16 units)', () => {
    expect('🏈'.length).toBe(2);
    expect(chatLength('🏈')).toBe(1);
    expect(chatLength('go 🏈🏈!')).toBe(6);
    expect(validateChatBody('🏈'.repeat(500)).ok).toBe(true);
    expect(validateChatBody('🏈'.repeat(501))).toEqual({ ok: false, error: 'too_long' });
    expect(validateChatBody(`${'a'.repeat(499)}🏈`).ok).toBe(true);
    expect(validateChatBody(`${'a'.repeat(500)}🏈`)).toEqual({ ok: false, error: 'too_long' });
  });

  it('chatRemaining counts the trimmed text', () => {
    expect(chatRemaining('')).toBe(500);
    expect(chatRemaining('  hi 🏈  ')).toBe(496);
    expect(chatRemaining('a'.repeat(510))).toBe(-10);
  });

  it('has copy for every error', () => {
    expect(chatErrorMessage('empty')).toMatch(/message/);
    expect(chatErrorMessage('too_long')).toMatch(/500/);
    expect(chatErrorMessage('rate_limited')).toMatch(/minute/);
    expect(chatErrorMessage('invalid')).toBeTruthy();
  });
});

describe('chat PT formatting', () => {
  it('day key and label follow the Pacific Time date, not UTC', () => {
    // 2026-10-26T06:59Z = Sun Oct 25 11:59 PM PDT; 07:00Z = Mon Oct 26 00:00 PDT.
    expect(chatDayKey('2026-10-26T06:59:00Z')).toBe('2026-10-25');
    expect(chatDayLabel('2026-10-26T06:59:00Z')).toBe('Sun, Oct 25');
    expect(chatDayKey('2026-10-26T07:00:00Z')).toBe('2026-10-26');
    expect(chatDayLabel(new Date('2026-10-26T07:00:00Z'))).toBe('Mon, Oct 26');
  });

  it('is DST-correct (PST after Nov 1)', () => {
    // 2026-11-03T07:59Z = Mon Nov 2 11:59 PM PST; 08:00Z = Tue Nov 3 00:00 PST.
    expect(chatDayLabel('2026-11-03T07:59:00Z')).toBe('Mon, Nov 2');
    expect(chatDayLabel('2026-11-03T08:00:00Z')).toBe('Tue, Nov 3');
    expect(chatTimeLabel('2026-11-03T08:00:00Z')).toBe('12:00 AM');
  });

  it('time label is h:mm AM/PM in PT', () => {
    expect(chatTimeLabel('2026-10-25T20:05:00Z')).toBe('1:05 PM');
    expect(chatTimeLabel('2026-10-25T07:00:00Z')).toBe('12:00 AM');
    expect(chatTimeLabel('2026-10-25T19:00:00Z')).toBe('12:00 PM');
  });

  it('groups consecutive messages by PT day', () => {
    const m = (id: number, createdAt: string) => ({ id, createdAt });
    const groups = groupChatByDay([
      m(1, '2026-10-25T20:00:00Z'),
      m(2, '2026-10-26T06:59:00Z'),
      m(3, '2026-10-26T07:00:00Z'),
      m(4, '2026-10-27T01:00:00Z'),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.messages.map((x) => x.id)])).toEqual([
      ['2026-10-25', 'Sun, Oct 25', [1, 2]],
      ['2026-10-26', 'Mon, Oct 26', [3, 4]],
    ]);
    expect(groupChatByDay([])).toEqual([]);
  });
});

describe('chat list helpers', () => {
  it('mergeChatMessages dedupes by id and sorts oldest-first', () => {
    const a = [{ id: 3 }, { id: 5 }];
    expect(mergeChatMessages(a, [{ id: 5 }, { id: 6 }, { id: 1 }]).map((x) => x.id)).toEqual([1, 3, 5, 6]);
    expect(mergeChatMessages([], [])).toEqual([]);
  });

  it('unread badge: hidden at 0, number up to 9, then 9+', () => {
    expect(unreadBadgeLabel(0)).toBeNull();
    expect(unreadBadgeLabel(-1)).toBeNull();
    expect(unreadBadgeLabel(NaN)).toBeNull();
    expect(unreadBadgeLabel(1)).toBe('1');
    expect(unreadBadgeLabel(9)).toBe('9');
    expect(unreadBadgeLabel(10)).toBe('9+');
    expect(unreadBadgeLabel(250)).toBe('9+');
  });
});
