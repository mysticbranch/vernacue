import type { Track } from '../core/types';
export function videoId(url: string) {
  try {
    const u = new URL(url);
    return u.origin === 'https://www.youtube.com' &&
      u.pathname === '/watch' &&
      /^[\w-]{6,20}$/.test(u.searchParams.get('v') || '')
      ? u.searchParams.get('v')!
      : '';
  } catch {
    return '';
  }
}
export function captionUrl(value: string, id: string): string {
  const u = new URL(value);
  if (
    u.origin !== 'https://www.youtube.com' ||
    u.pathname !== '/api/timedtext' ||
    u.username ||
    u.password ||
    (u.searchParams.has('v') && u.searchParams.get('v') !== id)
  )
    throw new Error('Invalid caption source.');
  u.searchParams.set('fmt', 'json3');
  return u.href;
}
// Executed in YouTube's MAIN world. Self-contained, read-only and returns data only.
export function probePage() {
  const id = new URL(location.href).searchParams.get('v') || '';
  const player = document.getElementById('movie_player') as any;
  const w = window as any;
  const candidates = [
    player?.getPlayerResponse?.(),
    w.ytInitialPlayerResponse,
    w.ytplayer?.config?.args?.player_response,
  ];
  for (let candidate of candidates) {
    try {
      if (typeof candidate === 'string') candidate = JSON.parse(candidate);
      if (candidate?.videoDetails?.videoId !== id) continue;
      const tracks = candidate?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      return {
        videoId: id,
        tracks: tracks.map((t: any) => ({
          languageCode: t.languageCode,
          baseUrl: t.baseUrl,
          kind: t.kind,
          name:
            t.name?.simpleText || t.name?.runs?.map((r: any) => r.text).join('') || t.languageCode,
        })),
      };
    } catch {
      /* Try another current player response. */
    }
  }
  return { videoId: id, tracks: [] };
}
export async function probeTracks(tabId: number, expected: string): Promise<Track[]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: probePage,
  });
  const result = results[0]?.result;
  if (!result || result.videoId !== expected || !Array.isArray(result.tracks)) return [];
  return result.tracks.slice(0, 200).flatMap((t: Track) => {
    try {
      return typeof t.languageCode === 'string' && /^[\w-]{1,60}$/.test(t.languageCode)
        ? [
            {
              languageCode: t.languageCode,
              name: String(t.name || t.languageCode).slice(0, 120),
              baseUrl: captionUrl(t.baseUrl, expected),
              kind: t.kind ? 'asr' : undefined,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
}
export async function fetchCaption(tabId: number, url: string, id: string): Promise<unknown> {
  const safe = captionUrl(url, id);
  try {
    const r = await fetch(safe, {
      credentials: 'include',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    if (r.ok && text.trim() && text.length < 8 * 1024 * 1024) return JSON.parse(text);
  } catch {
    /* Signed caption requests can require the page's cookie partition. */
  }
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [safe, id],
    func: async (url: string, expected: string) => {
      if (new URL(location.href).searchParams.get('v') !== expected) return null;
      const u = new URL(url);
      if (u.origin !== location.origin || u.pathname !== '/api/timedtext') return null;
      try {
        const r = await fetch(u.href, {
          credentials: 'include',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
        const text = await r.text();
        return r.ok && text.length < 8 * 1024 * 1024 && text.trim() ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    },
  });
  if (!result[0]?.result)
    throw new Error(
      'Captions could not be loaded. Turn on YouTube CC, choose a caption track, then retry.',
    );
  return result[0].result;
}
