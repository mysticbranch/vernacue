export type Provider = 'groq' | 'openai' | 'gemini' | 'openrouter';
export type Operation = 'translate' | 'breakdown' | 'word';
export interface Cue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  members: string[];
}
export interface Track {
  languageCode: string;
  name: string;
  baseUrl: string;
  kind?: string;
}
export interface Appearance {
  size: number;
  width: number;
  padding: number;
  text: string;
  background: string;
  opacity: number;
  position: 'top' | 'bottom';
  lineHeight: number;
}
export interface Settings {
  source: string;
  target: string;
  explanation: string;
  translate: boolean;
  showOriginal: boolean;
  provider: Provider;
  model: string;
  merge: boolean;
  mergeChars: number;
  mergeGap: number;
  shortcuts: boolean;
  autoPause: boolean;
  speech: boolean;
  remoteVoices: boolean;
  voice: string;
  cache: boolean;
  appearance: Appearance;
  theme: 'system' | 'light' | 'dark';
}
export interface Profile {
  id: string;
  name: string;
  settings: Settings;
}
export interface Store {
  version: 1;
  revision: number;
  settings: Settings;
  profiles: Profile[];
  activeProfile: string;
  favorites: string[];
  recent: string[];
}
export interface AIRequest {
  id: string;
  operation: Operation;
  text: string;
  language: string;
  target: string;
  explanation: string;
  context: string;
  word?: string;
  provider: Provider;
  model: string;
  cache: boolean;
}
export interface AIResult {
  translation?: string;
  chunks?: { text: string; meaning: string }[];
  word?: string;
  meaning?: string;
  general?: string;
  note?: string;
  cached?: boolean;
}
export interface SessionStatus {
  active: boolean;
  videoId: string;
  status: string;
  language: string;
  count: number;
  settings?: Settings;
}
export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
