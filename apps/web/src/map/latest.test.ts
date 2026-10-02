import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { latestThrottled } from './latest';

describe('latestThrottled', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls at most once per interval, with the latest arguments', async () => {
    const fn = vi.fn(async (n: number) => n);
    const got: number[] = [];
    const t = latestThrottled(fn, 100, (r) => got.push(r));
    t.call(1); // immediate
    t.call(2);
    t.call(3); // replaces 2
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 3]);
    expect(got).toEqual([1, 3]);
  });

  it('drops a slow older response that arrives after a newer one', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const fn = vi.fn(() => new Promise<string>((r) => resolvers.push(r)));
    const got: string[] = [];
    const t = latestThrottled(fn, 0, (r) => got.push(r));
    t.call();
    await vi.advanceTimersByTimeAsync(1);
    t.call();
    resolvers[1]!('new');
    resolvers[0]!('old');
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toEqual(['new']);
  });

  it('cancel drops scheduled and in-flight calls', async () => {
    const fn = vi.fn(async () => 'x');
    const got: string[] = [];
    const t = latestThrottled(fn, 100, (r) => got.push(r));
    t.call();
    t.call();
    t.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(got).toEqual([]);
  });
});
