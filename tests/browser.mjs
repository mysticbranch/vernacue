import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'vernacue-browser-'));
// Native optional-host permission dialogs are outside Playwright's DOM API.
// Pregrant the synthetic provider in a disposable manifest, never the shipped one.
const fixtureExtension = await mkdtemp(join(tmpdir(), 'vernacue-fixture-extension-'));
await cp('dist', fixtureExtension, { recursive: true });
const fixtureManifest = JSON.parse(await readFile(join(fixtureExtension, 'manifest.json'), 'utf8'));
fixtureManifest.host_permissions.push(...fixtureManifest.optional_host_permissions);
await writeFile(join(fixtureExtension, 'manifest.json'), JSON.stringify(fixtureManifest));
await mkdir('test-results', { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${fixtureExtension}`, `--load-extension=${fixtureExtension}`],
  viewport: { width: 1100, height: 900 },
});
context.setDefaultTimeout(12000);
const watchdog = setTimeout(() => {
  console.error('Browser suite exceeded 150 seconds');
  void context.close();
}, 150000);
const errors = [];
context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;
const results = [];
const check = (name, value) => {
  assert.ok(value, name);
  results.push(name);
  console.log(`PASS ${name}`);
};
async function aiAudit(page, name) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(`test-results/axe-${name}.json`, JSON.stringify(report.violations, null, 2));
  check(`accessibility scan ${name}`, report.violations.length === 0);
}
try {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('heading', { name: 'Learning', exact: true }).waitFor();
  await options.screenshot({ path: 'test-results/settings-learning.png', fullPage: true });
  await aiAudit(options, 'learning');
  await options.getByLabel('Translate to', { exact: true }).click();
  await options.getByRole('searchbox', { name: 'Search languages' }).fill('日本');
  await options.getByRole('button', { name: 'Add Japanese to favorites' }).click();
  await options.getByRole('button', { name: 'Japanese · 日本語' }).click();
  let stored = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'settings:get' }));
  // Save is asynchronous; wait for the persisted language, not an arbitrary delay.
  await options.waitForFunction(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'settings:get' });
    return r.data.settings.target === 'ja';
  });
  stored = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'settings:get' }));
  check(
    'search native language and favorite survives selection',
    stored.data.favorites.includes('ja') && stored.data.settings.target === 'ja',
  );
  await options.getByRole('button', { name: 'Profiles & data', exact: true }).click();
  await options.getByLabel('Profile name', { exact: true }).fill('Japanese practice');
  await options.getByRole('button', { name: 'Save as new', exact: true }).click();
  await options.getByText('Japanese practice', { exact: true }).waitFor();
  await aiAudit(options, 'profiles');
  await options.reload();
  await options.getByText('Japanese practice', { exact: true }).waitFor();
  check('profile survives page reload', true);
  await options.getByRole('button', { name: 'Appearance', exact: true }).click();
  await options.getByRole('button', { name: 'High contrast', exact: true }).click();
  await options.getByText('Solid-background contrast: 21.0:1').waitFor();
  await options.screenshot({ path: 'test-results/settings-appearance.png', fullPage: true });
  await aiAudit(options, 'appearance');
  await options.setViewportSize({ width: 360, height: 820 });
  await options.screenshot({ path: 'test-results/settings-narrow.png', fullPage: true });
  check(
    'settings reflow without horizontal scrolling',
    await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await options.setViewportSize({ width: 1100, height: 900 });
  await options.getByRole('button', { name: 'AI connection', exact: true }).click();
  await aiAudit(options, 'connection');
  // Synthetic provider traffic is intercepted outside the extension. No real key is used.
  let calls = 0,
    failureStatus = 0,
    malformed = false,
    delayAnswer = false,
    releaseAnswer;
  await context.route('https://api.groq.com/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: [{ id: 'fixture-model' }] } });
      return;
    }
    calls++;
    if (failureStatus) {
      await route.fulfill({ status: failureStatus, json: { error: 'Synthetic failure' } });
      return;
    }
    if (delayAnswer)
      await new Promise((resolve) => {
        releaseAnswer = resolve;
      });
    const req = route.request().postDataJSON(),
      input = JSON.parse(req.messages[1].content);
    const instruction = req.messages[0].content;
    let result;
    if (instruction.includes('Break the'))
      result = { chunks: [{ text: input.subtitle, meaning: 'A friendly greeting.' }] };
    else if (instruction.includes('selected'))
      result = {
        word: input.selectedWord,
        meaning: 'Meaning in this sentence.',
        general: 'Common meaning.',
        note: 'A short usage note.',
      };
    else result = { translation: 'Hello world.' };
    await route
      .fulfill({
        json: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: malformed
                  ? '{"chunks":[{"text":"Altered source","meaning":"Wrong"}]}'
                  : JSON.stringify(result),
              },
            },
          ],
        },
      })
      .catch(() => {}); // An intentionally cancelled request can close its route.
  });
  const granted = await options.evaluate(() =>
    chrome.permissions.contains({ origins: ['https://api.groq.com/*'] }),
  );
  check(
    'fixture provider permission pregranted (native permission prompt requires manual testing)',
    granted,
  );
  await options.evaluate(async () => {
    await chrome.runtime.sendMessage({
      type: 'key:save',
      provider: 'groq',
      key: 'fixture-key-not-a-secret',
      remember: false,
    });
    const s = (await chrome.runtime.sendMessage({ type: 'settings:get' })).data;
    await chrome.runtime.sendMessage({
      type: 'settings:patch',
      revision: s.revision,
      patch: {
        provider: 'groq',
        model: 'fixture-model',
        source: 'auto',
        target: 'en',
        explanation: 'en',
        translate: true,
      },
    });
  });
  await options.reload();
  await options.getByRole('button', { name: 'Test connection', exact: true }).click();
  await options.getByText('Connected · sample result: Hello world.').waitFor();
  check('real worker provider request with synthetic response', calls === 1);
  for (const [provider, host, payload] of [
    [
      'openai',
      'api.openai.com',
      {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: '{"translation":"Hola."}' }] },
        ],
      },
    ],
    [
      'gemini',
      'generativelanguage.googleapis.com',
      {
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: '{"translation":"Hola."}' }] } },
        ],
      },
    ],
    [
      'openrouter',
      'openrouter.ai',
      { choices: [{ finish_reason: 'stop', message: { content: '{"translation":"Hola."}' } }] },
    ],
  ]) {
    await context.route(`https://${host}/**`, (route) => route.fulfill({ json: payload }));
    const reply = await options.evaluate(async (provider) => {
      await chrome.runtime.sendMessage({
        type: 'key:save',
        provider,
        key: 'fixture-key-not-a-secret',
        remember: false,
      });
      return chrome.runtime.sendMessage({
        type: 'test',
        request: {
          id: crypto.randomUUID(),
          operation: 'translate',
          text: 'Hello.',
          context: '',
          language: 'en',
          target: 'es',
          explanation: 'es',
          provider,
          model: 'fixture-model',
          cache: false,
        },
      });
    }, provider);
    check(
      `${provider} worker adapter handles synthetic API response`,
      reply.ok && reply.data.translation === 'Hola.',
    );
  }
  for (const status of [401, 429]) {
    failureStatus = status;
    const before = calls;
    const reply = await options.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'test',
        request: {
          id: crypto.randomUUID(),
          operation: 'translate',
          text: 'Hello.',
          context: '',
          language: 'en',
          target: 'es',
          explanation: 'es',
          provider: 'groq',
          model: 'fixture-model',
          cache: false,
        },
      }),
    );
    check(`HTTP ${status} surfaces an error without retry`, !reply.ok && calls === before + 1);
  }
  failureStatus = 0;
  malformed = true;
  const invalid = await options.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'test',
      request: {
        id: crypto.randomUUID(),
        operation: 'breakdown',
        text: 'Exact source.',
        context: '',
        language: 'en',
        target: 'es',
        explanation: 'es',
        provider: 'groq',
        model: 'fixture-model',
        cache: false,
      },
    }),
  );
  check('altered-source breakdown rejected through actual worker', !invalid.ok);
  malformed = false;
  const fixtureId = 'fixture1234';
  await context.route('https://www.youtube.com/watch?*', async (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><title>Generated caption fixture</title></head><body style="margin:0;background:#e5ece6"><main><h1>Generated video fixture</h1><label>Search <input id="search"></label><div id="movie_player" style="position:relative;width:960px;height:600px;background:#253e32"><video class="html5-main-video" style="width:100%;height:100%"></video></div></main><script>window.ytInitialPlayerResponse={videoDetails:{videoId:'${fixtureId}'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v=${fixtureId}&lang=de',languageCode:'de',name:{simpleText:'German'}}]}}};</script></body></html>`,
    }),
  );
  await context.route('https://www.youtube.com/api/timedtext*', (route) =>
    route.fulfill({
      json: {
        events: [
          { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'Guten Tag.' }] },
          { tStartMs: 5100, dDurationMs: 3000, segs: [{ utf8: 'Heute lernen wir.' }] },
        ],
      },
    }),
  );
  const page = await context.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${fixtureId}`);
  await page.waitForFunction(() => !!document.querySelector('video'));
  // Real playable silent media; do not mock play(), pause(), or paused.
  await page.locator('video').evaluate(async (v) => {
    const rate = 8000,
      length = rate * 12,
      b = new ArrayBuffer(44 + length * 2),
      d = new DataView(b);
    const text = (i, s) => [...s].forEach((c, n) => d.setUint8(i + n, c.charCodeAt(0)));
    text(0, 'RIFF');
    d.setUint32(4, 36 + length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    d.setUint32(16, 16, true);
    d.setUint16(20, 1, true);
    d.setUint16(22, 1, true);
    d.setUint32(24, rate, true);
    d.setUint32(28, rate * 2, true);
    d.setUint16(32, 2, true);
    d.setUint16(34, 16, true);
    text(36, 'data');
    d.setUint32(40, length * 2, true);
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    await new Promise((resolve, reject) => {
      v.onloadedmetadata = resolve;
      v.onerror = reject;
    });
  });
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    return tabs[0].id;
  });
  const started = await worker.evaluate(async (tabId) => {
    const { store } = await chrome.storage.local.get('store');
    return chrome.tabs.sendMessage(tabId, {
      type: 'command',
      command: 'start',
      settings: store.settings,
    });
  }, tabId);
  check('caption probe and JSON3 load through real extension contexts', started.count === 2);
  const boundary = await worker.evaluate(
    async (tabId) =>
      (
        await chrome.scripting.executeScript({
          target: { tabId },
          func: async () => {
            let localBlocked = false;
            try {
              await chrome.storage.local.get('key:groq');
            } catch {
              localBlocked = true;
            }
            const admin = await chrome.runtime.sendMessage({
              type: 'key:status',
              provider: 'groq',
            });
            return { localBlocked, adminDenied: !admin.ok };
          },
        })
      )[0].result,
    tabId,
  );
  check(
    'content context cannot read key storage or administer keys',
    boundary.localBlocked && boundary.adminDenied,
  );
  await page.getByRole('button', { name: 'Explain Guten', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Explain Hello', exact: true }).waitFor();
  check('translation displayed in the overlay', true);
  await page.getByRole('button', { name: 'Explain Guten', exact: true }).hover();
  check(
    'word hover preserves custom subtitle background contrast',
    await page
      .getByRole('button', { name: 'Explain Guten', exact: true })
      .evaluate(
        (word) =>
          getComputedStyle(word).backgroundColor === 'rgba(0, 0, 0, 0)' &&
          getComputedStyle(word).color === 'rgb(255, 255, 255)',
      ),
  );
  await page.mouse.move(0, 0);
  const beforeSynthetic = calls;
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    document.querySelector('[data-vernacue]').shadowRoot.querySelector('[data-word]').click();
  });
  await page.waitForTimeout(150);
  check(
    'host-page synthetic clicks and keystrokes cannot trigger paid study actions',
    calls === beforeSynthetic && (await page.getByRole('dialog').count()) === 0,
  );
  await page.screenshot({ path: 'test-results/video-translation.png' });
  await page.getByLabel('Search', { exact: true }).fill('qe');
  check('typing Q/E does not open study dialog', (await page.getByRole('dialog').count()) === 0);
  await page.locator('h1').click();
  await page.keyboard.press('q');
  await page.getByText('A friendly greeting.', { exact: true }).waitFor();
  check(
    'Q breakdown opens and preserves exact original',
    (await page.getByRole('dialog').getByText('Guten Tag.', { exact: true }).count()) >= 1,
  );
  await page.keyboard.press('ArrowDown');
  check(
    'unrelated key does not close study dialog',
    (await page.getByRole('dialog').count()) === 1,
  );
  await page.screenshot({ path: 'test-results/video-breakdown.png' });
  await aiAudit(page, 'study');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Explain Guten', exact: true }).click();
  await page.getByText('Meaning in this sentence.', { exact: true }).waitFor();
  check('word explanation works through worker', true);
  const before = calls;
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Explain Guten', exact: true }).click();
  await page.getByText('Saved answer', { exact: true }).waitFor();
  check('repeated word answer uses cache', calls === before);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('h1').click();
  await page.keyboard.press('e');
  await page.waitForFunction(() => !document.querySelector('video').paused);
  await page.keyboard.press('e');
  await page.waitForFunction(() => document.querySelector('video').paused);
  check('E resumes and pauses real media', true);
  await worker.evaluate(async (tabId) => {
    const { store } = await chrome.storage.local.get('store');
    await chrome.tabs.sendMessage(tabId, {
      type: 'command',
      command: 'settings',
      settings: { ...store.settings, autoPause: true, translate: false },
    });
  }, tabId);
  await page.locator('video').evaluate((v) => {
    v.currentTime = 4.7;
  });
  await page.waitForTimeout(150);
  await page.locator('h1').click();
  await page.keyboard.press('e');
  await page.waitForFunction(
    () =>
      document.querySelector('video').paused && document.querySelector('video').currentTime >= 5,
  );
  check('automatic pause stops real media after the subtitle', true);
  const forbidden = await page.evaluate(async () => {
    const host = document.querySelector('[data-vernacue]');
    return !!host?.shadowRoot?.textContent?.includes('fixture-key-not-a-secret');
  });
  check('credential absent from page UI', !forbidden);
  await worker.evaluate(async (tabId) => {
    const { store } = await chrome.storage.local.get('store');
    await chrome.tabs.sendMessage(tabId, {
      type: 'command',
      command: 'settings',
      settings: { ...store.settings, autoPause: false, translate: false, cache: false },
    });
  }, tabId);
  await page.locator('video').evaluate((v) => {
    v.currentTime = 1;
  });
  await page.getByRole('button', { name: 'Explain Guten', exact: true }).waitFor();
  delayAnswer = true;
  await page.locator('h1').click();
  await page.keyboard.press('q');
  await page.getByText('Preparing explanation…', { exact: true }).waitFor();
  for (let attempt = 0; attempt < 50 && !releaseAnswer; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  check('slow response is pending before cancellation test', !!releaseAnswer);
  await worker.evaluate(
    (tabId) => chrome.tabs.sendMessage(tabId, { type: 'command', command: 'stop' }),
    tabId,
  );
  check('Stop removes overlay', (await page.locator('[data-vernacue]').count()) === 0);
  releaseAnswer();
  delayAnswer = false;
  await page.waitForTimeout(250);
  check(
    'late response after Stop cannot resurrect study UI',
    (await page.locator('[data-vernacue]').count()) === 0,
  );
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: 'Start studying', exact: true }).waitFor();
  check('popup initializes with its study controls', true);
  await aiAudit(popup, 'popup');
  await popup.getByLabel('Translate to', { exact: true }).click();
  await popup.getByRole('searchbox', { name: 'Search languages' }).fill('Spanish');
  await popup.getByRole('button', { name: 'Spanish · español', exact: true }).click();
  await popup.waitForFunction(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'settings:get' });
    return r.data.settings.target === 'es';
  });
  check('popup language save does not race recent-language storage', true);
  await options.evaluate(async () => {
    const s = (await chrome.runtime.sendMessage({ type: 'settings:get' })).data;
    await chrome.runtime.sendMessage({
      type: 'settings:patch',
      revision: s.revision,
      patch: { theme: 'dark' },
    });
  });
  await popup.reload();
  await popup.getByRole('button', { name: 'Start studying', exact: true }).waitFor();
  await aiAudit(popup, 'popup-dark');
  await popup.screenshot({ path: 'test-results/popup-dark.png' });
  await options.reload();
  await options.getByRole('heading', { name: 'AI connection', exact: true }).waitFor();
  await aiAudit(options, 'settings-dark');
  await options.screenshot({ path: 'test-results/settings-dark.png', fullPage: true });
  check(
    'blue dark theme preserves the saved profile and target',
    await options.evaluate(async () => {
      const s = (await chrome.runtime.sendMessage({ type: 'settings:get' })).data;
      return s.settings.target === 'es' && s.profiles.some((p) => p.name === 'Japanese practice');
    }),
  );
  check('no uncaught page exceptions', errors.length === 0);
  await writeFile(
    'test-results/browser-results.json',
    JSON.stringify({ passed: results, errors, fixtureProviderCalls: calls }, null, 2),
  );
  console.log(`${results.length} browser checks passed. Evidence: test-results/`);
} catch (error) {
  for (const [i, p] of context.pages().entries()) {
    await p.screenshot({ path: `test-results/failure-${i}.png` }).catch(() => {});
    console.error(
      'PAGE',
      p.url(),
      (
        await p
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(-5000),
    );
  }
  console.error('PAGE ERRORS', errors);
  throw error;
} finally {
  clearTimeout(watchdog);
  await context.close();
}
