import { describe, expect, it, vi } from 'vitest';
import { runVercelBuild, type BuildDeps } from './vercel-build';

const env = (e: Record<string, string>) => ({ DB_DRIVER: 'neon', ...e }) as unknown as NodeJS.ProcessEnv;

function deps(over: Partial<BuildDeps> = {}) {
  const logs: string[] = [];
  const warns: string[] = [];
  const d: BuildDeps = {
    driver: () => 'neon',
    env: env({ ADMIN_USERNAME: 'dan', ADMIN_PIN: '4827', ADMIN_FIRST_NAME: 'Dan' }),
    migrate: vi.fn(async () => {}),
    seedAdmin: vi.fn(async (c) => ({ username: c.username })),
    countWeeks: vi.fn(async () => 0),
    loadSchedule: vi.fn(async () => ({ weeks: 3, games: 40, fromWeek: 5 })),
    log: (m) => logs.push(m),
    warn: (m) => warns.push(m),
    ...over,
  };
  return { d, logs, warns };
}

describe('runVercelBuild', () => {
  it('skips everything when the driver is not neon', async () => {
    const { d, logs } = deps({ driver: () => 'pglite' });
    await runVercelBuild(d);
    expect(logs.join()).toContain('no DATABASE_URL, skipping DB setup');
    expect(d.migrate).not.toHaveBeenCalled();
    expect(d.seedAdmin).not.toHaveBeenCalled();
    expect(d.loadSchedule).not.toHaveBeenCalled();
  });

  it('throws when migration fails and does nothing after', async () => {
    const { d } = deps({ migrate: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(runVercelBuild(d)).rejects.toThrow('boom');
    expect(d.seedAdmin).not.toHaveBeenCalled();
  });

  it('seeds the admin and imports into an empty db', async () => {
    const { d } = deps();
    await runVercelBuild(d);
    expect(d.seedAdmin).toHaveBeenCalledWith({ username: 'dan', pin: '4827', firstName: 'Dan' });
    expect(d.loadSchedule).toHaveBeenCalledTimes(1);
  });

  it('continues with a warning when admin env is missing', async () => {
    const { d, warns } = deps({ env: env({ ADMIN_USERNAME: 'dan' }) });
    await runVercelBuild(d);
    expect(d.seedAdmin).not.toHaveBeenCalled();
    expect(warns.join()).toContain('skipping admin seed');
    expect(d.loadSchedule).toHaveBeenCalled();
  });

  it('throws on invalid or trivial admin config', async () => {
    const { d } = deps({ env: env({ ADMIN_USERNAME: 'dan', ADMIN_PIN: '1234', ADMIN_FIRST_NAME: 'Dan' }) });
    await expect(runVercelBuild(d)).rejects.toThrow(/trivial PIN/);
    expect(d.seedAdmin).not.toHaveBeenCalled();
  });

  it('skips the import when weeks exist', async () => {
    const { d } = deps({ countWeeks: vi.fn(async () => 5) });
    await runVercelBuild(d);
    expect(d.loadSchedule).not.toHaveBeenCalled();
  });

  it('continues with a warning when ESPN fails', async () => {
    const { d, warns } = deps({ loadSchedule: vi.fn(async () => { throw new Error('espn down'); }) });
    await expect(runVercelBuild(d)).resolves.toBeUndefined();
    expect(warns.join()).toContain('espn down');
  });

  it('handles an ESPN season with nothing left', async () => {
    const { d, logs } = deps({ loadSchedule: vi.fn(async () => null) });
    await runVercelBuild(d);
    expect(logs.join()).toContain('no remaining weeks');
  });
});
