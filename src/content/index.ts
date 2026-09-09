import { defaults, normalizeSettings } from '../core/settings';
import { cueAt, mergeCues } from '../core/cues';
import { videoId } from '../sites/youtube';
import { Overlay } from './overlay';
import { stopSpeech, speak } from './speech';
import { message, el, button, dialog, check, select, labeled } from '../ui/dom';
import { languageButton } from '../ui/language-picker';
import { languageName } from '../core/languages';
import type {
  AIRequest,
  AIResult,
  Cue,
  Settings,
  Store,
  SessionStatus,
  Track,
} from '../core/types';

let settings = normalizeSettings(defaults),
  active = false,
  id = '',
  generation = 0,
  answerGeneration = 0;
let video: HTMLVideoElement | null = null,
  ui: Overlay | undefined,
  raw: Cue[] = [],
  cues: Cue[] = [],
  tracks: Track[] = [],
  current: Cue | undefined;
let language = 'und',
  status = 'Ready to study',
  pinned = false,
  timer: ReturnType<typeof setInterval> | undefined,
  translateBusy = false;
const translations = new Map<string, string>();
const attempted = new Set<string>();
let lastTime = 0,
  pausedAt = '',
  lastSpoken = '',
  studyText = '',
  studyLanguage = '';
let translateRevision = 0;
function snapshot(): SessionStatus {
  return { active, videoId: id, status, language, count: cues.length, settings };
}
function setStatus(text: string) {
  status = text;
  if (ui) ui.note.textContent = text;
}
function media(): HTMLVideoElement | null {
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}
function cancel() {
  answerGeneration++;
  translateRevision++;
  translateBusy = false;
  attempted.clear();
  void message('cancel').catch(() => {});
  stopSpeech();
}
function stop() {
  active = false;
  generation++;
  cancel();
  clearInterval(timer);
  ui?.destroy();
  ui = undefined;
  current = undefined;
  raw = [];
  cues = [];
  pinned = false;
  translations.clear();
  status = 'Stopped';
  void message('stop').catch(() => {});
}
async function start(value?: Settings) {
  stop();
  id = videoId(location.href);
  if (!id)
    throw new Error(
      'Open a standard YouTube video. Shorts and live video are not supported in this version.',
    );
  settings = normalizeSettings(value || (await message<Store>('settings:get')).settings);
  video = media();
  if (!video) throw new Error('The YouTube player is not ready. Start the video, then try again.');
  active = true;
  const epoch = ++generation;
  const parent = document.getElementById('movie_player') || video.parentElement!;
  ui = new Overlay(parent, {
    pause: togglePause,
    breakdown: () => void explain('breakdown'),
    word: (word, text, lang) => void explain('word', text, lang, word),
    retry: () => void load(),
    more: openMore,
  });
  ui.onPin = (value) => {
    pinned = value;
  };
  ui.apply(settings);
  setStatus('Loading captions…');
  timer = setInterval(tick, 80);
  await load();
  if (generation !== epoch) return;
}
async function load() {
  const epoch = generation;
  setStatus('Loading captions…');
  try {
    const response = await message<{
      cues: Cue[];
      tracks: Track[];
      language: string;
      status: string;
    }>('captions', { videoId: id, source: settings.source });
    if (!active || epoch !== generation) return;
    raw = response.cues;
    tracks = response.tracks;
    language = response.language || 'und';
    cues = settings.merge ? mergeCues(raw, settings.mergeChars, settings.mergeGap) : raw;
    current = undefined;
    pausedAt = '';
    setStatus(response.status);
    tick();
  } catch (e) {
    if (epoch === generation) setStatus(e instanceof Error ? e.message : 'Caption loading failed.');
  }
}
function makeRequest(
  operation: AIRequest['operation'],
  text: string,
  lang: string,
  word?: string,
  cue?: Cue,
): AIRequest {
  const index = cue ? cues.indexOf(cue) : -1;
  return {
    id: crypto.randomUUID(),
    operation,
    text,
    language: lang,
    target: settings.target,
    explanation: settings.explanation || settings.target,
    word,
    context:
      index >= 0
        ? [cues[index - 1]?.text, cues[index + 1]?.text].filter(Boolean).join('\n').slice(0, 6000)
        : '',
    provider: settings.provider,
    model: settings.model,
    cache: settings.cache,
  };
}
async function translate(cue: Cue) {
  if (translateBusy || attempted.has(cue.id) || !active || document.hidden || ui?.panel?.open)
    return;
  if (!settings.model) {
    if (ui) ui.note.textContent = 'Choose a model in Settings to translate.';
    return;
  }
  attempted.add(cue.id);
  translateBusy = true;
  const epoch = generation,
    revision = translateRevision;
  try {
    const result = await message<AIResult>('ai', {
      request: makeRequest('translate', cue.text, language, undefined, cue),
    });
    if (active && epoch === generation && revision === translateRevision && result.translation) {
      translations.set(cue.id, result.translation);
      if (current?.id === cue.id && ui) {
        ui.line(ui.translated, result.translation, settings.target);
        ui.original.hidden = !settings.showOriginal;
        ui.note.textContent = '';
      }
    }
  } catch (e) {
    if (epoch === generation && revision === translateRevision && ui)
      ui.note.textContent = e instanceof Error ? e.message : 'Translation unavailable.';
  } finally {
    if (epoch === generation && revision === translateRevision) translateBusy = false;
  }
}
function tick() {
  if (!active || !ui) return;
  if (videoId(location.href) !== id) {
    stop();
    return;
  }
  const nextVideo = media();
  if (!nextVideo) return;
  if (video !== nextVideo) {
    video = nextVideo;
    cancel();
    current = undefined;
  }
  const parent = document.getElementById('movie_player') || video.parentElement!;
  if (ui.host.parentElement !== parent) parent.append(ui.host);
  const ad =
    parent.classList.contains('ad-showing') || parent.classList.contains('ad-interrupting');
  ui.box.hidden = ad;
  if (ad) return;
  ui.pause.textContent = video.paused ? 'Resume · E' : 'Pause · E';
  const ms = video.currentTime * 1000,
    sought = Math.abs(ms - lastTime) > 1000 || ms < lastTime - 100;
  lastTime = ms;
  if (sought) {
    cancel();
    pausedAt = '';
    pinned = false;
    current = undefined;
  }
  if (
    settings.autoPause &&
    current &&
    ms >= current.endMs &&
    pausedAt !== current.id &&
    !sought &&
    !video.paused
  ) {
    pausedAt = current.id;
    video.pause();
    pinned = true;
    ui.note.textContent = 'Paused after subtitle. Press E to continue.';
    return;
  }
  if (pinned) return;
  const next = cueAt(cues, ms);
  if (next?.id !== current?.id || ui.original.textContent !== (next?.text || '')) {
    current = next;
    ui.line(ui.original, next?.text || '', language);
    ui.line(ui.translated, next ? translations.get(next.id) || '' : '', settings.target);
    ui.original.hidden = !!(
      next &&
      settings.translate &&
      translations.has(next.id) &&
      !settings.showOriginal
    );
    if (cues.length)
      ui.note.textContent = next
        ? settings.translate && language !== settings.target && !translations.has(next.id)
          ? 'Translating…'
          : ''
        : 'No subtitle at this moment';
  }
  if (next && settings.translate && language !== settings.target && !translations.has(next.id))
    void translate(next);
  else if (next && settings.translate && !video.paused && language !== settings.target) {
    const i = cues.indexOf(next);
    const upcoming = cues
      .slice(i + 1, i + 3)
      .find((c) => !translations.has(c.id) && !attempted.has(c.id));
    if (upcoming) void translate(upcoming);
  }
}
function togglePause() {
  if (!video || !active) return;
  stopSpeech();
  if (video.paused) {
    pinned = false;
    current = undefined;
    void video.play().catch(() => setStatus('Press YouTube Play to resume.'));
  } else video.pause();
}
async function explain(
  operation: 'breakdown' | 'word',
  text?: string,
  lang?: string,
  word?: string,
) {
  // A key press can arrive between a seek and the next clock tick. Read the
  // current media time, except when the learner deliberately pinned a cue.
  const selectedCue = pinned ? current : cueAt(cues, (video?.currentTime || 0) * 1000);
  const selected = text || selectedCue?.text;
  if (!selected || !ui || !video) {
    setStatus('No current subtitle. Pause on a subtitle, then try again.');
    return;
  }
  // Only explicit selection starts a paid request. Freeze the source before awaiting.
  cancel();
  video.pause();
  pinned = true;
  const epoch = generation;
  studyText = selected;
  studyLanguage = lang || language;
  const req = makeRequest(operation, selected, studyLanguage, word, selectedCue);
  let ticket = ++answerGeneration;
  ui.study(
    selected,
    studyLanguage,
    req.explanation,
    () => {
      ui?.panel?.close();
      if (video?.paused) togglePause();
    },
    () => {
      if (!video) return;
      video.pause();
      const speechTicket = answerGeneration;
      speak(
        lastSpoken || studyText,
        lastSpoken ? req.explanation : studyLanguage,
        settings,
        (error) => {
          if (error && ui?.panelStatus && answerGeneration === speechTicket)
            ui.panelStatus.textContent = error;
        },
      );
    },
    () => {
      cancel();
      pinned = false;
    },
  );
  // Closing a previous dialog may run its cleanup while the new one is opening.
  ticket = ++answerGeneration;
  lastSpoken = '';
  if (ui.panelStatus) ui.panelStatus.textContent = 'Preparing explanation…';
  async function run() {
    const mine = ++answerGeneration;
    ticket = mine;
    try {
      const result = await message<AIResult>('ai', { request: req });
      if (epoch !== generation || mine !== answerGeneration || !ui?.panel?.open) return;
      ui.result(result, studyLanguage);
      lastSpoken =
        result.chunks?.map((c) => c.meaning).join('. ') ||
        [result.meaning, result.general, result.note].filter(Boolean).join('. ');
    } catch (e) {
      if (epoch !== generation || mine !== answerGeneration || !ui?.panel?.open) return;
      if (ui.panelStatus)
        ui.panelStatus.textContent = e instanceof Error ? e.message : 'Explanation unavailable.';
      ui.panelBody?.replaceChildren(button('Retry explanation', () => run()));
    }
  }
  void ticket;
  await run();
}
function update(patch: Partial<Settings>) {
  cancel();
  settings = normalizeSettings({ ...settings, ...patch });
  translations.clear();
  cues = settings.merge ? mergeCues(raw, settings.mergeChars, settings.mergeGap) : raw;
  current = undefined;
  pinned = false;
  pausedAt = '';
  ui?.apply(settings);
  tick();
}
function openMore() {
  if (!ui) return;
  const d = dialog(ui.shadow, 'Study settings');
  d.append(
    el(
      'p',
      { class: 'hint' },
      'Changes here apply to this video. Save a profile in the extension Settings for future sessions.',
    ),
  );
  d.append(
    labeled(
      'Translate to',
      languageButton(settings.target, ui.shadow, (tag) => update({ target: tag })),
    ),
    labeled(
      'Explain in',
      languageButton(settings.explanation || settings.target, ui.shadow, (tag) =>
        update({ explanation: tag }),
      ),
    ),
  );
  d.append(
    check('Show AI translation', settings.translate, (value) => update({ translate: value })),
    check('Also show original subtitles', settings.showOriginal, (value) =>
      update({ showOriginal: value }),
    ),
    check('Merge short subtitles', settings.merge, (value) => update({ merge: value })),
    check('Pause after each subtitle', settings.autoPause, (value) => update({ autoPause: value })),
  );
  const source = select(
    [
      { value: 'auto', label: 'Auto · first available human caption' },
      ...tracks.map((t) => ({
        value: t.languageCode,
        label: `${t.name}${t.kind ? ' · automatic' : ''}`,
      })),
    ],
    settings.source,
  );
  source.addEventListener('change', () => {
    update({ source: source.value });
    void load();
  });
  d.append(labeled('Available video captions', source));
  d.append(
    button('Retry captions', () => {
      d.close();
      void load();
    }),
  );
  if (current && translations.has(current.id))
    d.append(
      button('Break down translated subtitle', () => {
        const text = translations.get(current!.id)!;
        d.close();
        void explain('breakdown', text, settings.target);
      }),
    );
  const phrase = el('input', {
    type: 'text',
    maxlength: '300',
    placeholder: 'A word or phrase from the current original subtitle',
  });
  d.append(
    labeled('Explain a phrase', phrase),
    button('Explain phrase', () => {
      const selection = phrase.value.trim();
      const text = current?.text || '';
      if (selection && text.includes(selection)) {
        d.close();
        void explain('word', text, language, selection);
      } else {
        phrase.setCustomValidity(
          'Enter a word or phrase exactly as it appears in the current original subtitle.',
        );
        phrase.reportValidity();
      }
    }),
  );
  phrase.addEventListener('input', () => phrase.setCustomValidity(''));
  d.append(button('Stop studying', () => stop(), 'danger'));
}
document.addEventListener(
  'keydown',
  (e) => {
    if (
      !active ||
      !settings.shortcuts ||
      e.defaultPrevented ||
      e.repeat ||
      e.isComposing ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.shiftKey
    )
      return;
    if (
      e
        .composedPath()
        .some(
          (n) =>
            n instanceof HTMLElement &&
            (n.isContentEditable ||
              /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) ||
              n.getAttribute('role') === 'textbox'),
        )
    )
      return;
    const key = e.key.toLowerCase();
    if (!['q', 'e'].includes(key)) return;
    // Do not intercept dialog navigation or typing. E remains an explicit resume action.
    if (ui?.shadow.querySelector('dialog[open]') && key === 'q') return;
    e.preventDefault();
    e.stopPropagation();
    if (key === 'e') togglePause();
    else void explain('breakdown');
  },
  true,
);
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type !== 'command') return;
  const run = async () => {
    switch (msg.command) {
      case 'start':
        await start(msg.settings);
        break;
      case 'stop':
        stop();
        break;
      case 'panel':
        if (active) openMore();
        else await start(msg.settings);
        break;
      case 'settings':
        if (active) {
          const old = settings.source;
          update(msg.settings);
          if (old !== settings.source) await load();
        }
        break;
    }
    return snapshot();
  };
  run()
    .then(respond)
    .catch((e) =>
      respond({ active: false, error: e instanceof Error ? e.message : 'Failed to start.' }),
    );
  return true;
});
document.addEventListener('yt-navigate-start', () => {
  if (active) stop();
});
window.addEventListener('pagehide', () => {
  if (active) stop();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancel();
    stopSpeech();
  } else if (active) tick();
});
