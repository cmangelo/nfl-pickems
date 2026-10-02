import { describe, expect, it } from 'vitest';
import { bearerMatches } from './bearer';

describe('bearerMatches', () => {
  it('accepts only the exact bearer token', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerMatches('Bearer s3cre', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer s3crett', 's3cret')).toBe(false);
    expect(bearerMatches('bearer s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
  });
  it('never throws on missing, empty or very different lengths', () => {
    expect(bearerMatches(null, 's3cret')).toBe(false);
    expect(bearerMatches(undefined, 's3cret')).toBe(false);
    expect(bearerMatches('', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer ' + 'x'.repeat(10_000), 's3cret')).toBe(false);
    expect(bearerMatches('Bearer ', '')).toBe(true); // callers must reject an unset secret first (the route does)
  });
});
