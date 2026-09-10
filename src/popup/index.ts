import { button, el, message, labeled, statusNode, select, dialog } from '../ui/dom';
import { languageButton } from '../ui/language-picker';
import { profileModified, providers } from '../core/settings';
import type { Store, SessionStatus } from '../core/types';
import { brand } from '../ui/brand';
const app = document.getElementById('app')!,
  status = statusNode();
// Use screen space, never the auto-sized popup viewport, to select a stable
// height. Short displays still expose every control through the inner scroller.
const popupHeight = Math.min(588, Math.max(360, screen.availHeight - 120));
document.documentElement.style.setProperty('--popup-height', `${popupHeight}px`);
async function init() {
  let store = await message<Store>('settings:get');
  document.documentElement.dataset.theme = store.settings.theme;
  const workspace = document.createDocumentFragment();
  const header = el('header', { class: 'header' });
  header.append(
    brand('Your language. Your pace.'),
    button('Settings', () => chrome.runtime.openOptionsPage(), 'quiet'),
  );
  const intro = el('div', { class: 'popup-intro' });
  intro.append(
    el('h2', {}, 'A little more understanding.'),
    el('p', { class: 'hint' }, 'Turn a video into a moment of learning.'),
  );
  workspace.append(header, intro);
  const setup = el('section', { class: 'popup-setup', 'aria-label': 'Learning setup' });
  const profiles = select(
    [
      { value: '', label: 'Current settings' },
      ...store.profiles.map((p) => ({ value: p.id, label: p.name })),
    ],
    store.activeProfile,
  );
  profiles.addEventListener('change', async () => {
    try {
      store = await message<Store>('settings:get');
      if (profileModified(store)) {
        const d = dialog(document.body, 'Unsaved profile changes');
        d.append(
          el(
            'p',
            {},
            'Switching loads the saved profile. Keep editing or discard the current changes.',
          ),
          button('Keep editing', () => {
            profiles.value = store.activeProfile;
            d.close();
          }),
          button('Discard and switch', async () => {
            d.close();
            await applyProfile();
          }),
        );
      } else await applyProfile();
    } catch (e) {
      status.textContent = String(e);
    }
  });
  async function applyProfile() {
    if (!profiles.value) return;
    store = await message<Store>('profile:apply', { id: profiles.value });
    location.reload();
  }
  setup.append(labeled('Profile', profiles));
  const lang = languageButton(store.settings.target, document.body, async (tag) => {
    try {
      store = await message<Store>('settings:get');
      store = await message<Store>('settings:patch', {
        revision: store.revision,
        patch: { target: tag },
      });
      status.textContent = 'Target language saved. Apply to this video or start studying.';
    } catch (e) {
      status.textContent = String(e);
    }
  });
  setup.append(labeled('Translate to', lang));
  workspace.append(setup);
  const start = button(
    'Start studying',
    async () => {
      start.disabled = true;
      try {
        const s = await message<SessionStatus & { error?: string }>('tab:command', {
          command: 'start',
        });
        if (s.error) throw new Error(s.error);
        status.textContent = s.status;
        start.textContent = 'Restart / reload captions';
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : 'Unable to start.';
      } finally {
        start.disabled = false;
      }
    },
    'primary',
  );
  const actions = el('section', { class: 'popup-actions', 'aria-label': 'Study actions' });
  actions.append(start);
  const row = el('div', { class: 'row' });
  row.append(
    button('Study panel', async () => {
      try {
        await message('tab:command', { command: 'panel' });
        window.close();
      } catch (e) {
        status.textContent = String(e);
      }
    }),
    button('Stop', async () => {
      await message('tab:command', { command: 'stop' });
      status.textContent = 'Studying stopped.';
    }),
  );
  actions.append(row, status);
  workspace.append(actions);
  const footer = el('footer', { class: 'popup-footer' });
  footer.append(
    button(
      'Apply saved settings to this video',
      async () => {
        await message('tab:command', { command: 'settings' });
        status.textContent = 'Settings applied to this video.';
      },
      'text-action',
    ),
  );
  const connection = await message<{ hasKey: boolean }>('key:status', {
    provider: store.settings.provider,
  });
  const connectionInfo = el('div', { class: 'connection-summary' });
  connectionInfo.append(
    el('span', { class: 'connection-dot', 'aria-hidden': 'true' }),
    el('strong', {}, providers[store.settings.provider].name),
    el('span', {}, connection.hasKey ? 'Key saved' : 'Connect in Settings'),
  );
  if (store.settings.model) connectionInfo.title = store.settings.model;
  footer.append(connectionInfo);
  const hints = el('p', { class: 'shortcut-hint' });
  hints.append(el('kbd', {}, 'Q'), ' Break down  ', el('kbd', {}, 'E'), ' Pause / resume');
  footer.append(hints);
  workspace.append(footer);
  // Mount one complete layout, not a sequence of differently sized popup bodies.
  app.replaceChildren(workspace);
  app.setAttribute('aria-busy', 'false');
  try {
    const current = await message<SessionStatus>('tab:command', { command: 'status' });
    status.textContent = current.active
      ? `${current.count} subtitles · ${current.status}`
      : 'Open a captioned video and start studying.';
  } catch {
    status.textContent = 'Open a YouTube watch page to begin.';
  }
}
init().catch((e) => {
  app.replaceChildren(brand('Your language. Your pace.'), status);
  app.setAttribute('aria-busy', 'false');
  status.textContent = e instanceof Error ? e.message : 'Could not load settings.';
});
