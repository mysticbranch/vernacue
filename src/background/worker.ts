import {
  readStore,
  mutate,
  patchSettings,
  saveKey,
  keyStatus,
  readKey,
  storageReady,
} from '../storage/store';
import { normalizeSettings, normalizeStore, providers } from '../core/settings';
import { parseJson3, pickTrack } from '../core/cues';
import { probeTracks, fetchCaption, videoId, captionUrl } from '../sites/youtube';
import { generate, cancelOwner } from '../ai/client';
import { listModels } from '../ai/providers';
import { clearCache } from '../storage/cache';
import type { Provider, Track, Reply } from '../core/types';

const observed = new Map<number, { id: string; url: string; language: string }>();
const captionJobs = new Map<number, number>();
function trusted(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
}
function contentTab(sender: chrome.runtime.MessageSender) {
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !sender.tab?.id ||
    !videoId(sender.url || '')
  )
    throw new Error('This action requires a YouTube watch page.');
  return sender.tab.id;
}
const provider = (v: unknown): Provider => {
  if (!Object.hasOwn(providers, String(v))) throw new Error('Invalid provider.');
  return v as Provider;
};
function requireTrusted(sender: chrome.runtime.MessageSender) {
  if (!trusted(sender)) throw new Error('Open Vernacue Settings to change this.');
}
async function loadCaptions(tabId: number, id: string, source: string) {
  const generation = (captionJobs.get(tabId) || 0) + 1;
  captionJobs.set(tabId, generation);
  const tracks = await probeTracks(tabId, id);
  let track = pickTrack(tracks, source);
  const last = observed.get(tabId);
  if (
    !track &&
    last?.id === id &&
    (source === 'auto' || last.language.toLowerCase() === source.toLowerCase())
  )
    track = { baseUrl: last.url, languageCode: last.language, name: last.language };
  if (!track)
    return {
      tracks: tracks.map(({ baseUrl, ...t }) => t),
      cues: [],
      language: '',
      status: tracks.length
        ? 'That caption language is unavailable. Choose an available track.'
        : 'No caption track found yet. Turn on YouTube CC, then Retry captions.',
    };
  // The player's actual request may contain fresh proof/session parameters that
  // are missing from its earlier metadata URL. Prefer it for the same track.
  const observedUrl =
    last?.id === id && last.language.toLowerCase() === track.languageCode.toLowerCase()
      ? last.url
      : '';
  let data: unknown;
  try {
    data = await fetchCaption(tabId, observedUrl || track.baseUrl, id);
  } catch (error) {
    if (!observedUrl || observedUrl === track.baseUrl) throw error;
    data = await fetchCaption(tabId, track.baseUrl, id);
  }
  if (generation !== captionJobs.get(tabId)) throw new Error('Caption request replaced.');
  const cues = parseJson3(data);
  return {
    tracks: tracks.map(({ baseUrl, ...t }) => t),
    cues,
    language: track.languageCode,
    status: cues.length
      ? `${track.name}${track.kind ? ' · automatic captions' : ''}`
      : 'YouTube returned no subtitle cues. Try another caption track.',
  };
}
async function handle(msg: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (!msg || typeof msg.type !== 'string') throw new Error('Invalid message.');
  await storageReady;
  if (msg.type === 'settings:get') {
    if (!trusted(sender)) contentTab(sender);
    return readStore();
  }
  if (msg.type === 'captions') {
    const tab = contentTab(sender);
    const id = videoId(sender.url!);
    if (msg.videoId !== id || typeof msg.source !== 'string' || !/^[\w-]{1,60}$/.test(msg.source))
      throw new Error('Video changed. Retry captions.');
    await chrome.storage.session.set({ [`active:${tab}`]: { id, documentId: sender.documentId } });
    return loadCaptions(tab, id, msg.source);
  }
  if (msg.type === 'ai') {
    const tab = contentTab(sender);
    const active = (await chrome.storage.session.get(`active:${tab}`))[`active:${tab}`];
    if (!active || active.id !== videoId(sender.url!) || active.documentId !== sender.documentId)
      throw new Error('Start studying this video first.');
    return generate(msg.request, String(tab));
  }
  if (msg.type === 'cancel' || msg.type === 'stop') {
    const tab = contentTab(sender);
    cancelOwner(String(tab));
    if (msg.type === 'stop') {
      captionJobs.set(tab, (captionJobs.get(tab) || 0) + 1);
      await chrome.storage.session.remove(`active:${tab}`);
    }
    return true;
  }
  if (msg.type === 'favorite') {
    if (!trusted(sender)) contentTab(sender);
    if (typeof msg.language !== 'string' || !/^[\w-]{1,60}$/.test(msg.language))
      throw new Error('Invalid language.');
    return mutate((s) => ({
      ...s,
      favorites: s.favorites.includes(msg.language)
        ? s.favorites.filter((l) => l !== msg.language)
        : [...s.favorites, msg.language],
    }));
  }
  if (msg.type === 'recent') {
    if (!trusted(sender)) contentTab(sender);
    if (typeof msg.language !== 'string') throw new Error('Invalid language.');
    return mutate((s) => ({
      ...s,
      recent: [msg.language, ...s.recent.filter((l) => l !== msg.language)].slice(0, 8),
    }));
  }
  requireTrusted(sender);
  switch (msg.type) {
    case 'settings:patch':
      return patchSettings(msg.patch, msg.revision);
    case 'key:status':
      return { hasKey: await keyStatus(provider(msg.provider)) };
    case 'key:save':
      if (typeof msg.key !== 'string') throw new Error('Invalid key.');
      await saveKey(provider(msg.provider), msg.key, msg.remember === true);
      return { hasKey: !!msg.key.trim() };
    case 'models': {
      const p = provider(msg.provider);
      if (!(await chrome.permissions.contains({ origins: [providers[p].origin] })))
        throw new Error('Allow provider access first.');
      const key = await readKey(p);
      if (!key) throw new Error('Save an API key first.');
      return listModels(p, key);
    }
    case 'test':
      return generate({ ...msg.request, cache: false }, 'settings');
    case 'cache:clear':
      await clearCache();
      return true;
    case 'profile:save':
      return mutate((s) => {
        const name = String(msg.name || '')
          .trim()
          .slice(0, 60);
        if (!name) throw new Error('Enter a profile name.');
        const id = msg.new ? crypto.randomUUID() : s.activeProfile || crypto.randomUUID();
        const profiles = s.profiles.filter((p) => p.id !== id);
        if (profiles.length >= 100) throw new Error('Profile limit reached.');
        profiles.push({ id, name, settings: s.settings });
        return { ...s, profiles, activeProfile: id };
      });
    case 'profile:apply':
      return mutate((s) => {
        const p = s.profiles.find((p) => p.id === msg.id);
        if (!p) throw new Error('Profile not found.');
        return { ...s, activeProfile: p.id, settings: p.settings };
      });
    case 'profile:delete':
      return mutate((s) => ({
        ...s,
        profiles: s.profiles.filter((p) => p.id !== msg.id),
        activeProfile: s.activeProfile === msg.id ? '' : s.activeProfile,
      }));
    case 'import':
      return mutate((s) => {
        if (msg.revision !== s.revision)
          throw new Error('Settings changed. Review the import again.');
        return normalizeStore(msg.store);
      });
    case 'tab:command': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !videoId(tab.url || '')) throw new Error('Open a YouTube watch page first.');
      if (!['start', 'stop', 'status', 'panel', 'settings'].includes(msg.command))
        throw new Error('Invalid command.');
      return chrome.tabs.sendMessage(tab.id, {
        type: 'command',
        command: msg.command,
        settings: normalizeSettings((await readStore()).settings),
      });
    }
    default:
      throw new Error('Unknown action.');
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies Reply))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Action failed.',
      } satisfies Reply),
    );
  return true;
});
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (
      details.tabId < 0 ||
      details.initiator === chrome.runtime.getURL('').replace(/\/$/, '') ||
      details.type === 'other'
    )
      return;
    try {
      const u = new URL(details.url);
      const id = u.searchParams.get('v') || '';
      if (!id) return;
      observed.set(details.tabId, {
        id,
        url: captionUrl(details.url, id),
        language: u.searchParams.get('lang') || 'und',
      });
    } catch {
      /* Ignore unrelated or invalid requests. */
    }
    return undefined;
  },
  { urls: ['https://www.youtube.com/api/timedtext*'] },
);
chrome.tabs.onRemoved.addListener((tab) => {
  observed.delete(tab);
  captionJobs.delete(tab);
  cancelOwner(String(tab));
  void chrome.storage.session.remove(`active:${tab}`);
});
