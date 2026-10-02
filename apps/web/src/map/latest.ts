/**
 * Calls `fn` at most once per `intervalMs` with the most recent arguments, and only delivers
 * the result of the newest call (older, slower responses are dropped). Used for the cursor
 * readout, which asks the database for site grid x, y while the mouse moves.
 */
export function latestThrottled<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  intervalMs: number,
  onResult: (result: R) => void,
  onError: (error: unknown) => void = () => {},
) {
  let seq = 0;
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = (args: A) => {
    last = Date.now();
    const mine = ++seq;
    fn(...args).then(
      (r) => mine === seq && onResult(r),
      (e) => mine === seq && onError(e),
    );
  };

  return {
    call(...args: A) {
      pending = args;
      const wait = last + intervalMs - Date.now();
      if (wait <= 0 && !timer) {
        pending = null;
        run(args);
      } else if (!timer) {
        timer = setTimeout(
          () => {
            timer = null;
            if (pending) {
              const a = pending;
              pending = null;
              run(a);
            }
          },
          Math.max(wait, 0),
        );
      }
    },
    /** Drop any in-flight or scheduled call (for example when the mouse leaves the map). */
    cancel() {
      seq++;
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
