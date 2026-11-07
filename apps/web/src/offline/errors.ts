// Is a failed write worth retrying? Network and server trouble: yes. A refusal by the database
// (SQLSTATE like 42501, 22023, P0002) or a 4xx answer: no, retrying gives the same answer.

export type ApiError = Error & { code?: string; status?: number };

export function isTransient(e: unknown): boolean {
  const err = e as ApiError;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err?.code && /^[0-9A-Z]{5}$/.test(err.code)) return false;
  if (err?.status) {
    if (err.status === 401 || err.status === 408 || err.status === 429) return true;
    return err.status >= 500;
  }
  return true; // no answer from the server at all (fetch failed, timeout)
}

/** Retry delay: 2 s, 4 s, 8 s ... capped at 5 minutes. */
export const backoffMs = (attempts: number) =>
  Math.min(2000 * 2 ** Math.max(0, attempts - 1), 300_000);
