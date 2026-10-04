import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionTimeoutError, TIMEOUT_MESSAGE, actionErrorMessage, withTimeout } from './action-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('passes through the original rejection', async () => {
    const err = new Error('boom');
    await expect(withTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('rejects with ActionTimeoutError when the promise never settles', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<never>(() => {}), 500);
    const assertion = expect(p).rejects.toBeInstanceOf(ActionTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('does not fire before the deadline', async () => {
    vi.useFakeTimers();
    let settled = false;
    void withTimeout(new Promise<never>(() => {}), 500).catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('clears its timer once the promise settles', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve('ok'), 500);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('actionErrorMessage', () => {
  it('uses the connection copy for a timeout', () => {
    expect(actionErrorMessage(new ActionTimeoutError(10), 'Something went wrong.')).toBe(TIMEOUT_MESSAGE);
  });

  it('uses the fallback for any other error', () => {
    expect(actionErrorMessage(new Error('x'), 'Something went wrong.')).toBe('Something went wrong.');
    expect(actionErrorMessage('nope', 'Load failed.')).toBe('Load failed.');
  });
});
