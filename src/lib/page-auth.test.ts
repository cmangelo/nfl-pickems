import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Next.js partial rendering skips layouts the client says it already has (RSC + Next-Router-State-Tree headers),
// so a layout is NOT a security boundary. Every page, server action and route handler must enforce auth itself.

const SRC = path.join(process.cwd(), 'src', 'app');
const APP = path.join(SRC, '(app)');

function walk(dir: string, match: (name: string) => boolean): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p, match);
    return match(e.name) ? [p] : [];
  });
}

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');
const isAdminPath = (p: string) => rel(p).startsWith('(app)/admin/');

describe('every page under (app) enforces auth itself', () => {
  const pages = walk(APP, (n) => n === 'page.tsx');

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of pages) {
    const admin = isAdminPath(file);
    it(`${rel(file)} awaits ${admin ? 'requireAdmin' : 'requireUser'}() before any other await`, () => {
      const src = fs.readFileSync(file, 'utf8');
      const start = src.search(/export\s+default\s/);
      expect(start, 'default exported page function').toBeGreaterThanOrEqual(0);
      const body = src.slice(start);
      expect(body, 'page function must be async').toMatch(/^export\s+default\s+async\s+function/);
      // The first await in the page must be the auth call, so no data is read before it.
      const firstAwait = body.match(/await\s+([A-Za-z_$][\w$]*)\s*\(/);
      expect(firstAwait?.[1], 'first await in the page').toMatch(admin ? /^requireAdmin$/ : /^(requireUser|requireAdmin)$/);
      expect(src.slice(0, start)).toMatch(/from '@\/lib\/auth'/);
    });
  }
});

describe('server actions and route handlers authenticate', () => {
  it('every exported action in (app)/**/actions.ts calls requireUser/requireAdmin', () => {
    for (const file of walk(APP, (n) => n === 'actions.ts')) {
      const src = fs.readFileSync(file, 'utf8');
      const chunks = src.split(/^export async function /m).slice(1);
      expect(chunks.length, rel(file)).toBeGreaterThan(0);
      for (const chunk of chunks) {
        const fn = chunk.split('(')[0];
        const re = isAdminPath(file) ? /await requireAdmin\(\)/ : /await requireUser\(\)/;
        expect(chunk, `${rel(file)}:${fn}`).toMatch(re);
      }
    }
  });

  it('every /api/test route calls testGuard first', () => {
    const routes = walk(path.join(SRC, 'api', 'test'), (n) => n === 'route.ts');
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      expect(fs.readFileSync(file, 'utf8'), rel(file)).toMatch(/const blocked = testGuard\(\);\s*if \(blocked\) return blocked;/);
    }
  });

  it('the cron route checks CRON_SECRET', () => {
    const src = fs.readFileSync(path.join(SRC, 'api', 'cron', 'sync', 'route.ts'), 'utf8');
    expect(src).toMatch(/CRON_SECRET/);
  });
});
