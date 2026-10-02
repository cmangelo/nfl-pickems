import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Stand-in for ESPN's logo CDN under TEST_MODE: a neutral badge with the team abbreviation (no network in tests). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const { path } = await params;
  const abbr = (path.at(-1) ?? '').replace(/\.png$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#2a2f3a"/><text x="20" y="24.5" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#e6e8ec">${abbr}</text></svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
}
