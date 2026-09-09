import { button, el, message, labeled, statusNode, select, dialog } from '../ui/dom';
import { languageButton } from '../ui/language-picker';
import { profileModified, providers } from '../core/settings';
import type { Store, SessionStatus } from '../core/types';
const app = document.getElementById('app')!,
  status = statusNode();
async function init() {
  let store = await message<Store>('settings:get');
  document.documentElement.dataset.theme = store.settings.theme;
  const header = el('header', { class: 'header' });
  header.append(
    el('h1', { class: 'brand' }, 'Vernacue'),
    button('Settings', () => chrome.runtime.openOptionsPage(), 'quiet'),
  );
  app.append(header, el('p', { class: 'eyebrow' }, 'Make subtitles make sense'));
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
  app.append(labeled('Profile', profiles));
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
  app.append(labeled('Translate to', lang));
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
  app.append(start);
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
  app.append(row, status);
  app.append(
    button(
      'Apply saved settings to this video',
      async () => {
        await message('tab:command', { command: 'settings' });
        status.textContent = 'Settings applied to this video.';
      },
      'quiet',
    ),
  );
  const connection = await message<{ hasKey: boolean }>('key:status', {
    provider: store.settings.provider,
  });
  app.append(
    el(
      'p',
      { class: 'hint' },
      `${providers[store.settings.provider].name} · ${connection.hasKey ? 'Key saved' : 'No key yet'}${store.settings.model ? ` · ${store.settings.model}` : ''}`,
    ),
  );
  const hints = el('p', { class: 'shortcut-hint' });
  hints.append(el('kbd', {}, 'Q'), ' Break down  ', el('kbd', {}, 'E'), ' Pause / resume');
  app.append(hints);
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
  app.append(status);
  status.textContent = e instanceof Error ? e.message : 'Could not load settings.';
});
