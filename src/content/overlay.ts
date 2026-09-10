import base from '../../ui.css';
import { button, el, dialog, statusNode } from '../ui/dom';
import { words, direction, languageName } from '../core/languages';
import type { Settings, AIResult } from '../core/types';
export class Overlay {
  host = el('vernacue-ui' as 'div');
  shadow: ShadowRoot;
  box = el('section', { class: 'subtitle-box', 'aria-label': 'Vernacue subtitles' });
  original = el('div', { class: 'subtitle-line', 'aria-label': 'Original subtitle' });
  translated = el('div', { class: 'subtitle-line translation', 'aria-label': 'Translation' });
  note = el('div', { class: 'cue-note' });
  pause: HTMLButtonElement;
  panel?: HTMLDialogElement;
  panelBody?: HTMLElement;
  panelStatus?: HTMLElement;
  onPin: (pinned: boolean) => void = () => {};
  constructor(
    parent: HTMLElement,
    handlers: {
      pause: () => void;
      breakdown: () => void;
      word: (word: string, text: string, lang: string) => void;
      retry: () => void;
      more: () => void;
    },
  ) {
    this.host.dataset.vernacue = 'true';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    // The host page can see this DOM, but cannot impersonate user interaction
    // to turn on paid features or request explanations.
    for (const type of ['click', 'change', 'input']) {
      this.shadow.addEventListener(
        type,
        (event) => {
          if (!event.isTrusted) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        { capture: true },
      );
    }
    const style = el('style');
    style.textContent =
      base +
      `
      :host { all:initial; font:16px/1.5 system-ui,sans-serif; color:var(--ink); position:absolute; inset:0; z-index:2147483646; pointer-events:none; }
      .subtitle-box { position:absolute; left:50%; transform:translateX(-50%); bottom:64px; border-radius:10px; text-align:center; pointer-events:auto; max-height:55%; overflow:auto; }
      .subtitle-line { overflow-wrap:anywhere; unicode-bidi:plaintext; } .translation { margin-top:7px; } .cue-note { font:13px/1.4 system-ui,sans-serif; padding:4px; }
      .toolbar { display:flex; justify-content:center; flex-wrap:wrap; gap:6px; margin-top:8px; } .toolbar button { font:14px/1.4 system-ui,sans-serif; min-height:36px; padding:5px 10px; }
      .word { font:inherit; line-height:inherit; color:inherit; background:none; border:0; border-radius:2px; min-height:0; padding:0; margin:0; }
      .word:hover { text-decoration:underline; background:transparent; border-color:transparent; } .word:focus-visible { outline:2px solid #76baff; outline-offset:2px; }
      .study-source { white-space:pre-wrap; font-size:20px; line-height:1.6; } .chunk { border-bottom:1px solid var(--line); padding:12px 0; } .chunk .source { white-space:pre-wrap; font-size:19px; margin:0 0 6px; }
      .study-footer { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; } .subtitle-box:empty { display:none; }
      @media (max-height:500px) { .subtitle-box { bottom:44px; max-height:65%; } }
    `;
    const toolbar = el('div', { class: 'toolbar', role: 'group', 'aria-label': 'Study controls' });
    this.pause = button('Pause · E', handlers.pause);
    toolbar.append(
      button('Break down · Q', handlers.breakdown),
      this.pause,
      button('More', handlers.more),
    );
    this.box.append(this.original, this.translated, this.note, toolbar);
    this.shadow.append(style, this.box);
    parent.append(this.host);
    const render = (node: HTMLElement) => {
      node.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-word]');
        if (b && !getSelection()?.toString())
          handlers.word(b.dataset.word!, node.textContent || '', node.lang);
      });
      node.addEventListener('focusin', () => this.onPin(true));
      node.addEventListener('focusout', () => {
        queueMicrotask(() => {
          if (!node.contains(this.shadow.activeElement)) this.onPin(false);
        });
      });
    };
    render(this.original);
    render(this.translated);
  }
  apply(settings: Settings) {
    this.host.dataset.theme = settings.theme;
    const a = settings.appearance;
    Object.assign(this.box.style, {
      fontSize: `${a.size}px`,
      width: `${a.width}%`,
      padding: `${a.padding}px`,
      color: a.text,
      backgroundColor: `${a.background}${Math.round(a.opacity * 2.55)
        .toString(16)
        .padStart(2, '0')}`,
      lineHeight: String(a.lineHeight),
      top: a.position === 'top' ? '20px' : 'auto',
      bottom: a.position === 'bottom' ? '64px' : 'auto',
    });
  }
  line(node: HTMLElement, text: string, language: string) {
    node.replaceChildren();
    node.lang = language;
    node.dir = direction(language);
    for (const token of words(text, language)) {
      if (!token.word) node.append(document.createTextNode(token.text));
      else {
        const b = el(
          'button',
          {
            type: 'button',
            class: 'word',
            'data-word': token.text,
            'aria-label': `Explain ${token.text}`,
          },
          token.text,
        );
        node.append(b);
      }
    }
    node.hidden = !text;
  }
  study(
    text: string,
    language: string,
    explanation: string,
    resume: () => void,
    listen: () => void,
    closed: () => void,
  ) {
    this.panel?.close();
    const d = dialog(this.shadow, 'Study this subtitle');
    this.panel = d;
    d.append(
      el(
        'p',
        { class: 'hint' },
        `${languageName(language)} · Explain in ${languageName(explanation)}`,
      ),
      el('p', { class: 'study-source', lang: language, dir: direction(language) }, text),
    );
    this.panelStatus = statusNode();
    this.panelBody = el('div', { lang: explanation, dir: direction(explanation) });
    const footer = el('div', { class: 'study-footer' });
    footer.append(button('Listen', listen), button('Resume video', resume, 'primary'));
    d.append(this.panelStatus, this.panelBody, footer);
    d.addEventListener('close', () => {
      if (this.panel === d) {
        this.panel = undefined;
        closed();
      }
    });
    return d;
  }
  result(result: AIResult, language: string) {
    this.panelBody?.replaceChildren();
    if (!this.panelBody) return;
    if (result.chunks)
      for (const chunk of result.chunks) {
        const row = el('div', { class: 'chunk' });
        row.append(
          el('p', { class: 'source', lang: language, dir: direction(language) }, chunk.text),
          el('p', {}, chunk.meaning),
        );
        this.panelBody.append(row);
      }
    else
      for (const [label, value] of [
        ['Meaning here', result.meaning],
        ['Common meaning', result.general],
        ['Usage', result.note],
      ])
        if (value) this.panelBody.append(el('h3', {}, label), el('p', {}, value));
    if (this.panelStatus)
      this.panelStatus.textContent = result.cached
        ? 'Saved answer'
        : 'AI explanation · check uncertain meanings';
  }
  destroy() {
    const panel = this.panel;
    this.panel = undefined;
    panel?.close();
    this.host.remove();
  }
}
