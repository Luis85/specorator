/**
 * T-MHP-110 — `MigrationService` semantic-equality verify test
 * (FAILING-FIRST, TDD).
 *
 * Owner: qa.  Drives SPEC-MHP-038 against the unimplemented
 * `MigrationService` at `src/infrastructure/obsidian/MigrationService.ts`.
 *
 * Satisfies:
 *   - REQ-MHP-027 (migrate `.mcp.json` → `.obsidian/mcp.local.json`)
 *   - REQ-MHP-028 (verify-before-delete; deep-equal, not byte-equal — F-004)
 *   - REQ-MHP-029 (idempotent: a second run is a no-op)
 *   - REQ-MHP-030 (all configured fields preserved via deep equality)
 *   - REQ-MHP-031 (`.gitignore` line `.obsidian/mcp.local.json`, LF, idempotent)
 *   - NFR-MHP-010 (deep equality of nested object fields after migration)
 *   - NFR-MHP-013 (zero root-file deletions when verify fails — fault paths)
 * Covers TEST-MHP-028, TEST-MHP-029, TEST-MHP-030, TEST-MHP-031, TEST-MHP-032,
 *        TEST-MHP-057.  EC-MHP-017..022, EC-MHP-041.
 *
 * Scope (per user prompt for this slice): focuses on the semantic-equality
 * verify path (REQ-MHP-028 + EC-MHP-019 + EC-MHP-041) + happy path +
 * idempotence + `.gitignore` LF idempotence + both-files-present conflict.
 *
 * TDD invariant: imports the unimplemented `MigrationService` module.
 * Vitest will fail at module resolution until T-MHP-111 lands.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'

import { MigrationService } from '@/infrastructure/obsidian/MigrationService'

const ROOT_FILE = '.mcp.json'
const TARGET_FILE = '.obsidian/mcp.local.json'
const GITIGNORE = '.gitignore'

function makeService(ports: FakePorts): InstanceType<typeof MigrationService> {
  return new MigrationService({
    vault: ports.vault,
    logger: ports.logger,
    notify: ports.notifications,
  })
}

describe('MigrationService.runOnce — semantic-equality verify (SPEC-MHP-038)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('REQ-MHP-029 + EC-MHP-020 — returns "noop" when `.mcp.json` is absent at vault root', async () => {
    const svc = makeService(ports)
    const out = await svc.runOnce()
    expect(out).toBe('noop')
    // No target file written, no gitignore touched.
    expect(await ports.vault.fileExists(TARGET_FILE)).toBe(false)
    expect(await ports.vault.fileExists(GITIGNORE)).toBe(false)
  })

  it('REQ-MHP-027 + REQ-MHP-028 — happy path: re-serialises, writes target, verifies deep-equal, deletes root', async () => {
    const src = {
      mcpServers: {
        specorator: { url: 'http://127.0.0.1:0/mcp', transport: 'http', headers: { 'x-test': 'ok' } },
      },
    }
    // Minified input — verify is by deep equality, NOT byte equality (F-004).
    await ports.vault.writeFile(ROOT_FILE, JSON.stringify(src))

    const out = await makeService(ports).runOnce()
    expect(out).toBe('success')

    // Root deleted; target present.
    expect(await ports.vault.fileExists(ROOT_FILE)).toBe(false)
    expect(await ports.vault.fileExists(TARGET_FILE)).toBe(true)

    // Target serialised with 2-space indent per SPEC step 3.
    const written = await ports.vault.readFile(TARGET_FILE)
    expect(written).toBe(JSON.stringify(src, null, 2))
    // Deep equality holds (NFR-MHP-010).
    expect(JSON.parse(written)).toEqual(src)
  })

  it('REQ-MHP-031 + CLAR-MHP-014 — happy path appends `.obsidian/mcp.local.json` to .gitignore with LF only', async () => {
    await ports.vault.writeFile(ROOT_FILE, '{"mcpServers":{}}')
    await ports.vault.writeFile(GITIGNORE, 'node_modules\n')

    const out = await makeService(ports).runOnce()
    expect(out).toBe('success')

    const gi = await ports.vault.readFile(GITIGNORE)
    // LF only; no CR injected.
    expect(gi.includes('\r')).toBe(false)
    // The exact line is present exactly once.
    const lines = gi.split('\n').filter((l) => l.length > 0)
    expect(lines.filter((l) => l === TARGET_FILE)).toHaveLength(1)
  })

  it('REQ-MHP-031 — `.gitignore` append is idempotent (no duplicate line if already present)', async () => {
    await ports.vault.writeFile(ROOT_FILE, '{"mcpServers":{}}')
    await ports.vault.writeFile(GITIGNORE, `node_modules\n${TARGET_FILE}\n`)

    await makeService(ports).runOnce()

    const gi = await ports.vault.readFile(GITIGNORE)
    const occurrences = gi.split('\n').filter((l) => l === TARGET_FILE).length
    expect(occurrences).toBe(1)
  })

  it('REQ-MHP-028 + NFR-MHP-010 — nested-object .mcp.json survives migration with deep equality (TEST-MHP-031)', async () => {
    const src = {
      mcpServers: {
        specorator: {
          url: 'http://127.0.0.1:0/mcp',
          transport: 'http',
          env: { VAR_A: 'a', VAR_B: 'b' },
          headers: { 'x-a': '1', 'x-b': '2' },
          nested: { deep: { deeper: { array: [1, 2, { k: 'v' }] } } },
        },
      },
    }
    await ports.vault.writeFile(ROOT_FILE, JSON.stringify(src, null, 4))

    const out = await makeService(ports).runOnce()
    expect(out).toBe('success')

    const written = JSON.parse(await ports.vault.readFile(TARGET_FILE)) as unknown
    expect(written).toEqual(src)
  })

  it('REQ-MHP-028 + NFR-MHP-013 + EC-MHP-019 — verify-mismatch keeps root, surfaces sticky error, deletes partial target', async () => {
    const src = { mcpServers: { specorator: { url: 'http://127.0.0.1:0/mcp' } } }
    await ports.vault.writeFile(ROOT_FILE, JSON.stringify(src))

    // Tamper with the read-back so deep-equal fails. The simplest way is to
    // intercept readFile for the target so it returns a different value than
    // what was written, simulating filesystem corruption.
    const originalRead = ports.bridge.readFile.bind(ports.bridge)
    ports.bridge.readFile = async (path: string): Promise<string> => {
      if (path === TARGET_FILE) return JSON.stringify({ mcpServers: {} }) // mismatch
      return originalRead(path)
    }

    const out = await makeService(ports).runOnce()
    expect(out).toBe('failed')

    // Root preserved (NFR-MHP-013 invariant).
    expect(await ports.vault.fileExists(ROOT_FILE)).toBe(true)
    // Partial target was deleted (EC-MHP-019).
    expect(await ports.vault.fileExists(TARGET_FILE)).toBe(false)
    // Sticky error notice fired.
    const sticky = ports.bridge.notices.filter((n) => n.severity === 'error')
    expect(sticky.length).toBeGreaterThan(0)
  })

  it('REQ-MHP-027 + EC-MHP-041 + TEST-MHP-057 — both files present aborts with conflict notice (S19-extension)', async () => {
    await ports.vault.writeFile(ROOT_FILE, '{"a":1}')
    await ports.vault.writeFile(TARGET_FILE, '{"a":2}')

    const out = await makeService(ports).runOnce()
    expect(out).toBe('failed')

    // Both files left untouched.
    expect(await ports.vault.readFile(ROOT_FILE)).toBe('{"a":1}')
    expect(await ports.vault.readFile(TARGET_FILE)).toBe('{"a":2}')

    // Sticky error notice with verbatim S19-extension copy from SPEC-MHP-038 step 1a.
    const sticky = ports.bridge.notices.filter((n) => n.severity === 'error')
    expect(sticky.length).toBeGreaterThan(0)
    expect(sticky[0].message).toBe(
      'Both .mcp.json and .obsidian/mcp.local.json exist. Resolve manually before reload.',
    )
  })

  it('REQ-MHP-029 — second invocation in the same session is a "noop" (idempotent)', async () => {
    await ports.vault.writeFile(ROOT_FILE, '{"mcpServers":{}}')
    const svc = makeService(ports)

    const first = await svc.runOnce()
    expect(first).toBe('success')

    const second = await svc.runOnce()
    expect(second).toBe('noop')
  })
})
