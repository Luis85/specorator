/**
 * Vitest stub for the `obsidian` package, which ships only `.d.ts` files in
 * node_modules and has no runtime outside the Obsidian app itself. This stub
 * is wired in via `vitest.config.ts` alias so that tests can exercise the
 * real `ObsidianBridge` (or any other source file that imports from
 * `'obsidian'`) without crashing Vite's import-analysis pass.
 *
 * The stub implements just enough surface for `ObsidianBridge`:
 *   - `normalizePath` — matches Obsidian's behaviour for the cases this stub
 *     exercises (backslashes to forward slashes, collapse runs of slashes,
 *     strip leading + trailing slashes). Does NOT implement Obsidian's NBSP
 *     replacement, Unicode NFC normalisation, or the empty-path → '/' case.
 *   - `Notice`, `TFile`, `TFolder` — empty classes so `instanceof` checks
 *     work and tests can construct sentinel instances.
 *
 * Individual tests that need richer behaviour can override entries with
 * `vi.mock('obsidian', () => ({ ... }))`.
 */

export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (p.startsWith('/')) p = p.slice(1)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export class Notice {
  noticeEl = { addEventListener: () => {} }
  constructor(_msg: string, _ms?: number) {}
  hide(): void {}
}

export class TFile {
  path = ''
  basename = ''
  extension = ''
}

export class TFolder {
  children: unknown[] = []
  name = ''
}

/**
 * Minimal stand-in for the desktop-only `FileSystemAdapter`. Tests can
 * construct an instance and override `getBasePath()` per case; production
 * code only relies on `instanceof FileSystemAdapter` + `getBasePath()`.
 */
export class FileSystemAdapter {
  getBasePath(): string {
    return ''
  }
}

export function setIcon(_el: HTMLElement, _name: string): void {
  // No-op stub; tests that care assert on bridge behaviour, not Obsidian's
  // icon DOM.
}

/**
 * Minimal lifecycle-owner stub for `MarkdownRenderer.render` post-processors.
 * The real `Component` manages child lifecycles; the bridge only needs an
 * instance to pass through, so the stub is empty.
 */
export class Component {
  load(): void {}
  unload(): void {}
}

/**
 * Minimal stub for the static `MarkdownRenderer.render` used by the P2 Obsidian
 * markdown backing (SPEC-RR-010). Coverage-excluded infra; tests assert the
 * pure fragment-walk, not Obsidian's real rendering, so this is a no-op that
 * leaves the element empty (the backing then degrades to `safeMarkdownRender`).
 */
export const MarkdownRenderer = {
  render(_app: unknown, _markdown: string, _el: HTMLElement, _path: string, _c: Component): Promise<void> {
    return Promise.resolve()
  },
}

export type App = unknown
