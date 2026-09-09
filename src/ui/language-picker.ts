import { button, dialog, el, message, statusNode } from './dom';
import { languageName, searchLanguages } from '../core/languages';
import type { Store } from '../core/types';
export function languageButton(
  value: string,
  container: HTMLElement | ShadowRoot,
  onSelect: (tag: string) => void | Promise<void>,
  allowAuto = false,
) {
  const b = button(
    languageName(value),
    async () => {
      const d = dialog(container, 'Choose a language');
      const search = el('input', {
        type: 'search',
        placeholder: 'Search names, native names or codes',
        'aria-label': 'Search languages',
      });
      const result = el('ul', { class: 'language-results' }),
        status = statusNode();
      d.append(search, status, result);
      let store = await message<Store>('settings:get');
      const choose = async (tag: string) => {
        // Finish the recent-list write before a caller reads a settings revision.
        if (tag !== 'auto') await message('recent', { language: tag });
        await onSelect(tag);
        b.textContent = languageName(tag);
        d.close();
      };
      function render() {
        result.replaceChildren();
        if (allowAuto && !search.value) {
          const li = el('li');
          li.append(button('Auto · follow video', () => choose('auto')));
          result.append(li);
        }
        const found = searchLanguages(search.value, store.favorites, store.recent);
        status.textContent = `${found.length} languages. Favorites appear first.`;
        for (const lang of found) {
          const li = el('li');
          const favorite = store.favorites.includes(lang.code);
          const pick = button(
            `${lang.name} · ${lang.native}`,
            () => choose(lang.code),
            'language-name',
          );
          pick.lang = lang.code;
          const star = button(
            favorite ? '★' : '☆',
            async () => {
              store = await message<Store>('favorite', { language: lang.code });
              render();
              const next = result.querySelector<HTMLButtonElement>(
                `[data-star="${CSS.escape(lang.code)}"]`,
              );
              next?.focus();
            },
            'star',
          );
          star.setAttribute(
            'aria-label',
            `${favorite ? 'Remove' : 'Add'} ${lang.name} ${favorite ? 'from' : 'to'} favorites`,
          );
          star.setAttribute('aria-pressed', String(favorite));
          star.dataset.star = lang.code;
          li.append(pick, star);
          result.append(li);
        }
      }
      search.addEventListener('input', render);
      search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          result.querySelector('button')?.focus();
          e.preventDefault();
        }
      });
      render();
      search.focus();
    },
    'language-button',
  );
  return b;
}
