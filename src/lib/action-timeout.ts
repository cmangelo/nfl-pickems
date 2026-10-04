/** How long the client waits for a server action before giving up (the request may have been lost, e.g. the phone slept). */
export const ACTION_TIMEOUT_MS = 20_000;
/** Admin actions that pull from ESPN (whole season, forced sync) legitimately take longer. */
export const SLOW_ACTION_TIMEOUT_MS = 90_000;

export const TIMEOUT_MESSAGE = 'No response from the server. Check your connection and try again.';

export class ActionTimeoutError extends Error {
  constructor(ms: number) {
    super(`server action timed out after ${ms} ms`);
    this.name = 'ActionTimeoutError';
  }
}

/** Settles like `promise`, or rejects with ActionTimeoutError after `ms`. The timer never outlives the promise. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ActionTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** User-facing copy for a failed action call: the timeout message, else the caller's generic fallback. */
export function actionErrorMessage(e: unknown, fallback: string): string {
  return e instanceof ActionTimeoutError ? TIMEOUT_MESSAGE : fallback;
}
