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

export type App = unknown
