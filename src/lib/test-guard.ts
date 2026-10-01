import { isTestMode } from './time';

/** Returns a 404 response unless TEST_MODE=1. Every /api/test/* handler must call this first. */
export function testGuard(): Response | null {
  return isTestMode() ? null : new Response('Not Found', { status: 404 });
}
