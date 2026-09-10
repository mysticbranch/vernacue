import { el } from './dom';

export function brand(subtitle: string) {
  const lockup = el('div', { class: 'brand-lockup' });
  const mark = el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'v');
  const text = el('div');
  text.append(
    el('h1', { class: 'brand' }, 'Vernacue'),
    el('p', { class: 'brand-caption' }, subtitle),
  );
  lockup.append(mark, text);
  return lockup;
}
