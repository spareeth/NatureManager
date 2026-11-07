import { db } from './db';
import { isTransient } from './errors';

/** Read from the server and keep a copy; without network, use the copy (memberships, sites). */
export async function cachedRead<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    // Known to be offline: do not wait for requests to fail.
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new TypeError('offline');
    const v = await fn();
    await db.kv.put({ key, value: v, savedAt: new Date().toISOString() }).catch(() => undefined);
    return v;
  } catch (e) {
    if (!isTransient(e)) throw e;
    const row = await db.kv.get(key).catch(() => undefined);
    if (row === undefined) throw e;
    return row.value as T;
  }
}
