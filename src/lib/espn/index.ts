import { FixtureEspnClient } from './fixture';
import { RealEspnClient } from './real';
import type { EspnClient } from './types';

export * from './types';
export { parseScoreboard } from './parse';

/** ESPN_MODE=fixture => offline fixtures; otherwise the real feed. */
export function getEspnClient(): EspnClient {
  return process.env.ESPN_MODE === 'fixture' ? new FixtureEspnClient() : new RealEspnClient();
}
