import type { Reply } from '../core/types';
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(text: string, action: () => void | Promise<unknown>, cls = '') {
  const b = el('button', { type: 'button', class: cls }, text);
  b.addEventListener('click', () => {
    void Promise.resolve()
      .then(action)
      .catch((e) => {
        const root = b.getRootNode() as Document | ShadowRoot;
        const scope = b.closest('dialog') || root;
        let status = scope.querySelector<HTMLElement>('[role="status"]');
        if (!status) {
          status = statusNode();
          (b.closest('dialog') || b.parentElement)?.append(status);
        }
        status.classList.add('error');
        status.textContent = e instanceof Error ? e.message : 'Action failed. Try again.';
      });
  });
  return b;
}
export async function message<T = unknown>(
  type: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const r = (await chrome.runtime.sendMessage({ type, ...fields })) as Reply<T>;
  if (!r?.ok) throw new Error(r && !r.ok ? r.error : 'Extension disconnected. Reload this page.');
  return r.data;
}
export function labeled(label: string, control: HTMLElement, help?: string) {
  const wrap = el('div', { class: 'field' }),
    id = control.id || `field-${crypto.randomUUID()}`;
  control.id = id;
  wrap.append(el('label', { for: id }, label), control);
  if (help) {
    const hint = el('p', { class: 'hint', id: `${id}-hint` }, help);
    control.setAttribute('aria-describedby', hint.id);
    wrap.append(hint);
  }
  return wrap;
}
export function select(options: { value: string; label: string }[], value: string) {
  const s = el('select');
  for (const o of options) s.append(el('option', { value: o.value }, o.label));
  s.value = value;
  return s;
}
export function check(label: string, value: boolean, onChange: (value: boolean) => void) {
  const input = el('input', { type: 'checkbox' });
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const l = el('label', { class: 'check' });
  l.append(input, document.createTextNode(label));
  return l;
}
export function dialog(container: HTMLElement | ShadowRoot, title: string) {
  const previous = (
    container instanceof ShadowRoot ? container.activeElement : document.activeElement
  ) as HTMLElement | null;
  const d = el('dialog', { 'aria-label': title }),
    header = el('div', { class: 'dialog-head' });
  header.append(
    el('h2', {}, title),
    button('Close', () => d.close(), 'quiet'),
  );
  d.append(header);
  container.append(d);
  d.addEventListener('close', () => {
    d.remove();
    previous?.focus();
  });
  d.showModal();
  return d;
}
export function statusNode() {
  return el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
}
