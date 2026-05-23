import type { Unsubscriber } from './shared'

export interface ActiveFileSnapshot {
  path: string
  basename: string
  extension: string
}

export interface WorkspacePort {
  openFile(path: string): Promise<void>
  getActiveFile(): ActiveFileSnapshot | null
  onActiveFileChanged(handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber
  /**
   * QW-B — vault-relative POSIX path of the currently focused note, or `null`
   * when no markdown view is active. Synchronous: queries Obsidian's
   * in-memory workspace.
   *
   * Distinct from `getActiveFile().path` for two reasons:
   *   - it is the canonical seam for the chat panel's `<vault-context>` block;
   *   - `getActiveFile()` returns the full `ActiveFileSnapshot` (basename +
   *     extension) which the suffix composer does not need. Keeping a separate
   *     accessor lets adapters that only know the path (e.g. tests) implement
   *     this without fabricating basename/extension.
   */
  getActiveFilePath(): string | null
  /**
   * QW-B — current editor selection text, or `null` when no editor is active
   * or the selection is empty. Multi-line selections preserve embedded
   * newlines verbatim. Implementations must convert an empty-string
   * selection to `null` so the suffix composer does not emit an empty
   * `Selection:` row.
   */
  getActiveSelection(): string | null
}
