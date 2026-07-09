import type { VaultFileAdapter } from '../core/storage/VaultFileAdapter';

/** Slugifies a user-entered library item name into a vault-safe folder name. */
export function librarySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Resolves the first free `<parent>/<slug>` (then `-2`, `-3`, …) directory so a
 * new library item never clobbers an existing one.
 */
export async function uniqueChildDir(
  adapter: VaultFileAdapter,
  parent: string,
  slug: string,
): Promise<string> {
  const base = slug || 'item';
  let dir = `${parent}/${base}`;
  for (let n = 2; await adapter.exists(dir); n += 1) dir = `${parent}/${base}-${n}`;
  return dir;
}

/**
 * Renames a `<root>/<oldName>/<file>` library item by moving it into a fresh
 * `<root>/<newSlug>/` directory and removing the old one. Writes `content` (the
 * possibly-edited body) to the new file and returns its path.
 */
export async function renameLibraryItemDir(
  adapter: VaultFileAdapter,
  oldFilePath: string,
  root: string,
  newSlug: string,
  content: string,
): Promise<string> {
  const filename = oldFilePath.slice(oldFilePath.lastIndexOf('/') + 1);
  const oldDir = oldFilePath.slice(0, oldFilePath.length - filename.length - 1);
  const newDir = await uniqueChildDir(adapter, root, newSlug);
  const newPath = `${newDir}/${filename}`;
  await adapter.write(newPath, content);
  if (newPath !== oldFilePath) {
    await adapter.delete(oldFilePath);
    await adapter.deleteFolder(oldDir);
  }
  return newPath;
}

/** A brief muted placeholder shown while an async list resolves. */
export function renderLibraryLoading(list: HTMLElement, text: string): void {
  list.createDiv({ cls: 'specorator-library-loading', text });
}

/** Uppercase section label used inside the library editor modals. */
export function renderModalLabel(parent: HTMLElement, text: string): void {
  parent.createDiv({ cls: 'specorator-library-modal-label', text });
}

/** Label + value metadata row used inside the library editor modals. */
export function renderModalField(parent: HTMLElement, label: string, value: string): void {
  const field = parent.createDiv({ cls: 'specorator-library-modal-field' });
  renderModalLabel(field, label);
  field.createDiv({ cls: 'specorator-library-modal-value', text: value });
}

/** Label + editable text input row used for rename inside the editor modals. */
export function renderModalTextField(parent: HTMLElement, label: string, value: string): HTMLInputElement {
  const field = parent.createDiv({ cls: 'specorator-library-modal-field' });
  renderModalLabel(field, label);
  const input = field.createEl('input', { type: 'text', cls: 'specorator-library-modal-input' });
  input.value = value;
  // The preceding label is a plain <div> with no `for` association, so name the
  // control directly for screen readers.
  input.setAttribute('aria-label', label);
  return input;
}

/** Monospace, spellcheck-off code/content textarea seeded with `value`. */
export function createModalCodeArea(parent: HTMLElement, value: string, ariaLabel?: string): HTMLTextAreaElement {
  const el = parent.createEl('textarea', { cls: 'specorator-library-modal-code' });
  el.value = value;
  el.spellcheck = false;
  // The preceding `renderModalLabel` div isn't associated with this textarea,
  // so callers pass the same label text to name it for screen readers.
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  return el;
}

/** Right-aligned modal footer with an optional primary Save and a Close button. */
export function renderModalFooter(
  parent: HTMLElement,
  opts: { saveLabel?: string; onSave?: () => void; closeLabel: string; onClose: () => void },
): void {
  const footer = parent.createDiv({ cls: 'specorator-library-modal-footer' });
  if (opts.saveLabel && opts.onSave) {
    footer.createEl('button', { cls: 'mod-cta', text: opts.saveLabel }).onclick = opts.onSave;
  }
  footer.createEl('button', { text: opts.closeLabel }).onclick = opts.onClose;
}
