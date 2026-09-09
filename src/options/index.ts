import { el, button, check, dialog, labeled, message, select, statusNode } from '../ui/dom';
import { languageButton } from '../ui/language-picker';
import {
  appearance,
  exportStore,
  normalizeStore,
  profileModified,
  providers,
} from '../core/settings';
import type { Store, Settings, Provider, AIRequest, AIResult } from '../core/types';
import { languageName } from '../core/languages';
const app = document.getElementById('app')!,
  status = statusNode();
let store: Store;
let saveChain: Promise<unknown> = Promise.resolve();
const sections = new Map<string, HTMLElement>();
function report(e: unknown) {
  status.classList.add('error');
  status.textContent = e instanceof Error ? e.message : String(e);
}
function save(patch: Partial<Settings>): Promise<void> {
  const run = async () => {
    store = await message<Store>('settings:get');
    store = await message<Store>('settings:patch', { patch, revision: store.revision });
    document.documentElement.dataset.theme = store.settings.theme;
    status.classList.remove('error');
    status.textContent = profileModified(store)
      ? 'Current settings saved · profile has unsaved changes. Use Save profile to update it.'
      : 'Current settings saved.';
  };
  const result = saveChain.then(run, run);
  saveChain = result.catch(report);
  return result;
}
function fieldText(
  label: string,
  value: string,
  change: (value: string) => void,
  type = 'text',
  help?: string,
) {
  const i = el('input', { type });
  i.value = value;
  i.addEventListener('change', () => change(i.value));
  return labeled(label, i, help);
}
function numeric(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  change: (n: number) => void,
) {
  const i = el('input', { type: 'number', min: String(min), max: String(max), step: String(step) });
  i.value = String(value);
  i.addEventListener('change', () => {
    if (i.checkValidity()) change(Number(i.value));
    else {
      i.reportValidity();
    }
  });
  return labeled(label, i);
}
function heading(name: string, description: string) {
  const s = el('section', { class: 'section' });
  s.append(el('h2', {}, name), el('p', { class: 'hint' }, description));
  return s;
}
function languageField(
  label: string,
  value: string,
  onChange: (tag: string) => void,
  auto = false,
) {
  return labeled(label, languageButton(value, document.body, onChange, auto));
}
function learning() {
  const s = heading(
    'Learning',
    'One source, one translation language, and explanations in the language you prefer.',
  );
  const v = store.settings;
  s.append(
    languageField(
      'Preferred video subtitle language',
      v.source,
      (tag) => void save({ source: tag }),
      true,
    ),
    languageField('Translate to', v.target, (tag) => void save({ target: tag })),
    languageField(
      'Explain in',
      v.explanation || v.target,
      (tag) => void save({ explanation: tag }),
    ),
  );
  s.append(
    button('Use translation language for explanations', () => save({ explanation: '' }), 'quiet'),
  );
  s.append(
    check(
      'Show AI translations when studying',
      v.translate,
      (value) => void save({ translate: value }),
    ),
    check(
      'Also show original subtitles',
      v.showOriginal,
      (value) => void save({ showOriginal: value }),
    ),
    check('Merge short subtitles', v.merge, (value) => void save({ merge: value })),
    check('Pause after each subtitle', v.autoPause, (value) => void save({ autoPause: value })),
    check(
      'Enable Q and E keyboard shortcuts',
      v.shortcuts,
      (value) => void save({ shortcuts: value }),
    ),
  );
  s.append(
    el(
      'p',
      { class: 'hint' },
      'Q opens breakdown. E pauses/resumes immediately. Shortcuts are ignored while typing. Automatic pause is controlled separately above.',
    ),
  );
  const advanced = el('details');
  advanced.append(
    el('summary', {}, 'Subtitle grouping limits'),
    numeric(
      'Maximum merged characters',
      v.mergeChars,
      40,
      500,
      10,
      (n) => void save({ mergeChars: n }),
    ),
    numeric(
      'Maximum gap (milliseconds)',
      v.mergeGap,
      0,
      2000,
      50,
      (n) => void save({ mergeGap: n }),
    ),
  );
  s.append(advanced);
  s.append(
    el('h3', {}, 'Optional Listen'),
    check('Enable browser speech', v.speech, (value) => void save({ speech: value })),
    check(
      'Allow remote browser voices',
      v.remoteVoices,
      (value) => void save({ remoteVoices: value }),
    ),
    el(
      'p',
      { class: 'hint' },
      'Local voices are preferred. Remote voices may send text to their speech service. Language availability depends on your operating system. Translation does not require a voice.',
    ),
  );
  const voices = select(
    [
      { value: '', label: 'Automatic matching voice' },
      ...speechSynthesis.getVoices().map((v) => ({
        value: v.voiceURI,
        label: `${v.name} · ${v.lang}${v.localService ? ' · local' : ' · remote'}`,
      })),
    ],
    v.voice,
  );
  voices.addEventListener('change', () => void save({ voice: voices.value }));
  s.append(labeled('Preferred voice', voices));
  const reloadVoices = () => {
    const next = speechSynthesis.getVoices();
    voices.replaceChildren(el('option', { value: '' }, 'Automatic matching voice'));
    for (const voice of next)
      voices.append(
        el(
          'option',
          { value: voice.voiceURI },
          `${voice.name} · ${voice.lang}${voice.localService ? ' · local' : ' · remote'}`,
        ),
      );
    voices.value = store.settings.voice;
  };
  speechSynthesis.addEventListener('voiceschanged', reloadVoices);
  return s;
}
function appearanceSection() {
  const s = heading(
    'Appearance',
    'Make the subtitles comfortable to read. Changes are saved as current settings; apply them to an active video from the popup.',
  );
  let a = { ...store.settings.appearance };
  const preview = el(
    'div',
    { class: 'preview-text', lang: 'en' },
    'A little practice, every day.\n毎日、少しずつ。 · كل يوم، قليلًا',
  );
  const stage = el('div', { class: 'preview-stage' });
  stage.append(preview);
  const warning = statusNode();
  function draw() {
    Object.assign(preview.style, {
      fontSize: `${a.size}px`,
      width: `${a.width}%`,
      padding: `${a.padding}px`,
      lineHeight: String(a.lineHeight),
      color: a.text,
      backgroundColor: `${a.background}${Math.round(a.opacity * 2.55)
        .toString(16)
        .padStart(2, '0')}`,
      whiteSpace: 'pre-line',
    });
    const lum = (hex: string) => {
      const [r, g, b] = hex
        .slice(1)
        .match(/../g)!
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = lum(a.text),
      l2 = lum(a.background),
      ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    warning.textContent =
      ratio < 4.5
        ? 'Low text contrast. Try High contrast.'
        : a.opacity < 100
          ? 'Transparent backgrounds vary with the video. High contrast uses an opaque background.'
          : `Solid-background contrast: ${ratio.toFixed(1)}:1`;
  }
  function edit(p: Partial<typeof a>) {
    a = { ...a, ...p };
    draw();
    void save({ appearance: a });
  }
  const presets = el('div', { class: 'row' });
  for (const [name, value] of Object.entries({
    Standard: appearance,
    'Large text': { ...appearance, size: 32 },
    'High contrast': { ...appearance, background: '#000000', text: '#ffffff', opacity: 100 },
  }))
    presets.append(
      button(name, async () => {
        a = { ...value };
        await save({ appearance: a });
        replaceSection('appearance', appearanceSection());
      }),
    );
  s.append(presets, stage, warning);
  const sizes = el('div', { class: 'two' });
  sizes.append(
    numeric('Text size (px)', a.size, 16, 56, 1, (n) => edit({ size: n })),
    numeric('Width (%)', a.width, 40, 96, 1, (n) => edit({ width: n })),
    numeric('Padding (px)', a.padding, 4, 28, 1, (n) => edit({ padding: n })),
    numeric('Background opacity (%)', a.opacity, 40, 100, 1, (n) => edit({ opacity: n })),
    numeric('Line spacing', a.lineHeight, 1.2, 2, 0.1, (n) => edit({ lineHeight: n })),
  );
  s.append(sizes);
  for (const [label, key] of [
    ['Text color', 'text'],
    ['Background color', 'background'],
  ] as const)
    s.append(fieldText(label, a[key], (value) => edit({ [key]: value }), 'color'));
  const position = select(
    [
      { value: 'bottom', label: 'Bottom · above player controls' },
      { value: 'top', label: 'Top' },
    ],
    a.position,
  );
  position.addEventListener('change', () => edit({ position: position.value as 'top' | 'bottom' }));
  s.append(labeled('Position', position));
  const theme = select(
    ['system', 'light', 'dark'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })),
    store.settings.theme,
  );
  theme.addEventListener('change', () => void save({ theme: theme.value as Settings['theme'] }));
  s.append(labeled('Interface theme', theme));
  draw();
  return s;
}
function aiSection() {
  const s = heading(
    'AI connection',
    'Connect your own account. Only selected subtitle text and limited context are sent to the provider you choose. API usage may cost money.',
  );
  const choice = select(
    Object.entries(providers).map(([value, p]) => ({ value, label: p.name })),
    store.settings.provider,
  );
  const body = el('div');
  s.append(labeled('AI provider', choice), body);
  choice.addEventListener('change', async () => {
    await save({ provider: choice.value as Provider, model: '' });
    render();
  });
  function render() {
    body.replaceChildren();
    const p = choice.value as Provider;
    body.append(el('p', { class: 'notice' }, providers[p].hint));
    const key = el('input', {
        type: 'password',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'API key',
      }),
      remember = el('input', { type: 'checkbox' }),
      rememberLabel = el('label', { class: 'check' });
    rememberLabel.append(remember, 'Remember key on this device');
    const keyStatus = statusNode();
    void message<{ hasKey: boolean }>('key:status', { provider: p })
      .then((r) => {
        keyStatus.textContent = r.hasKey
          ? 'Key saved. Run Test connection to check the selected model.'
          : 'No key stored.';
      })
      .catch(report);
    body.append(
      labeled(
        'API key',
        key,
        'Session-only unless you choose to remember it. Keys are never included in profile exports.',
      ),
      rememberLabel,
    );
    const controls = el('div', { class: 'row' });
    controls.append(
      button(
        'Save key and allow access',
        async () => {
          if (!key.value.trim()) {
            keyStatus.textContent = 'Enter a key first.';
            key.focus();
            return;
          }
          const allowed = await chrome.permissions.request({ origins: [providers[p].origin] });
          if (!allowed) {
            keyStatus.textContent = 'Permission was declined. Your key was not saved.';
            return;
          }
          await message('key:save', { provider: p, key: key.value, remember: remember.checked });
          key.value = '';
          keyStatus.textContent = 'Key saved. Load models, select one, then test the connection.';
        },
        'primary',
      ),
      button('Remove key', async () => {
        await message('key:save', { provider: p, key: '', remember: false });
        keyStatus.textContent = 'Key removed.';
      }),
    );
    body.append(controls, keyStatus);
    const model = el('input', { type: 'text', placeholder: 'Load models or enter a model ID' });
    model.value = store.settings.provider === p ? store.settings.model : '';
    model.addEventListener('change', () => void save({ provider: p, model: model.value.trim() }));
    const modelSelect = select([{ value: '', label: 'Load available models below' }], '');
    modelSelect.addEventListener('change', () => {
      model.value = modelSelect.value;
      void save({ provider: p, model: model.value });
    });
    body.append(
      labeled(
        'Model ID',
        model,
        'Availability does not guarantee translation quality. Test a model before studying.',
      ),
      labeled('Available text models', modelSelect),
    );
    const filter = el('input', {
      type: 'search',
      placeholder: 'Filter available models',
      'aria-label': 'Filter available models',
    });
    let models: { id: string; name: string }[] = [];
    const fill = () => {
      modelSelect.replaceChildren(el('option', { value: '' }, 'Choose a model'));
      for (const m of models.filter((m) =>
        `${m.name} ${m.id}`.toLowerCase().includes(filter.value.toLowerCase()),
      ))
        modelSelect.append(el('option', { value: m.id }, m.name));
      modelSelect.value = model.value;
    };
    filter.addEventListener('input', fill);
    body.append(filter);
    const actions = el('div', { class: 'row' });
    actions.append(
      button('Load models', async () => {
        try {
          keyStatus.textContent = 'Loading models…';
          models = await message('models', { provider: p });
          fill();
          keyStatus.textContent = `${models.length} text models available.`;
        } catch (e) {
          keyStatus.textContent = e instanceof Error ? e.message : 'Could not load models.';
        }
      }),
      button('Test connection', async () => {
        try {
          await save({ provider: p, model: model.value.trim() });
          keyStatus.textContent = 'Testing a short generated sentence…';
          const request: AIRequest = {
            id: crypto.randomUUID(),
            operation: 'translate',
            text: 'Hello, welcome.',
            context: '',
            language: 'en',
            target: 'es',
            explanation: 'es',
            provider: p,
            model: model.value.trim(),
            cache: false,
          };
          const result = await message<AIResult>('test', { request });
          keyStatus.textContent = `Connected · sample result: ${result.translation}`;
        } catch (e) {
          keyStatus.textContent = e instanceof Error ? e.message : 'Connection test failed.';
        }
      }),
    );
    body.append(
      actions,
      el(
        'p',
        { class: 'hint' },
        'Test connection makes one small API request and may be charged. No provider is silently substituted. OpenRouter sends requests onward to the selected model provider.',
      ),
    );
    body.append(
      el(
        'p',
        { class: 'hint' },
        'Browser storage is not an encrypted vault. Use a dedicated limited key where your provider supports one. A compromised browser or extension can access a locally stored key. Provider retention and training policies vary.',
      ),
    );
  }
  render();
  return s;
}
function profilesSection() {
  const s = heading(
    'Profiles & data',
    'Save a setup for each learning routine. Profiles include languages, appearance and model choice, never API keys.',
  );
  const name = el('input', {
    type: 'text',
    maxlength: '60',
    placeholder: 'For example: Japanese evenings',
  });
  name.value = store.profiles.find((p) => p.id === store.activeProfile)?.name || '';
  s.append(labeled('Profile name', name));
  const actions = el('div', { class: 'row' });
  const saveProfile = async (fresh: boolean) => {
    await saveChain;
    store = await message('profile:save', { name: name.value, new: fresh });
    status.textContent = 'Profile saved.';
    replaceSection('profiles', profilesSection());
  };
  actions.append(
    button('Save profile', () => saveProfile(false), 'primary'),
    button('Save as new', () => saveProfile(true)),
  );
  s.append(actions);
  if (profileModified(store))
    s.append(
      el(
        'p',
        { class: 'notice' },
        'This profile has unsaved changes. Current settings are already kept locally; save the profile to update its snapshot.',
      ),
    );
  for (const p of store.profiles) {
    const row = el('div', { class: 'profile-row' });
    row.append(
      el('strong', {}, p.name),
      el(
        'span',
        { class: 'hint' },
        `${languageName(p.settings.target)}${p.id === store.activeProfile ? ' · active' : ''}`,
      ),
    );
    const apply = async () => {
      store = await message('profile:apply', { id: p.id });
      status.textContent = `Loaded ${p.name}. Apply to the active video from the popup.`;
      refreshSections();
    };
    row.append(
      button('Load', async () => {
        store = await message('settings:get');
        if (profileModified(store)) {
          const d = dialog(document.body, 'Unsaved profile changes');
          d.append(
            el('p', {}, 'Save the current profile before switching?'),
            button('Save and switch', async () => {
              const old = store.profiles.find((p) => p.id === store.activeProfile);
              await message('profile:save', { name: old?.name, new: false });
              d.close();
              await apply();
            }),
            button('Discard changes and switch', async () => {
              d.close();
              await apply();
            }),
            button('Cancel', () => d.close()),
          );
        } else await apply();
      }),
      button('Rename', () => {
        const d = dialog(document.body, 'Rename profile'),
          input = el('input', { type: 'text', maxlength: '60' });
        input.value = p.name;
        d.append(
          labeled('New name', input),
          button('Save name', async () => {
            const current = await message<Store>('settings:get');
            const next = {
              ...current,
              profiles: current.profiles.map((v) =>
                v.id === p.id ? { ...v, name: input.value.trim() } : v,
              ),
            };
            store = await message('import', { store: next, revision: current.revision });
            d.close();
            replaceSection('profiles', profilesSection());
          }),
        );
      }),
      button('Delete', () => {
        const d = dialog(document.body, 'Delete profile?');
        d.append(
          el('p', {}, `Delete “${p.name}”? Current settings and API keys are kept.`),
          button('Cancel', () => d.close()),
          button(
            'Delete profile',
            async () => {
              store = await message('profile:delete', { id: p.id });
              d.close();
              replaceSection('profiles', profilesSection());
            },
            'danger',
          ),
        );
      }),
    );
    s.append(row);
  }
  s.append(
    el('h3', {}, 'Backup and restore'),
    button('Export settings and profiles', async () => {
      store = await message('settings:get');
      const blob = new Blob([exportStore(store)], { type: 'application/json' });
      const url = URL.createObjectURL(blob),
        a = el('a', { href: url, download: 'vernacue-profiles.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }),
  );
  const file = el('input', { type: 'file', accept: '.json,application/json' });
  s.append(
    labeled(
      'Import settings and profiles',
      file,
      'Review before replacing your current settings. Keys are never imported.',
    ),
  );
  file.addEventListener('change', async () => {
    try {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 500000) throw new Error('Settings file is too large.');
      const value = normalizeStore(JSON.parse(await f.text()));
      const d = dialog(document.body, 'Replace settings and profiles?');
      d.append(
        el(
          'p',
          {},
          `This file contains ${value.profiles.length} profiles. Existing profiles will be replaced. API keys stay unchanged. Export a backup first if needed.`,
        ),
        button('Cancel', () => d.close()),
        button('Import', async () => {
          store = await message('settings:get');
          store = await message('import', { store: value, revision: store.revision });
          d.close();
          refreshSections();
          status.textContent = 'Settings imported; keys were unchanged.';
        }),
      );
    } catch (e) {
      report(e);
    } finally {
      file.value = '';
    }
  });
  s.append(
    el('h3', {}, 'Local answer cache'),
    check(
      'Keep AI answers for rewatching',
      store.settings.cache,
      (value) => void save({ cache: value }),
    ),
    el(
      'p',
      { class: 'hint' },
      'Up to 3,000 answers or about 50 MB; entries expire after 30 days. Rewatch avoids calls only for matching answers still in this cache.',
    ),
    button('Clear saved AI answers', () => {
      const d = dialog(document.body, 'Clear saved answers?');
      d.append(
        el(
          'p',
          {},
          'Future explanations may make new paid requests. Your profiles and keys are kept.',
        ),
        button('Cancel', () => d.close()),
        button('Clear answers', async () => {
          await message('cache:clear');
          d.close();
          status.textContent = 'Saved AI answers cleared.';
        }),
      );
    }),
  );
  return s;
}
function replaceSection(id: string, next: HTMLElement) {
  const old = sections.get(id)!;
  next.hidden = old.hidden;
  old.replaceWith(next);
  sections.set(id, next);
}
function refreshSections() {
  replaceSection('learning', learning());
  replaceSection('appearance', appearanceSection());
  replaceSection('ai', aiSection());
  replaceSection('profiles', profilesSection());
  document.documentElement.dataset.theme = store.settings.theme;
}
async function init() {
  store = await message('settings:get');
  document.documentElement.dataset.theme = store.settings.theme;
  const h = el('header', { class: 'header' });
  h.append(el('h1', {}, 'Vernacue'), el('span', { class: 'hint' }, 'Your language. Your pace.'));
  app.append(h, status);
  const layout = el('div', { class: 'settings-layout' }),
    nav = el('nav', { 'aria-label': 'Settings sections' }),
    content = el('div');
  for (const [id, name, section] of [
    ['learning', 'Learning', learning()],
    ['appearance', 'Appearance', appearanceSection()],
    ['ai', 'AI connection', aiSection()],
    ['profiles', 'Profiles & data', profilesSection()],
  ] as const) {
    sections.set(id, section);
    section.hidden = id !== 'learning';
    const b = button(name, () => {
      for (const [key, s] of sections) s.hidden = key !== id;
      for (const n of nav.querySelectorAll('button')) n.removeAttribute('aria-current');
      b.setAttribute('aria-current', 'page');
      location.hash = id;
    });
    if (id === 'learning') b.setAttribute('aria-current', 'page');
    nav.append(b);
    content.append(section);
  }
  layout.append(nav, content);
  app.append(
    layout,
    el(
      'p',
      { class: 'hint' },
      'Vernacue 0.1.0 · Settings stay in this browser. No account or local server required.',
    ),
  );
  const hash = location.hash.slice(1);
  if (sections.has(hash)) {
    const ids = [...sections.keys()];
    (nav.children[ids.indexOf(hash)] as HTMLButtonElement).click();
  }
}
init().catch((e) => {
  if (!status.isConnected) app.append(status);
  report(e);
});
