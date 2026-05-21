/**
 * T-MPS-057 — Static lint: `CursorBinaryResolver.ts` and `CursorCliAdapter.ts`
 * never reference `~/.cursor/`, the cursor credentials file, or any
 * cursor-home environment variable.
 *
 * Satisfies: REQ-MPS-016 ("ToS posture": resolver and adapter never read or
 * spawn against the user's home Cursor directory). Mirror of T-ASM-049 for
 * Claude. Runtime defence-in-depth lives in the adapter/resolver unit suites;
 * this test is the lint-layer gate.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()

const TARGET_FILES = [
  ['src', 'infrastructure', 'obsidian', 'CursorBinaryResolver.ts'],
  ['src', 'infrastructure', 'obsidian', 'CursorCliAdapter.ts'],
  ['src', 'infrastructure', 'obsidian', 'buildCursorSubprocessArgs.ts'],
].map((p) => join(REPO_ROOT, ...p))

/**
 * Forbidden tokens. Assembled via concatenation so the test fixture itself is
 * not flagged by a hypothetical future codemod that scans for the literal.
 */
const HOME_CURSOR = '~/.cursor' + '/'
const CREDENTIALS_JSON = '.credentials' + '.json'
const CURSOR_HOME_ENV = 'CURSOR_HOME'
const CURSOR_TOKEN_ENV = 'CURSOR_TOKEN'

const FORBIDDEN = [HOME_CURSOR, CREDENTIALS_JSON, CURSOR_HOME_ENV, CURSOR_TOKEN_ENV] as const

describe('REQ-MPS-016 — Cursor resolver and adapter avoid home-dir credentials', () => {
  it('TST-MPS-57: no Cursor source file references `~/.cursor/`, credentials file, or cursor-home env vars', () => {
    const hits: Array<{ file: string; token: string }> = []
    for (const file of TARGET_FILES) {
      if (!existsSync(file)) continue // Created during WS-5; skip if not yet present.
      const text = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN) {
        if (text.includes(token)) hits.push({ file, token })
      }
    }
    expect(hits).toEqual([])
  })
})
