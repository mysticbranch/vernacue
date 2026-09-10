import type { Appearance, Settings, Store, Provider } from './types';
export const providers: Record<Provider, { name: string; origin: string; hint: string }> = {
  groq: {
    name: 'Groq',
    origin: 'https://api.groq.com/*',
    hint: 'Get your key at console.groq.com',
  },
  openai: {
    name: 'OpenAI',
    origin: 'https://api.openai.com/*',
    hint: 'Use an OpenAI API key, not a ChatGPT subscription.',
  },
  gemini: {
    name: 'Gemini · Google AI Studio',
    origin: 'https://generativelanguage.googleapis.com/*',
    hint: 'Use a key from aistudio.google.com. No Vertex AI configuration.',
  },
  openrouter: {
    name: 'OpenRouter',
    origin: 'https://openrouter.ai/*',
    hint: 'Use an OpenRouter key and a provider/model identifier.',
  },
};
export const appearance: Appearance = {
  size: 24,
  width: 86,
  padding: 12,
  text: '#ffffff',
  background: '#142f53',
  opacity: 96,
  position: 'bottom',
  lineHeight: 1.5,
};
export const defaults: Settings = {
  source: 'auto',
  target: 'en',
  explanation: '',
  translate: false,
  showOriginal: true,
  provider: 'groq',
  model: '',
  merge: false,
  mergeChars: 220,
  mergeGap: 700,
  shortcuts: true,
  autoPause: false,
  speech: false,
  remoteVoices: false,
  voice: '',
  cache: true,
  appearance,
  theme: 'light',
};
const num = (v: unknown, base: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : base;
const bool = (v: unknown, base: boolean) => (typeof v === 'boolean' ? v : base);
const str = (v: unknown, max = 160) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
export function languageTag(value: unknown, fallback = 'en'): string {
  const s = str(value, 60);
  if (s === 'auto') return 'auto';
  try {
    return Intl.getCanonicalLocales(s)[0] || fallback;
  } catch {
    return fallback;
  }
}
export function normalizeSettings(value: unknown): Settings {
  const s = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  const a = s.appearance || appearance;
  const color = (v: unknown, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : fallback;
  return {
    source: languageTag(s.source, 'auto'),
    target: languageTag(s.target, 'en') === 'auto' ? 'en' : languageTag(s.target),
    explanation: s.explanation ? languageTag(s.explanation) : '',
    translate: bool(s.translate, false),
    showOriginal: bool(s.showOriginal, true),
    provider: Object.hasOwn(providers, String(s.provider)) ? (s.provider as Provider) : 'groq',
    model: str(s.model),
    merge: bool(s.merge, false),
    mergeChars: num(s.mergeChars, 220, 40, 500),
    mergeGap: num(s.mergeGap, 700, 0, 2000),
    shortcuts: bool(s.shortcuts, true),
    autoPause: bool(s.autoPause, false),
    speech: bool(s.speech, false),
    remoteVoices: bool(s.remoteVoices, false),
    voice: str(s.voice),
    cache: bool(s.cache, true),
    theme: ['light', 'dark', 'system'].includes(String(s.theme)) ? s.theme! : 'light',
    appearance: {
      size: num(a.size, 24, 16, 56),
      width: num(a.width, 86, 40, 96),
      padding: num(a.padding, 12, 4, 28),
      text: color(a.text, appearance.text),
      background: color(a.background, appearance.background),
      opacity: num(a.opacity, 96, 40, 100),
      position: a.position === 'top' ? 'top' : 'bottom',
      lineHeight: num(a.lineHeight, 1.5, 1.2, 2),
    },
  };
}
export function initialStore(): Store {
  return {
    version: 1,
    revision: 0,
    settings: normalizeSettings(defaults),
    profiles: [],
    activeProfile: '',
    favorites: [],
    recent: [],
  };
}
export function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== 'object') return initialStore();
  const s = value as Store;
  if (s.version !== 1)
    throw new Error('This settings file uses an unsupported version. Existing data was kept.');
  const seen = new Set<string>();
  const profiles = (Array.isArray(s.profiles) ? s.profiles : []).slice(0, 100).map((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(p.id) ||
      seen.has(p.id) ||
      !str(p.name, 60)
    )
      throw new Error('Invalid or duplicate profile.');
    seen.add(p.id);
    return { id: p.id, name: str(p.name, 60), settings: normalizeSettings(p.settings) };
  });
  const langs = (v: unknown) => [
    ...new Set(
      (Array.isArray(v) ? v : [])
        .slice(0, 200)
        .filter((x) => typeof x === 'string')
        .map((x) => languageTag(x))
        .filter((x) => x !== 'auto'),
    ),
  ];
  return {
    version: 1,
    revision: num(s.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    settings: normalizeSettings(s.settings),
    profiles,
    activeProfile: seen.has(s.activeProfile) ? s.activeProfile : '',
    favorites: langs(s.favorites),
    recent: langs(s.recent).slice(0, 8),
  };
}
export function exportStore(store: Store) {
  return JSON.stringify(normalizeStore(store), null, 2);
}
export function profileModified(store: Store) {
  const p = store.profiles.find((x) => x.id === store.activeProfile);
  return !!p && JSON.stringify(p.settings) !== JSON.stringify(store.settings);
}
