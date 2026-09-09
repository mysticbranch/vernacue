import { initialStore, normalizeStore, normalizeSettings } from '../core/settings';
import type { Store, Settings, Provider } from '../core/types';
let queue: Promise<unknown> = Promise.resolve();
export const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
export async function readStore(): Promise<Store> {
  await storageReady;
  const { store } = await chrome.storage.local.get('store');
  return store ? normalizeStore(store) : initialStore();
}
export function mutate(fn: (store: Store) => Store | Promise<Store>): Promise<Store> {
  const run = async () => {
    const previous = await readStore();
    const next = normalizeStore(await fn(previous));
    next.revision = previous.revision + 1;
    await chrome.storage.local.set({ store: next });
    return next;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
export function patchSettings(patch: Partial<Settings>, revision: number) {
  return mutate((s) => {
    if (revision !== s.revision)
      throw new Error('Settings changed in another window. Reload before saving.');
    return { ...s, settings: normalizeSettings({ ...s.settings, ...patch }) };
  });
}
export async function keyStatus(provider: Provider) {
  return !!(await readKey(provider));
}
export async function readKey(provider: Provider): Promise<string> {
  await storageReady;
  const name = `key:${provider}`;
  const temporary = await chrome.storage.session.get(name);
  const saved = await chrome.storage.local.get(name);
  return typeof temporary[name] === 'string'
    ? temporary[name]
    : typeof saved[name] === 'string'
      ? saved[name]
      : '';
}
export async function saveKey(provider: Provider, value: string, remember: boolean) {
  await storageReady;
  const name = `key:${provider}`,
    key = value.trim();
  if (key.length > 2048 || /[\r\n]/.test(key)) throw new Error('Invalid API key.');
  if (!key) {
    await chrome.storage.local.remove(name);
    await chrome.storage.session.remove(name);
    return;
  }
  if (remember) {
    await chrome.storage.local.set({ [name]: key });
    await chrome.storage.session.remove(name);
  } else {
    await chrome.storage.session.set({ [name]: key });
    await chrome.storage.local.remove(name);
  }
}
