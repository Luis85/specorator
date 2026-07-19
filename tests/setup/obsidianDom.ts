// Polyfills Obsidian's HTMLElement extensions (createDiv, createEl, empty) onto
// jsdom's HTMLElement.prototype so production code that uses them can run under
// the jsdom test environment. Idempotent: safe to import from multiple tests.
//
// Type signatures for these helpers come from `obsidian.d.ts` (which augments
// the global `Node` / `HTMLElement` interfaces). We only install the runtime
// methods here; no global type augmentation, so we do not clash with Obsidian's
// own DomElementInfo signature.

import { createMockEl } from '../helpers/mockElement';

interface CreateOpts {
  cls?: string | string[];
  text?: string;
  type?: string;
  attr?: Record<string, string | number | boolean | null | undefined>;
  [key: string]: unknown;
}

function applyCreateOpts(el: HTMLElement, opts?: CreateOpts | string): void {
  if (!opts) return;
  if (typeof opts === 'string') {
    el.className = opts;
    return;
  }
  if (opts.cls) {
    el.className = Array.isArray(opts.cls) ? opts.cls.join(' ') : opts.cls;
  }
  if (opts.text !== undefined) el.textContent = opts.text;
  // Obsidian's DomElementInfo sets `type` as an attribute (inputs, buttons).
  if (typeof opts.type === 'string') el.setAttribute('type', opts.type);
  // Real Obsidian's DomElementInfo also documents these as direct pass-through
  // attributes (obsidian.d.ts): value/placeholder/href/title.
  if (typeof opts.value === 'string') el.setAttribute('value', opts.value);
  if (typeof opts.placeholder === 'string') el.setAttribute('placeholder', opts.placeholder);
  if (typeof opts.href === 'string') el.setAttribute('href', opts.href);
  if (typeof opts.title === 'string') el.setAttribute('title', opts.title);
  if (opts.attr) {
    for (const [name, value] of Object.entries(opts.attr)) {
      if (value === null || value === undefined) continue;
      el.setAttribute(name, String(value));
    }
  }
}

export function installObsidianDom(): void {
  const proto = (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement?.prototype as
    | (HTMLElement & Record<string, unknown>)
    | undefined;
  if (!proto) return;

  const protoRecord = proto as unknown as Record<string, unknown>;

  if (typeof protoRecord.createDiv !== 'function') {
    protoRecord.createDiv = function createDiv(
      this: HTMLElement,
      opts?: CreateOpts | string,
    ): HTMLDivElement {
      const child = this.ownerDocument.createElement('div');
      applyCreateOpts(child, opts);
      this.appendChild(child);
      return child;
    };
  }

  if (typeof protoRecord.createEl !== 'function') {
    protoRecord.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElement,
      tag: K,
      opts?: CreateOpts | string,
    ): HTMLElementTagNameMap[K] {
      const child = this.ownerDocument.createElement(tag);
      applyCreateOpts(child, opts);
      this.appendChild(child);
      return child;
    };
  }

  if (typeof protoRecord.empty !== 'function') {
    protoRecord.empty = function empty(this: HTMLElement): void {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (typeof protoRecord.addClass !== 'function') {
    protoRecord.addClass = function addClass(this: HTMLElement, cls: string): void {
      this.classList.add(cls);
    };
  }

  if (typeof protoRecord.removeClass !== 'function') {
    protoRecord.removeClass = function removeClass(this: HTMLElement, cls: string): void {
      this.classList.remove(cls);
    };
  }

  if (typeof protoRecord.hasClass !== 'function') {
    protoRecord.hasClass = function hasClass(this: HTMLElement, cls: string): boolean {
      return this.classList.contains(cls);
    };
  }

  if (typeof protoRecord.toggleClass !== 'function') {
    protoRecord.toggleClass = function toggleClass(
      this: HTMLElement,
      cls: string,
      force?: boolean,
    ): void {
      if (force === undefined) {
        this.classList.toggle(cls);
      } else {
        this.classList.toggle(cls, force);
      }
    };
  }

  if (typeof protoRecord.setText !== 'function') {
    protoRecord.setText = function setText(this: HTMLElement, value: string): void {
      this.textContent = value;
    };
  }

  if (typeof protoRecord.appendText !== 'function') {
    protoRecord.appendText = function appendText(this: HTMLElement, value: string): void {
      this.appendChild(this.ownerDocument.createTextNode(value));
    };
  }

  if (typeof protoRecord.createSpan !== 'function') {
    protoRecord.createSpan = function createSpan(
      this: HTMLElement,
      opts?: CreateOpts | string,
    ): HTMLSpanElement {
      const child = this.ownerDocument.createElement('span');
      applyCreateOpts(child, opts);
      this.appendChild(child);
      return child;
    };
  }

  if (typeof protoRecord.setAttr !== 'function') {
    protoRecord.setAttr = function setAttr(
      this: HTMLElement,
      name: string,
      value: string | number | boolean | null,
    ): void {
      if (value === null) {
        this.removeAttribute(name);
        return;
      }
      this.setAttribute(name, String(value));
    };
  }

  if (typeof protoRecord.setCssProps !== 'function') {
    protoRecord.setCssProps = function setCssProps(
      this: HTMLElement,
      props: Record<string, string>,
    ): void {
      for (const [name, value] of Object.entries(props)) {
        this.style.setProperty(name, value);
      }
    };
  }
}

// Obsidian also exposes `createEl`/`createDiv`/`createSpan`/`createFragment` as
// GLOBAL functions that build a DETACHED element (no parent append) — distinct
// from the instance methods above. Production code uses the global form for
// detached roots/sentinels (e.g. codeBlockFormatter, InlineEditModal widget
// roots, the streaming content sentinel). Install them so those paths run in
// BOTH test lanes: the jsdom lane creates real elements, and the DOM-less Jest
// node lane falls back to `createMockEl` — mirroring how the mock element's own
// `ownerDocument.createElement` resolves (helpers/mockElement.ts).
function createDetachedElement(tag: string): HTMLElement {
  const doc = (globalThis as { document?: Document }).document;
  return (doc ? doc.createElement(tag) : createMockEl(tag)) as HTMLElement;
}

export function installObsidianGlobals(): void {
  const globalRecord = globalThis as Record<string, unknown>;

  if (typeof globalRecord.createEl !== 'function') {
    globalRecord.createEl = function createEl(tag: string, opts?: CreateOpts | string): HTMLElement {
      const el = createDetachedElement(tag);
      applyCreateOpts(el, opts);
      return el;
    };
  }

  if (typeof globalRecord.createDiv !== 'function') {
    globalRecord.createDiv = function createDiv(opts?: CreateOpts | string): HTMLElement {
      const el = createDetachedElement('div');
      applyCreateOpts(el, opts);
      return el;
    };
  }

  if (typeof globalRecord.createSpan !== 'function') {
    globalRecord.createSpan = function createSpan(opts?: CreateOpts | string): HTMLElement {
      const el = createDetachedElement('span');
      applyCreateOpts(el, opts);
      return el;
    };
  }

  if (typeof globalRecord.createFragment !== 'function') {
    globalRecord.createFragment = function createFragment(): DocumentFragment {
      const doc = (globalThis as { document?: Document }).document;
      return (doc ? doc.createDocumentFragment() : createMockEl('fragment')) as unknown as DocumentFragment;
    };
  }
}

installObsidianDom();
installObsidianGlobals();
