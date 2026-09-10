// Test Chrome's actual auto-sized toolbar popup, not popup.html in a normal tab.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: !process.env.HEADED,
  viewport: null,
  args: [
    '--window-size=1280,1000',
    `--disable-extensions-except=${resolve('dist')}`,
    `--load-extension=${resolve('dist')}`,
  ],
});
const record = process.argv.includes('--record');
const prefix = process.env.POPUP_CAPTURE || 'native-popup';
try {
  await mkdir('test-results', { recursive: true });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const root = await context.newCDPSession(context.pages()[0]);
  await worker.evaluate(() => chrome.action.openPopup());
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    target = (await root.send('Target.getTargets')).targetInfos.find((t) =>
      t.url.endsWith('/popup.html'),
    );
    if (!target) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(target, 'Chrome created a native toolbar popup');
  const { sessionId } = await root.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  let serial = 0;
  const pending = new Map();
  root.on('Target.receivedMessageFromTarget', (event) => {
    if (event.sessionId !== sessionId) return;
    const response = JSON.parse(event.message),
      p = pending.get(response.id);
    if (!p) return;
    pending.delete(response.id);
    clearTimeout(p.timer);
    response.error ? p.reject(new Error(response.error.message)) : p.resolve(response.result);
  });
  async function send(method, params = {}) {
    const id = ++serial;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
    });
    await root.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method, params }),
    });
    return result;
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  await evaluate(
    `new Promise(resolve=>{const wait=()=>document.querySelector('.language-button')?resolve(true):setTimeout(wait,20);wait();})`,
  );
  async function measure() {
    return evaluate(
      `new Promise(resolve=>{const values=[];let i=0;const timer=setInterval(()=>{values.push({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight});if(++i===40){clearInterval(timer);resolve(values);}},50);})`,
    );
  }
  const samples = await measure();
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`test-results/${prefix}.png`, Buffer.from(screenshot.data, 'base64'));
  const unique = [...new Set(samples.map((s) => `${s.width}x${s.height}`))];
  console.log('Native popup sizes:', unique);
  await writeFile(`test-results/${prefix}.json`, JSON.stringify({ samples, unique }, null, 2));
  if (!record) {
    assert.equal(unique.length, 1, 'popup stops resizing after initialization');
    assert.equal(samples[0].width, 392, 'native popup uses its intended width');
    const expectedHeight = await evaluate(`Math.min(588, Math.max(360, screen.availHeight - 120))`);
    assert.equal(samples[0].height, expectedHeight, 'native popup fits available screen space');
    assert.ok(
      samples.every((s) => s.scrollWidth === s.width && s.scrollHeight === s.height),
      'no root scrollbar feedback',
    );
    const bounds = await evaluate(
      `(()=>{const r=document.querySelector('.language-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...bounds,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...bounds,
    });
    const modalSamples = await measure();
    assert.ok(
      await evaluate(`!!document.querySelector('dialog[open]')`),
      'native click opens language picker',
    );
    assert.ok(
      modalSamples.every((s) => s.width === 392 && s.height === expectedHeight),
      'opening a language dialog cannot resize the popup',
    );
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    assert.ok(
      await evaluate(
        `!document.querySelector('dialog[open]')&&document.activeElement.classList.contains('language-button')`,
      ),
      'Escape restores focus',
    );
    await evaluate(
      `document.querySelector('.popup-actions .status').textContent = 'A long connection error. '.repeat(20)`,
    );
    const longSamples = await measure();
    assert.ok(
      longSamples.every((s) => s.width === 392 && s.height === expectedHeight),
      'long status text cannot resize the popup',
    );
    assert.ok(
      await evaluate(
        `(()=>{const pane=document.querySelector('.popup');pane.scrollTop=pane.scrollHeight;return document.querySelector('.shortcut-hint').getBoundingClientRect().bottom<=innerHeight;})()`,
      ),
      'bottom controls remain reachable through the inner scroller',
    );
    console.log(
      'PASS actual toolbar popup: stable bounds, long status, inner scrolling, native language click, Escape focus',
    );
  }
} finally {
  await context.close();
}
