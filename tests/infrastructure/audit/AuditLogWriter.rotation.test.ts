/**
 * T-MHP-030 — AuditLogWriter rotation contract test (FAILING-FIRST, TDD).
 *
 * Owner: qa.  Drives the rotation contract in SPEC-MHP-035 against the
 * not-yet-implemented `AuditLogWriter` at
 * `src/infrastructure/obsidian/audit/AuditLogWriter.ts`.
 *
 * Satisfies:
 *   - REQ-MHP-022 (JSONL schema v1 row-on-line + LF + UTF-8)
 *   - REQ-MHP-023 (vault-relative POSIX paths in row payload)
 *   - REQ-MHP-024 (size-based rotation at 2 MiB × 5 files)
 *   - REQ-MHP-025 (filesystem failure surfaces via LoggerPort + NotificationPort)
 *   - REQ-MHP-026 (.specorator/ folder created on first append)
 *   - NFR-MHP-008 (max 5 rotated files retained; oldest deleted)
 *   - NFR-MHP-014 (POSIX path normalisation in audit payload)
 * Covers TEST-MHP-023, TEST-MHP-024, TEST-MHP-025, TEST-MHP-026, TEST-MHP-027.
 *
 * Scope: this file extends the T-MHP-009 data-model tests with rotation +
 * folder-creation + POSIX-normalisation assertions per SPEC-MHP-035 steps
 * 3..8.  The exhaustive 7-field-shape assertions live in
 * tests/infrastructure/obsidian/audit/AuditLogWriter.test.ts (also drafted
 * by T-MHP-030); this file is the rotation slice the user prompt scopes.
 *
 * TDD invariant: imports `AuditLogWriter` from the unimplemented module.
 * Vitest will fail at module resolution until T-MHP-031 lands. That is the
 * expected initial failure mode.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { AuditRow } from '@/domain/mcp/Proposal'
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'
// NOTE: this import resolves the module added by T-MHP-031 per SPEC-MHP-035.
import { AuditLogWriter } from '@/infrastructure/obsidian/audit/AuditLogWriter'

const SPECORATOR_FOLDER = '.specorator'
const AUDIT_LOG = `${SPECORATOR_FOLDER}/mcp-audit.log`
const TWO_MIB = 2 * 1024 * 1024

function makeRow(idx: number, paths: string[] = ['specs/x/idea.md']): AuditRow {
  return {
    ts: `2026-05-24T00:00:00.${String(idx).padStart(3, '0')}Z`,
    schema: 1 as const,
    client: { id: 'test-client', transport: 'loopback' as const, address: '127.0.0.1:0' },
    tool: 'vault_write_note',
    proposal: { id: `prop-${idx}`, kind: 'vault_write_note', intent: '', paths },
    decision: { outcome: 'accepted' as const, by: 'user' as const, rule: '', at: `2026-05-24T00:00:00.${String(idx).padStart(3, '0')}Z` },
    result: { ok: true, error: null },
  }
}

function makeWriter(ports: FakePorts): InstanceType<typeof AuditLogWriter> {
  // SPEC-MHP-035 ctor: { vault, logger, notify, specoratorFolder, maxSizeBytes, maxRotations }
  return new AuditLogWriter({
    vault: ports.vault,
    logger: ports.logger,
    notify: ports.notifications,
    specoratorFolder: SPECORATOR_FOLDER,
    maxSizeBytes: TWO_MIB,
    maxRotations: 5,
  })
}

describe('AuditLogWriter — rotation + folder-creation + POSIX paths (SPEC-MHP-035)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('REQ-MHP-026 — creates .specorator/ on first append when the folder is absent', async () => {
    // Sanity: folder absent at start.
    expect(await ports.vault.fileExists(AUDIT_LOG)).toBe(false)
    const writer = makeWriter(ports)
    const res = await writer.append(makeRow(1))
    expect(res.ok).toBe(true)
    // Folder + file now present.
    const folders = await ports.vault.listFolders('')
    expect(folders).toContain(SPECORATOR_FOLDER)
    expect(await ports.vault.fileExists(AUDIT_LOG)).toBe(true)
  })

  it('REQ-MHP-022 — serialises each row as `JSON.stringify(row) + "\\n"` (LF, UTF-8)', async () => {
    const writer = makeWriter(ports)
    const r1 = makeRow(1)
    const r2 = makeRow(2)
    await writer.append(r1)
    await writer.append(r2)
    const text = await ports.vault.readFile(AUDIT_LOG)
    // One row per line, LF terminator, no CR, ends with LF.
    expect(text.endsWith('\n')).toBe(true)
    expect(text.includes('\r')).toBe(false)
    const lines = text.split('\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toEqual(r1)
    expect(JSON.parse(lines[1])).toEqual(r2)
  })

  it('REQ-MHP-023 + NFR-MHP-014 — normalises Windows-style paths to POSIX in the persisted row', async () => {
    const writer = makeWriter(ports)
    // Caller hands a backslash path; writer must persist with forward slashes.
    await writer.append(makeRow(1, ['specs\\x\\idea.md']))
    const text = await ports.vault.readFile(AUDIT_LOG)
    const persisted = JSON.parse(text.trim()) as { proposal: { paths: string[] } }
    expect(persisted.proposal.paths).toEqual(['specs/x/idea.md'])
    expect(text).not.toContain('\\')
  })

  it('REQ-MHP-024 + NFR-MHP-008 — rotates at 2 MiB: `.log` → `.log.1`, fresh `.log` < 2 MiB', async () => {
    const writer = makeWriter(ports)
    // Pre-seed the active log just under the limit with one giant row that
    // exceeds maxSize when the next append is added.
    const padding = 'x'.repeat(TWO_MIB - 200) // leaves slack < smallest row
    await ports.vault.writeFile(AUDIT_LOG, padding)
    // Sanity: file is sized close to the cap.
    const before = (await ports.vault.readFile(AUDIT_LOG)).length
    expect(before).toBeGreaterThan(TWO_MIB - 1024)

    await writer.append(makeRow(99))

    // `.log.1` now contains the pre-rotation content.
    expect(await ports.vault.fileExists(`${AUDIT_LOG}.1`)).toBe(true)
    const rotated = await ports.vault.readFile(`${AUDIT_LOG}.1`)
    expect(rotated.length).toBeGreaterThan(TWO_MIB - 1024)
    // Fresh `.log` contains only the new row and is well under cap.
    const fresh = await ports.vault.readFile(AUDIT_LOG)
    expect(fresh.length).toBeLessThan(TWO_MIB)
    expect(fresh.trim().length).toBeGreaterThan(0)
    expect(() => JSON.parse(fresh.trim())).not.toThrow()
  })

  it('NFR-MHP-008 — keeps at most 5 rotations: `.log.5` is deleted before the shift', async () => {
    const writer = makeWriter(ports)
    // Pre-seed `.log.1` .. `.log.5` with marker content and the active log
    // sized to trigger rotation on next append.
    for (let i = 1; i <= 5; i++) {
      await ports.vault.writeFile(`${AUDIT_LOG}.${i}`, `marker-${i}`)
    }
    const padding = 'y'.repeat(TWO_MIB - 200)
    await ports.vault.writeFile(AUDIT_LOG, padding)

    await writer.append(makeRow(1))

    // After rotation: prior `.5` is gone (replaced by prior `.4`), `.6` never exists.
    expect(await ports.vault.fileExists(`${AUDIT_LOG}.6`)).toBe(false)
    // Highest rotation slot still has marker shifted up — `.5` now holds what `.4` had.
    const top = await ports.vault.readFile(`${AUDIT_LOG}.5`)
    expect(top).toBe('marker-4')
    // `.1` holds the just-rotated active log.
    const newest = await ports.vault.readFile(`${AUDIT_LOG}.1`)
    expect(newest.length).toBeGreaterThan(TWO_MIB - 1024)
  })

  it('REQ-MHP-025 — filesystem write failure routes through LoggerPort.error + NotificationPort.showError', async () => {
    // Force the underlying vault write to fail.
    const writer = makeWriter(ports)
    // Monkey-patch the bridge's writeFile to reject on the audit log path.
    const original = ports.bridge.writeFile.bind(ports.bridge)
    ports.bridge.writeFile = async (path: string, content: string): Promise<void> => {
      if (path.startsWith(SPECORATOR_FOLDER)) throw new Error('EROFS: read-only filesystem')
      return original(path, content)
    }

    const res = await writer.append(makeRow(1))

    expect(res.ok).toBe(false)
    // LoggerPort + NotificationPort both consulted.
    expect(ports.logger.error).toHaveBeenCalled()
    const sticky = ports.bridge.notices.filter((n) => n.severity === 'error')
    expect(sticky.length).toBeGreaterThan(0)
    // Surface copy mentions the audit log and that the vault mutation completed.
    expect(sticky[0].message.toLowerCase()).toContain('audit')
  })
})
