import { describe, expect, it } from 'vitest';
import { resolveSeedConfig } from './seed-config';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const full = { ADMIN_USERNAME: 'boss', ADMIN_PIN: '7391', ADMIN_FIRST_NAME: 'Boss' };

describe('resolveSeedConfig', () => {
  it('uses admin/1234/Admin defaults for local pglite', () => {
    expect(resolveSeedConfig(env({}))).toEqual({ username: 'admin', pin: '1234', firstName: 'Admin' });
    expect(resolveSeedConfig(env({ DB_DRIVER: 'memory' }))).toMatchObject({ pin: '1234' });
  });

  it('requires all three vars when the driver is neon (DATABASE_URL implies neon)', () => {
    expect(() => resolveSeedConfig(env({ DATABASE_URL: 'postgres://x' }))).toThrow(/required/);
    expect(() => resolveSeedConfig(env({ DB_DRIVER: 'neon', DATABASE_URL: 'postgres://x', ADMIN_PIN: '7391' }))).toThrow(/required/);
    expect(resolveSeedConfig(env({ DATABASE_URL: 'postgres://x', ...full }))).toEqual({ username: 'boss', pin: '7391', firstName: 'Boss' });
  });

  it('requires all three vars when NODE_ENV=production, even on pglite', () => {
    expect(() => resolveSeedConfig(env({ NODE_ENV: 'production' }))).toThrow(/required/);
    expect(() => resolveSeedConfig(env({ NODE_ENV: 'production', ADMIN_USERNAME: 'boss' }))).toThrow(/required/);
    expect(resolveSeedConfig(env({ NODE_ENV: 'production', ...full }))).toMatchObject({ username: 'boss' });
  });

  it('refuses trivial PINs for neon, including an explicit 1234', () => {
    for (const pin of ['1234', '0000', '1111', '9999', '4321']) {
      expect(() => resolveSeedConfig(env({ DATABASE_URL: 'postgres://x', ...full, ADMIN_PIN: pin })), pin).toThrow(/trivial PIN/);
    }
  });

  it('still allows an explicit 1234 on local pglite', () => {
    expect(resolveSeedConfig(env({ ADMIN_USERNAME: 'dev', ADMIN_PIN: '1234', ADMIN_FIRST_NAME: 'Dev' }))).toMatchObject({ pin: '1234' });
  });

  it('validates PIN and username format', () => {
    expect(() => resolveSeedConfig(env({ DATABASE_URL: 'postgres://x', ...full, ADMIN_PIN: '73' }))).toThrow(/4 digits/);
    expect(() => resolveSeedConfig(env({ DATABASE_URL: 'postgres://x', ...full, ADMIN_USERNAME: 'a b' }))).toThrow(/ADMIN_USERNAME/);
  });
});
