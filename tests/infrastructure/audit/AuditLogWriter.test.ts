/**
 * T-MHP-009 — Proposal data-model + audit-row schema sanity (paired with
 * T-MHP-030 AuditLogWriter contract).
 *
 * NOTE — judgment call: the planner's T-MHP-009 brief is the data-model task
 * (`src/domain/mcp/Proposal.ts`); the user-supplied test path for T-MHP-009
 * is `tests/infrastructure/audit/AuditLogWriter.test.ts`, which aligns with
 * the AuditLogWriter scope. To honour both, this test file exercises:
 *   (a) the domain data model that T-MHP-009 introduces — `ProposalKind`
 *       union has exactly 16 members, `AuditRow` has the 7 top-level fields
 *       at schema=1, `ClientIdentity`/`ProposalDecision` shape;
 *   (b) the AuditLogWriter contract from SPEC-MHP-035 that those data
 *       structures are consumed by — JSONL line format, schema:1 round-trip,
 *       POSIX path normalisation, `.specorator/` folder auto-creation.
 *
 * Satisfies (T-MHP-009 data model): REQ-MHP-022, REQ-MHP-036, REQ-MHP-037,
 * REQ-MHP-040.
 * Adjacent SPEC: SPEC-MHP-035 (AuditLogWriter) and §"Data structures".
 * TEST IDs touched: TEST-MHP-023 (schema:1 round-trip), TEST-MHP-024 (POSIX
 * path normalisation), TEST-MHP-027 (folder auto-create), TEST-MHP-037
 * (16-literal ProposalKind), TEST-MHP-038 (intent echo).
 *
 * TDD: this test MUST fail before `src/domain/mcp/Proposal.ts` and
 * `src/infrastructure/audit/AuditLogWriter.ts` land.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  type AuditRow,
  type ProposalKind,
  type ProposalDecision,
  type ClientIdentity,
} from '@/domain/mcp/Proposal'
import { AuditLogWriter } from '@/infrastructure/audit/AuditLogWriter'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

const CLIENT: ClientIdentity = {
  id: 'cursor',
  transport: 'loopback',
  address: '127.0.0.1:51345',
}

function makeRow(overrides: Partial<AuditRow> = {}): AuditRow {
  const decision: ProposalDecision = {
    outcome: 'accepted',
    by: 'auto',
    rule: 'active-feature-append',
    at: '2026-05-24T12:00:00.000Z',
  }
  return {
    ts: '2026-05-24T12:00:00.000Z',
    schema: 1,
    client: CLIENT,
    tool: 'vault_append_to_note',
    proposal: {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'vault_append_to_note',
      intent: 'draft outline',
      paths: ['specs/x/idea.md'],
    },
    decision,
    result: { ok: true, error: null },
    ...overrides,
  }
}

describe('Proposal domain types (T-MHP-009 / REQ-MHP-036, REQ-MHP-022, REQ-MHP-040)', () => {
  it('TEST-MHP-037 (16-literal acceptance): every documented ProposalKind literal is assignable', () => {
    // Accept-all assertion: each of the 16 literals must be a valid
    // ProposalKind. A literal missing from the union would fail to compile.
    const literals: ProposalKind[] = [
      // 3 vault / CLI write kinds
      'vault_write_note',
      'vault_append_to_note',
      'obsidian_cli_append_note',
      // 5 canvas write kinds
      'canvas_create',
      'canvas_add_text_node',
      'canvas_add_file_node',
      'canvas_add_edge',
      'canvas_update_node',
      // 8 DevTools kinds
      'dev_screenshot',
      'dev_errors',
      'dev_console',
      'dev_dom',
      'dev_cdp',
      'dev_debug',
      'dev_mobile',
      'devtools',
    ]
    expect(literals).toHaveLength(16)
  })

  it('TEST-MHP-037 (rejection arm): a non-listed string is not assignable to ProposalKind at compile time', () => {
    // @ts-expect-error — 'future_unknown' is not in the 16-literal union
    const _bad: ProposalKind = 'future_unknown'
    expect(true).toBe(true)
  })

  it('AuditRow exposes exactly the 7 top-level fields with schema literal = 1', () => {
    const row = makeRow()
    const keys = Object.keys(row).sort()
    expect(keys).toEqual(
      ['client', 'decision', 'proposal', 'result', 'schema', 'tool', 'ts'].sort(),
    )
    expect(row.schema).toBe(1)
    // compile-time: schema literal narrowed to 1
    expectTypeOf<AuditRow['schema']>().toEqualTypeOf<1>()
  })

  it('ProposalDecision.by carries all 4 provenance literals (REQ-MHP-040)', () => {
    const provenance: ProposalDecision['by'][] = ['auto', 'user', 'client', 'shutdown']
    expect(provenance).toHaveLength(4)
  })
})

describe('AuditLogWriter (SPEC-MHP-035 / REQ-MHP-022..026)', () => {
  it('TEST-MHP-023: append serialises the row as one JSON line + LF; round-trips through JSON.parse', async () => {
    const ports = fakeModulePorts()

    const writer = new AuditLogWriter({
      vault: ports.vault,
      logger: ports.logger,
      notify: ports.notifications,
      specoratorFolder: '.specorator',
      maxSizeBytes: 2 * 1024 * 1024,
      maxRotations: 5,
    })

    const row = makeRow()
    const res = await writer.append(row)
    expect(res.ok).toBe(true)

    const written = await ports.vault.readFile('.specorator/mcp-audit.log')
    expect(written.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(written.trimEnd())
    expect(parsed).toEqual(row)
    expect(parsed.schema).toBe(1)
  })

  it('TEST-MHP-027 / REQ-MHP-026: creates .specorator/ folder when absent before first write', async () => {
    const ports = fakeModulePorts()
    expect(await ports.vault.fileExists('.specorator')).toBe(false)

    const writer = new AuditLogWriter({
      vault: ports.vault,
      logger: ports.logger,
      notify: ports.notifications,
      specoratorFolder: '.specorator',
      maxSizeBytes: 2 * 1024 * 1024,
      maxRotations: 5,
    })

    const res = await writer.append(makeRow())
    expect(res.ok).toBe(true)
    expect(await ports.vault.fileExists('.specorator/mcp-audit.log')).toBe(true)
  })

  it('TEST-MHP-024 / REQ-MHP-023 / NFR-MHP-014: backslash paths are not accepted (POSIX-only invariant)', async () => {
    // The audit writer must never accept a row whose paths[*] contains a
    // backslash — per the construction-invariant rule in spec §"Validation
    // rules per field". Path normalisation happens upstream at the write
    // tool registrar; if a bad row reaches the writer, the writer fails
    // closed.
    const ports = fakeModulePorts()
    const writer = new AuditLogWriter({
      vault: ports.vault,
      logger: ports.logger,
      notify: ports.notifications,
      specoratorFolder: '.specorator',
      maxSizeBytes: 2 * 1024 * 1024,
      maxRotations: 5,
    })

    const badRow = makeRow({
      proposal: {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'vault_write_note',
        intent: '',
        paths: ['specs\\x\\idea.md'],
      },
    })

    const res = await writer.append(badRow)
    expect(res.ok).toBe(false)
  })

  it('TEST-MHP-025 / REQ-MHP-024 / NFR-MHP-008: rotates when next append would cross maxSizeBytes', async () => {
    const ports = fakeModulePorts()

    // Tiny size cap so the test does not need to write 2 MiB.
    const writer = new AuditLogWriter({
      vault: ports.vault,
      logger: ports.logger,
      notify: ports.notifications,
      specoratorFolder: '.specorator',
      maxSizeBytes: 512,
      maxRotations: 5,
    })

    // Each row is ~hundreds of bytes; write enough to trigger one rotation.
    for (let i = 0; i < 10; i++) {
      const res = await writer.append(
        makeRow({
          proposal: {
            id: `33333333-3333-4333-8333-3333333333${i.toString().padStart(2, '0')}`,
            kind: 'vault_write_note',
            intent: 'pad'.repeat(20),
            paths: ['specs/x/idea.md'],
          },
        }),
      )
      expect(res.ok).toBe(true)
    }

    // .1 exists after rotation; current .log is < maxSizeBytes.
    expect(await ports.vault.fileExists('.specorator/mcp-audit.log.1')).toBe(true)
    const current = await ports.vault.readFile('.specorator/mcp-audit.log')
    expect(current.length).toBeLessThanOrEqual(512)
  })
})
