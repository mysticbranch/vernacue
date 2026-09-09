// Optional live compatibility probe. No AI credentials or personal browser profile.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  page.on('response', async (r) => {
    if (r.url().includes('/api/timedtext')) {
      try {
        console.log(
          'Caption response',
          r.status(),
          (await r.body()).length,
          'parameters:',
          [...new URL(r.url()).searchParams.keys()].join(','),
        );
      } catch {}
    }
  });
  await page.goto(process.env.YOUTUBE_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  const reject = page.getByRole('button', { name: /Reject all|Alle ablehnen/i });
  if (await reject.count()) await reject.first().click();
  await page.waitForSelector('video', { timeout: 25000 });
  const cc = page.locator('.ytp-subtitles-button');
  if (await cc.count()) await cc.click().catch(() => {});
  await page
    .locator('video')
    .evaluate((v) => v.play())
    .catch(() => {});
  await page.waitForTimeout(5000);
  console.log(
    'Player state',
    await page.evaluate(() => ({
      time: document.querySelector('video')?.currentTime,
      paused: document.querySelector('video')?.paused,
      error: document.querySelector('.ytp-error')?.textContent,
      visibleCaptions: document.querySelector('.ytp-caption-window-container')?.textContent,
      cc: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed'),
    })),
  );
  const result = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
    return chrome.tabs.sendMessage(tab.id, {
      type: 'command',
      command: 'start',
      settings: { source: 'auto', translate: false },
    });
  });
  console.log(JSON.stringify(result));
  if (!result.count) process.exitCode = 1;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await context.close();
}
