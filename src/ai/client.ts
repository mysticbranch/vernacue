import { readKey } from '../storage/store';
import { cacheKey, getCached, putCached } from '../storage/cache';
import { validateRequest, parseResult } from './contracts';
import { requestSpec, responseText, httpError } from './providers';
import { providers } from '../core/settings';
import type { AIRequest, AIResult } from '../core/types';
const jobs = new Map<string, AbortController>();
export function cancelOwner(owner: string) {
  for (const [id, c] of jobs)
    if (id.startsWith(`${owner}:`)) {
      c.abort();
      jobs.delete(id);
    }
}
export async function generate(value: AIRequest, owner: string): Promise<AIResult> {
  const r = validateRequest(value);
  const id = `${owner}:${r.id}`;
  if (jobs.size >= 8)
    throw new Error('Too many pending requests. Wait for an answer or stop another study session.');
  const controller = new AbortController();
  jobs.get(id)?.abort();
  jobs.set(id, controller);
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const hash = await cacheKey(r);
    if (r.cache) {
      const cached = await getCached(hash);
      if (cached) return cached;
    }
    controller.signal.throwIfAborted();
    if (!(await chrome.permissions.contains({ origins: [providers[r.provider].origin] })))
      throw new Error('Connect this provider in Settings to allow API access.');
    const key = await readKey(r.provider);
    if (!key) throw new Error('Add your API key in Settings first.');
    const { url, init } = requestSpec(r, key);
    let response = await fetch(url, { ...init, signal: controller.signal });
    // Retry one transient server response only. Never retry quota/auth/refusal/unknown in-flight work.
    if ([502, 503, 504].includes(response.status)) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 500);
        controller.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      });
      response = await fetch(url, { ...init, signal: controller.signal });
    }
    if (!response.ok) throw new Error(httpError(response.status));
    const raw = await response.text();
    if (raw.length > 200000) throw new Error('Provider response exceeded the size limit.');
    const result = parseResult(responseText(JSON.parse(raw), r.provider), r);
    controller.signal.throwIfAborted();
    if (r.cache) await putCached(hash, result);
    return result;
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error('Request cancelled or timed out. You can retry.');
    throw e;
  } finally {
    clearTimeout(timeout);
    if (jobs.get(id) === controller) jobs.delete(id);
  }
}
