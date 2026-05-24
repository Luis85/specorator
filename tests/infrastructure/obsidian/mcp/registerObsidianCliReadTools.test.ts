/**
 * T-MHP-070 — `registerObsidianCliReadTools` conditional-registration test
 * (FAILING-FIRST, TDD).
 *
 * Owner: qa.  Drives the contract for the new Tier-A read registrar at
 * `src/infrastructure/obsidian/mcp/registerObsidianCliReadTools.ts`
 * declared in SPEC-MHP-013..024 (12 tools).
 *
 * Satisfies:
 *   - REQ-MHP-011 (register exactly 12 Tier-A read tools when CLI is available)
 *   - REQ-MHP-012 (Tier-A reads never enqueue a proposal; never write audit row)
 *   - NFR-MHP-003 (registration is conditional on `cli.available`)
 * Covers TEST-MHP-012, TEST-MHP-013.
 *
 * Scope (per user prompt for this slice): asserts the 12 canonical tool
 * names are registered when the CLI port reports available, and zero are
 * registered when unavailable.  Per-tool input validation + spawn discipline
 * + `cli_failed` semantics live in the per-read-tool files under
 * `tests/infrastructure/obsidian/mcp/reads/` (also drafted under T-MHP-070).
 *
 * TDD invariant: imports the unimplemented registrar module.  Vitest will
 * fail at module resolution until T-MHP-072 lands.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports'

// @ts-expect-error — production module does not exist yet (T-MHP-072 will add it).
import { registerObsidianCliReadTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliReadTools'

const TIER_A_TOOL_NAMES = [
  'obsidian_cli_backlinks',
  'obsidian_cli_links',
  'obsidian_cli_unresolved',
  'obsidian_cli_orphans',
  'obsidian_cli_deadends',
  'obsidian_cli_outline',
  'obsidian_cli_diff',
  'obsidian_cli_history',
  'obsidian_cli_templates',
  'obsidian_cli_template_read',
  'obsidian_cli_property_read',
  'obsidian_cli_daily_read',
] as const

interface RegisteredTool {
  name: string
  // The shape of the registered tool descriptor is implementation-defined;
  // the registrar only needs to expose a callable name → handler/schema map.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler?: any
}

/**
 * Minimal MCP-server stub exposing `tool(name, schema, handler)` per the
 * existing registrar convention used by the live Specorator registrars
 * (registerWorkflowTools / registerCanvasTools / etc).  This stub captures
 * every registration call for assertion.
 */
function makeMcpServerStub(): {
  registered: RegisteredTool[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: { tool: (name: string, schema: any, handler: any) => void }
} {
  const registered: RegisteredTool[] = []
  return {
    registered,
    server: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool: (name: string, schema: any, handler: any): void => {
        registered.push({ name, schema, handler })
      },
    },
  }
}

describe('registerObsidianCliReadTools — conditional registration (SPEC-MHP-013..024)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('REQ-MHP-011 — registers all 12 canonical Tier-A tool names when cli.available === true', () => {
    const { server, registered } = makeMcpServerStub()
    registerObsidianCliReadTools(server, {
      cli: { available: true, binaryPath: '/usr/local/bin/obsidian' },
      logger: ports.logger,
    })
    const names = registered.map((t) => t.name).sort()
    expect(names).toEqual([...TIER_A_TOOL_NAMES].sort())
    expect(names).toHaveLength(12)
  })

  it('NFR-MHP-003 — registers zero tools when cli.available === false', () => {
    const { server, registered } = makeMcpServerStub()
    registerObsidianCliReadTools(server, {
      cli: { available: false, binaryPath: '' },
      logger: ports.logger,
    })
    expect(registered).toHaveLength(0)
  })

  it('REQ-MHP-012 — registered tools do NOT call ProposalStore.queue (no proposals enqueued)', async () => {
    // ProposalStore is injected (or not) as appropriate; for Tier-A reads it
    // is irrelevant. The registrar contract is: never reference a store.
    // Assert this by passing a poisoned store-substitute and confirming it is
    // never touched by any registered handler invocation path.
    const { server, registered } = makeMcpServerStub()
    const poisoned = {
      queue: (): never => {
        throw new Error('REQ-MHP-012 violated: Tier-A read enqueued a proposal')
      },
    }
    registerObsidianCliReadTools(server, {
      cli: { available: true, binaryPath: '/usr/local/bin/obsidian' },
      logger: ports.logger,
      // Even if a future change wires a store, this guard catches the bug.
      proposalStore: poisoned,
    })

    // Smoke-invoke each handler with minimal valid input; none should throw
    // the poisoned error. CLI subprocess invocation may itself fail in this
    // unit test environment — that's fine; we only care that the store is
    // not consulted. We capture errors and assert none originated from the
    // poison.
    for (const tool of registered) {
      try {
        // Best-effort: pass a tolerant input shape; the handler may reject on
        // validation. We're only verifying the store is never consulted.
        await tool.handler?.({ path: 'specs/x/idea.md', name: 'x', date: '2026-05-24', revA: 'a', revB: 'b' })
      } catch (err) {
        expect((err as Error).message).not.toMatch(/REQ-MHP-012 violated/)
      }
    }
  })
})
