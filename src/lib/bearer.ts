import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time, length-safe check of an `Authorization` header against `Bearer <secret>`.
 * Both sides are hashed to equal-length digests first, so timingSafeEqual never throws on a length mismatch
 * and the comparison time does not depend on how much of the token matched.
 */
export function bearerMatches(header: string | null | undefined, secret: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(header ?? ''), digest(`Bearer ${secret}`));
}
