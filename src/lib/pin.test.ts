import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin';

describe('pin hashing', () => {
  it('uses the scrypt$salt$hash format and never contains the PIN', async () => {
    const h = await hashPin('1234');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  });
  it('salts: same PIN hashes differently', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });
  it('verifies correct and rejects wrong PINs', async () => {
    const h = await hashPin('4821');
    expect(await verifyPin('4821', h)).toBe(true);
    expect(await verifyPin('4822', h)).toBe(false);
  });
  it('rejects malformed stored hashes', async () => {
    expect(await verifyPin('1234', 'sha256:abc')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });
});
