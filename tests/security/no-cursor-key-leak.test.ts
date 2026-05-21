/**
 * T-MPS-152 / NFR-MPS-001 — defence-in-depth grep for Cursor API key
 * patterns in settings fixtures.
 *
 * The Cursor secret store is `SECRET_ID_CURSOR` (REQ-MPS-013); fixtures
 * under `tests/__fixtures__/settings/**` must NOT contain raw key material.
 * If the key ever leaks into `data.json` (production fixture, copy-paste
 * accident) this test fails at CI.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CURSOR_KEY_PATTERN = /\bcur_[A-Za-z0-9]{32,}\b/

function walk(dir: string, acc: string[]): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    const path = join(dir, name)
    const s = statSync(path)
    if (s.isDirectory()) walk(path, acc)
    else if (s.isFile()) acc.push(path)
  }
  return acc
}

function scanRoots(): string[] {
  const cwd = process.cwd()
  const roots = [
    join(cwd, 'tests', '__fixtures__'),
    join(cwd, 'tests', 'plugin'),
    join(cwd, 'tests', 'infrastructure'),
    join(cwd, 'src', 'infrastructure', 'mock'),
  ]
  return roots.flatMap((r) => walk(r, []))
}

describe('NFR-MPS-001 — no Cursor key leak in settings fixtures', () => {
  it('matches zero `cur_...` patterns across fixture surface', () => {
    const offenders: Array<{ file: string; match: string }> = []
    for (const file of scanRoots()) {
      // Skip the test file itself — it intentionally contains the regex.
      if (file.endsWith('no-cursor-key-leak.test.ts')) continue
      let content: string
      try {
        content = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const m = CURSOR_KEY_PATTERN.exec(content)
      if (m !== null) offenders.push({ file, match: m[0] })
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})
