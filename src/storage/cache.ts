import type { AIResult, AIRequest } from '../core/types';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('vernacue', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('answers', { keyPath: 'key' });
      store.createIndex('used', 'used');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
export async function cacheKey(r: AIRequest) {
  const payload = JSON.stringify([
    2,
    r.operation,
    r.text,
    r.context,
    r.word || '',
    r.language,
    r.target,
    r.explanation,
    r.provider,
    r.model,
  ]);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function getCached(key: string): Promise<AIResult | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction('answers', 'readwrite'),
        store = tx.objectStore('answers');
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (row && Date.now() - row.created < 30 * 86400000) {
          store.put({ ...row, used: Date.now() });
          resolve({ ...row.result, cached: true });
        } else {
          if (row) store.delete(key);
          resolve(undefined);
        }
      };
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return;
  }
}
export async function putCached(key: string, result: AIResult) {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('answers', 'readwrite');
      tx.objectStore('answers').put({
        key,
        result,
        created: Date.now(),
        used: Date.now(),
        bytes: JSON.stringify(result).length * 2,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Bound both record count and data size; scan metadata, never fetch a transcript.
    const rows = await new Promise<{ key: string; bytes: number; used: number; created: number }[]>(
      (resolve, reject) => {
        const q = db.transaction('answers').objectStore('answers').index('used').getAll();
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      },
    );
    let bytes = rows.reduce((n, r) => n + r.bytes, 0),
      count = rows.length;
    const tx = db.transaction('answers', 'readwrite');
    for (const row of rows)
      if (count > 3000 || bytes > 50 * 1024 * 1024 || Date.now() - row.created > 30 * 86400000) {
        tx.objectStore('answers').delete(row.key);
        bytes -= row.bytes;
        count--;
      }
  } catch {
    /* Cache is optional: a quota failure must not lose an answer. */
  }
}
export async function clearCache() {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('answers', 'readwrite');
    tx.objectStore('answers').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
