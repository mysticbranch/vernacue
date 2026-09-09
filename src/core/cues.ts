import type { Cue, Track } from './types';
export function parseJson3(data: unknown): Cue[] {
  const events = (data as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) throw new Error('Captions did not contain a subtitle timeline.');
  const cues: Cue[] = [];
  for (const value of events.slice(0, 100000)) {
    const e = value as {
      segs?: { utf8?: string }[];
      tStartMs?: number;
      dDurationMs?: number;
      aAppend?: number;
    };
    if (!Array.isArray(e?.segs)) continue;
    const text = e.segs
      .map((s) => (typeof s.utf8 === 'string' ? s.utf8 : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
    const startMs = Number(e.tStartMs),
      duration = Number(e.dDurationMs);
    if (
      !text ||
      !Number.isFinite(startMs) ||
      startMs < 0 ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      continue;
    const endMs = startMs + duration;
    if (!Number.isSafeInteger(Math.ceil(endMs))) continue;
    const last = cues.at(-1);
    if (last && (e.aAppend || (last.startMs === startMs && text.startsWith(last.text)))) {
      last.text = e.aAppend ? joinText(last.text, text) : text;
      last.endMs = Math.max(last.endMs, endMs);
      continue;
    }
    if (last && last.text === text && startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, endMs);
      continue;
    }
    const id = `${cues.length}:${startMs}`;
    cues.push({ id, startMs, endMs, text, members: [id] });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}
export function joinText(a: string, b: string) {
  return (
    a +
    (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai}/u.test(
      a.at(-1) || '',
    ) && /^(?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai})/u.test(b)
      ? ''
      : ' ') +
    b
  );
}
export function mergeCues(cues: Cue[], maxChars = 220, gap = 700): Cue[] {
  const result: Cue[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const cue of cues) {
    const last = result.at(-1),
      joined = last ? joinText(last.text, cue.text) : cue.text;
    if (
      last &&
      cue.startMs - last.endMs <= gap &&
      Math.max(last.endMs, cue.endMs) - last.startMs <= 12000 &&
      [...segmenter.segment(joined)].length <= maxChars &&
      !/[.!?。！？]$/.test(last.text) &&
      !/^[-–—♪[]/.test(cue.text)
    ) {
      last.text = joined;
      last.endMs = Math.max(last.endMs, cue.endMs);
      last.members.push(...cue.members);
      last.id = last.members.join('|');
    } else result.push({ ...cue, members: [...cue.members] });
  }
  return result;
}
export function cueAt(cues: Cue[], ms: number): Cue | undefined {
  let lo = 0,
    hi = cues.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return;
  // Prefer the newest active cue; preserve enclosing overlaps after a short cue ends.
  for (let i = found; i >= 0; i--) if (ms < cues[i].endMs) return cues[i];
}
export function pickTrack(tracks: Track[], wanted: string): Track | undefined {
  if (wanted === 'auto') return tracks.find((t) => !t.kind) || tracks[0];
  const canonical = wanted.toLowerCase(),
    base = canonical.split('-')[0];
  const rank = (t: Track) => {
    const tag = t.languageCode.toLowerCase();
    if (tag === canonical) return t.kind ? 1 : 0;
    if (tag.split('-')[0] !== base) return 100;
    const script = canonical.match(/-(hans|hant|latn|cyrl|arab)/)?.[1];
    if (script && !tag.includes(`-${script}`)) return 100;
    return t.kind ? 3 : 2;
  };
  const best = [...tracks].sort((a, b) => rank(a) - rank(b))[0];
  return best && rank(best) < 100 ? best : undefined;
}
