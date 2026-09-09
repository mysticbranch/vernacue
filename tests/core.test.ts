import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJson3, mergeCues, cueAt, pickTrack, joinText } from '../src/core/cues.ts';
import {
  normalizeSettings,
  normalizeStore,
  initialStore,
  exportStore,
  profileModified,
} from '../src/core/settings.ts';
import { searchLanguages, words, direction } from '../src/core/languages.ts';
import { captionUrl, videoId } from '../src/sites/youtube.ts';
import { prompt, parseResult, validateRequest } from '../src/ai/contracts.ts';
import { requestSpec, responseText, httpError } from '../src/ai/providers.ts';
import { cacheKey } from '../src/storage/cache.ts';
import type { AIRequest, Cue, Track } from '../src/core/types.ts';
const cue = (id: string, startMs: number, endMs: number, text: string): Cue => ({
  id,
  startMs,
  endMs,
  text,
  members: [id],
});
const request: AIRequest = {
  id: 'test',
  operation: 'translate',
  text: 'Guten Tag.',
  context: '',
  language: 'de',
  target: 'en',
  explanation: 'en',
  provider: 'groq',
  model: 'test-model',
  cache: true,
};

test('JSON3 keeps timing and skips missing/invalid events', () => {
  assert.deepEqual(
    parseJson3({
      events: [{}, { tStartMs: 100, dDurationMs: 900, segs: [{ utf8: ' Hello\nworld ' }] }],
    }),
    [cue('0:100', 100, 1000, 'Hello world')],
  );
});
test('empty and malformed timelines are distinguishable', () => {
  assert.deepEqual(parseJson3({ events: [] }), []);
  assert.throws(() => parseJson3({}), /timeline/);
});
test('append and duplicate captions do not repeat old text', () => {
  const c = parseJson3({
    events: [
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello world' }] },
      { tStartMs: 1800, dDurationMs: 1000, segs: [{ utf8: 'Hello world' }] },
    ],
  });
  assert.equal(c.length, 1);
  assert.equal(c[0].text, 'Hello world');
  assert.equal(c[0].endMs, 2800);
});
test('merge preserves enclosing end time and original input', () => {
  const raw = [cue('a', 0, 5000, 'First'), cue('b', 1000, 1500, 'second')];
  const original = JSON.stringify(raw);
  const merged = mergeCues(raw);
  assert.equal(merged[0].endMs, 5000);
  assert.deepEqual(merged[0].members, ['a', 'b']);
  assert.equal(JSON.stringify(raw), original);
});
test('merge respects gap, sentence boundary, length and duration', () => {
  for (const c of [
    [cue('a', 0, 100, 'Hello'), cue('b', 1000, 2000, 'there')],
    [cue('a', 0, 100, 'Hello.'), cue('b', 100, 200, 'There')],
    [cue('a', 0, 12000, 'Hello'), cue('b', 12000, 13000, 'there')],
  ])
    assert.equal(mergeCues(c).length, 2);
  assert.equal(mergeCues([cue('a', 0, 100, '123456'), cue('b', 100, 200, '789')], 6).length, 2);
});
test('CJK merge does not insert a Latin space', () => {
  assert.equal(joinText('日本', '語'), '日本語');
  assert.equal(joinText('Hello', 'world'), 'Hello world');
});
test('cue lookup handles gaps, final end and nested overlaps', () => {
  const c = [cue('a', 1000, 5000, 'outer'), cue('b', 2000, 2500, 'inner')];
  assert.equal(cueAt(c, 0), undefined);
  assert.equal(cueAt(c, 2100)?.id, 'b');
  assert.equal(cueAt(c, 3000)?.id, 'a');
  assert.equal(cueAt(c, 5000), undefined);
});
test('track ranking prefers exact match before region, human within rank', () => {
  const tracks: Track[] = [
    { name: 'regional', languageCode: 'de-DE', baseUrl: '' },
    { name: 'auto', languageCode: 'de', baseUrl: '', kind: 'asr' },
    { name: 'exact', languageCode: 'de', baseUrl: '' },
  ];
  assert.equal(pickTrack(tracks, 'de')?.name, 'exact');
  assert.equal(pickTrack(tracks.slice(0, 2), 'de')?.name, 'auto');
  assert.equal(pickTrack(tracks, 'ja'), undefined);
});
test('explicit script mismatch never silently falls back', () => {
  assert.equal(
    pickTrack([{ name: 'simplified', languageCode: 'zh-Hans', baseUrl: '' }], 'zh-Hant'),
    undefined,
  );
});
test('language catalog searches native name, code, accents and favors starred results', () => {
  assert.ok(searchLanguages('日本').some((l) => l.code === 'ja'));
  assert.ok(searchLanguages('portugues').some((l) => l.code === 'pt'));
  assert.equal(searchLanguages('', ['ar'])[0].code, 'ar');
  assert.ok(searchLanguages('zh-Hant').length);
});
test('Japanese and Thai segment into several words; combining marks survive', () => {
  for (const [text, lang] of [
    ['今日は日本語を勉強します', 'ja'],
    ['ภาษาไทย', 'th'],
  ]) {
    const split = words(text, lang);
    assert.equal(split.map((s) => s.text).join(''), text);
    assert.ok(split.filter((s) => s.word).length > 1);
  }
  assert.equal(
    words('cafe\u0301', 'fr')
      .map((s) => s.text)
      .join(''),
    'cafe\u0301',
  );
  assert.equal(direction('ar'), 'rtl');
});
test('settings normalize untrusted values and retain arbitrary valid languages', () => {
  const s = normalizeSettings({
    target: 'th',
    provider: 'evil',
    appearance: { size: NaN, text: 'url(evil)' },
  });
  assert.equal(s.target, 'th');
  assert.equal(s.provider, 'groq');
  assert.equal(s.appearance.size, 24);
  assert.equal(s.appearance.text, '#ffffff');
});
test('future and duplicate-profile imports reject without rewriting', () => {
  assert.throws(() => normalizeStore({ version: 8 }), /unsupported/);
  const s = initialStore();
  s.profiles = [
    { id: 'same', name: 'One', settings: s.settings },
    { id: 'same', name: 'Two', settings: s.settings },
  ];
  assert.throws(() => normalizeStore(s), /duplicate/);
});
test('exports only allowlisted data and never API keys', () => {
  const s = {
    ...initialStore(),
    apiKey: 'dummy-do-not-export',
    settings: { ...initialStore().settings, key: 'dummy-do-not-export' },
  };
  assert.ok(!exportStore(s).includes('dummy-do-not-export'));
});
test('profile dirty state and save snapshot are deterministic', () => {
  const s = initialStore();
  s.profiles = [{ id: 'one', name: 'One', settings: structuredClone(s.settings) }];
  s.activeProfile = 'one';
  assert.equal(profileModified(s), false);
  s.settings.target = 'ja';
  assert.equal(profileModified(s), true);
});
test('caption URL validation rejects off-site, different video and credentials', () => {
  assert.equal(videoId('https://www.youtube.com/watch?v=abcdef12345'), 'abcdef12345');
  assert.equal(videoId('https://www.youtube.com/shorts/abcdef12345'), '');
  for (const url of [
    'https://evil.example/api/timedtext?v=abcdef12345',
    'https://www.youtube.com/api/timedtext?v=other',
    'https://user@www.youtube.com/api/timedtext',
  ])
    assert.throws(() => captionUrl(url, 'abcdef12345'));
  assert.ok(
    captionUrl('https://www.youtube.com/api/timedtext?v=abcdef12345', 'abcdef12345').includes(
      'fmt=json3',
    ),
  );
});
test('prompt language pair is explicit and subtitle is data', () => {
  const p = prompt({
    ...request,
    operation: 'word',
    language: 'ja',
    explanation: 'pt',
    word: '今日',
    text: '今日は',
  });
  assert.ok(p.instructions.includes('in pt'));
  assert.ok(!p.instructions.includes('German learner'));
  assert.equal(JSON.parse(p.input).selectedWord, '今日');
});
test('breakdown must reconstruct original whitespace and punctuation', () => {
  const r = { ...request, operation: 'breakdown' as const };
  assert.deepEqual(
    parseResult(
      '{"chunks":[{"text":"Guten ","meaning":"Good"},{"text":"Tag.","meaning":"day"}]}',
      r,
    ).chunks?.length,
    2,
  );
  assert.throws(
    () => parseResult('{"chunks":[{"text":"Guten Tag!","meaning":"Hello"}]}', r),
    /changed/,
  );
});
test('malformed, empty and wrong-word AI responses reject', () => {
  assert.throws(() => parseResult('not json', request));
  assert.throws(() => parseResult('{}', request));
  assert.throws(() =>
    parseResult('{"word":"dog","meaning":"animal"}', {
      ...request,
      operation: 'word',
      word: 'cat',
      text: 'cat',
    }),
  );
});
test('AI request limits and word membership are enforced', () => {
  assert.throws(() => validateRequest({ ...request, model: '../?evil' }));
  assert.throws(() => validateRequest({ ...request, operation: 'word', word: 'missing' }));
  assert.throws(() => validateRequest({ ...request, text: 'a'.repeat(13000) }));
});
test('provider endpoints and headers never put key in a URL', () => {
  for (const provider of ['groq', 'openai', 'gemini', 'openrouter'] as const) {
    const spec = requestSpec({ ...request, provider }, 'dummy-secret');
    assert.ok(!spec.url.includes('dummy-secret'));
    assert.ok(JSON.stringify(spec.init.headers).includes('dummy-secret'));
    assert.equal(spec.init.credentials, 'omit');
    assert.equal(spec.init.redirect, 'error');
  }
  const body = JSON.parse(
    requestSpec({ ...request, provider: 'openai' }, 'dummy').init.body as string,
  );
  assert.equal(body.store, false);
});
test('response extraction handles all four protocols and truncation', () => {
  assert.equal(
    responseText({ output: [{ content: [{ type: 'output_text', text: 'a' }] }] }, 'openai'),
    'a',
  );
  assert.equal(
    responseText(
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'a' }] } }] },
      'gemini',
    ),
    'a',
  );
  for (const p of ['groq', 'openrouter'] as const)
    assert.equal(responseText({ choices: [{ message: { content: 'a' } }] }, p), 'a');
  assert.throws(() => responseText({ status: 'incomplete' }, 'openai'));
  assert.match(httpError(429), /quota/);
});
test('cache separates language, source, word, context and model, not request IDs', async () => {
  const base = await cacheKey(request);
  assert.equal(await cacheKey({ ...request, id: 'different' }), base);
  for (const changed of [
    { text: 'Other' },
    { target: 'pt' },
    { model: 'other' },
    { context: 'New context' },
    { word: 'Tag' },
  ])
    assert.notEqual(await cacheKey({ ...request, ...changed }), base);
});
