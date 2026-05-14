import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * TEST-ASM-005 — Static-import audit for ClaudeCliPort.ts.
 *
 * Asserts the ADR-008 narrow-port file imports none of the three forbidden
 * runtime modules:
 *   - `obsidian`                          → no Obsidian API in the domain layer
 *   - `child_process`                     → subprocess concerns belong to infrastructure
 *   - `@anthropic-ai/claude-agent-sdk`    → SDK transport belongs to infrastructure
 *
 * Satisfies REQ-ASM-001 (TEST-ASM-005).
 */

const PORT_FILE = resolve(__dirname, '../../../src/domain/ports/ClaudeCliPort.ts')

const FORBIDDEN_MODULES = [
  'obsidian',
  'child_process',
  '@anthropic-ai/claude-agent-sdk',
] as const

/**
 * Matches static `import ... from '<module>'` and `import '<module>'` forms,
 * including `import type`. Captures the module specifier in group 1.
 */
const STATIC_IMPORT_RE =
  /^\s*import\s+(?:type\s+)?(?:[^'";]*?from\s+)?['"]([^'"]+)['"];?\s*$/gm

/** Matches `require('<module>')` calls (defensive — TS source rarely uses these). */
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/** Matches dynamic `import('<module>')` expressions. */
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function collectImportedModules(source: string): string[] {
  const specifiers: string[] = []
  for (const re of [STATIC_IMPORT_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      specifiers.push(match[1])
    }
  }
  return specifiers
}

describe('ClaudeCliPort.ts import audit (TEST-ASM-005)', () => {
  const source = readFileSync(PORT_FILE, 'utf8')
  const specifiers = collectImportedModules(source)

  it.each(FORBIDDEN_MODULES)(
    'does not import the forbidden module %s',
    (forbidden) => {
      const offenders = specifiers.filter((s) => s === forbidden)
      expect(offenders).toEqual([])
    },
  )

  it('only imports from in-tree @/ paths', () => {
    // Defensive: ensure no surprise third-party import slips into the port file.
    const external = specifiers.filter((s) => !s.startsWith('@/') && !s.startsWith('.'))
    expect(external).toEqual([])
  })
})
