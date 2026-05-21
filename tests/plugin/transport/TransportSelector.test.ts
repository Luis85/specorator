/**
 * T-MPS-028 — Tests for `selectTransport()` 15-row truth table.
 *
 * Satisfies: REQ-MPS-007, REQ-MPS-008, REQ-MPS-012, REQ-MPS-014.
 * Maps to: TST-MPS-04 (R6), TST-MPS-05 (R7), TST-MPS-06 (R11).
 *
 * SPEC-MPS-001 §4 / design §C4 define the deterministic decision table
 * (first match wins, synchronous, no I/O):
 *
 *   | #   | selection                              | Conditions                                                                         | Resolution |
 *   |-----|----------------------------------------|------------------------------------------------------------------------------------|------------|
 *   | R1  | { forced: 'degraded' }                 | *                                                                                  | degraded   |
 *   | R2  | { provider: 'claude', mode: 'api' }    | claudeApiKeyPresent                                                                | claude/api |
 *   | R3  | { provider: 'claude', mode: 'api' }    | !claudeApiKeyPresent                                                               | degraded   |
 *   | R4  | { provider: 'claude', mode: 'cli' }    | claudeCliResolved                                                                  | claude/cli |
 *   | R5  | { provider: 'claude', mode: 'cli' }    | !claudeCliResolved                                                                 | degraded   |
 *   | R6  | { provider: 'cursor', mode: 'api' }    | secretStoreAvailable && cursorApiKeyPresent && cursorApiPreviewEnabled             | cursor/api |
 *   | R7  | { provider: 'cursor', mode: 'api' }    | otherwise                                                                          | degraded   |
 *   | R8  | { provider: 'cursor', mode: 'cli' }    | cursorCliResolved                                                                  | cursor/cli |
 *   | R9  | { provider: 'cursor', mode: 'cli' }    | !cursorCliResolved                                                                 | degraded   |
 *   | R10 | { forced: 'auto' }                     | claudeApiKeyPresent && autoPreferProvider === 'claude'                             | claude/api |
 *   | R11 | { forced: 'auto' }                     | cursorApiKeyPresent && cursorApiPreviewEnabled && autoPreferProvider === 'cursor'  | cursor/api |
 *   | R12 | { forced: 'auto' }                     | claudeApiKeyPresent                                                                | claude/api |
 *   | R13 | { forced: 'auto' }                     | claudeCliResolved                                                                  | claude/cli |
 *   | R14 | { forced: 'auto' }                     | cursorCliResolved                                                                  | cursor/cli |
 *   | R15 | { forced: 'auto' }                     | otherwise                                                                          | degraded   |
 *
 * Per spec §4 the selector is synchronous and performs no I/O. All
 * `availability.*` fields are consumed as plain booleans — the selector
 * must never call `.isAvailable()` on a candidate port nor reach into
 * `SecretStorePort` (which is async).
 */
import { describe, it, expect } from 'vitest'

import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import type { ChatTransportPort } from '@/domain/ports/ChatTransportPort'
import type {
  ProviderId,
  ProviderSelection,
} from '@/domain/chat/ProviderSelection'

import {
  selectTransport,
  type ProviderRouterDeps,
  type TransportResolution,
} from '@/plugin/transport/TransportSelector'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/**
 * Hand-rolled mock `ChatTransportPort`. Any method call during selection would
 * indicate the selector performed I/O (forbidden by spec §4).
 */
function makeMockPort(label: string): ChatTransportPort {
  return {
    isAvailable: () => {
      throw new Error(
        `mock port "${label}" .isAvailable() must not be called by selectTransport`,
      )
    },
    queryStream: () => {
      throw new Error(
        `mock port "${label}" .queryStream() must not be called by selectTransport`,
      )
    },
  }
}

interface MakeDepsOverrides {
  readonly autoPreferProvider?: ProviderId
  readonly claudeApiKeyPresent?: boolean
  readonly claudeCliResolved?: boolean
  readonly cursorApiKeyPresent?: boolean
  readonly cursorCliResolved?: boolean
  readonly cursorApiPreviewEnabled?: boolean
  readonly secretStoreAvailable?: boolean
}

interface MakeDepsResult {
  readonly deps: ProviderRouterDeps
  readonly claudeApi: ChatTransportPort
  readonly claudeCli: ChatTransportPort
  readonly cursorApi: ChatTransportPort
  readonly cursorCli: ChatTransportPort
  readonly degraded: ChatTransportPort
}

function makeDeps(overrides: MakeDepsOverrides = {}): MakeDepsResult {
  const claudeApi = makeMockPort('claude.api')
  const claudeCli = makeMockPort('claude.cli')
  const cursorApi = makeMockPort('cursor.api')
  const cursorCli = makeMockPort('cursor.cli')
  const degraded = degradedClaudeCliPort
  const deps: ProviderRouterDeps = {
    providers: {
      claude: { api: claudeApi, cli: claudeCli },
      cursor: { api: cursorApi, cli: cursorCli },
    },
    degradedPort: degraded,
    availability: {
      claudeApiKeyPresent: overrides.claudeApiKeyPresent ?? false,
      claudeCliResolved: overrides.claudeCliResolved ?? false,
      cursorApiKeyPresent: overrides.cursorApiKeyPresent ?? false,
      cursorCliResolved: overrides.cursorCliResolved ?? false,
      cursorApiPreviewEnabled: overrides.cursorApiPreviewEnabled ?? false,
      secretStoreAvailable: overrides.secretStoreAvailable ?? false,
    },
    autoPreferProvider: overrides.autoPreferProvider ?? 'claude',
  }
  return { deps, claudeApi, claudeCli, cursorApi, cursorCli, degraded }
}

// -----------------------------------------------------------------------------
// Truth-table rows R1–R15 (design §C4 / spec §4)
// -----------------------------------------------------------------------------

describe('selectTransport() — SPEC-MPS-001 §4 / design §C4 15-row truth table', () => {
  it("R1 — { forced: 'degraded' } → degraded (overrides all availability)", () => {
    const { deps, degraded } = makeDeps({
      claudeApiKeyPresent: true,
      claudeCliResolved: true,
      cursorApiKeyPresent: true,
      cursorCliResolved: true,
      cursorApiPreviewEnabled: true,
      secretStoreAvailable: true,
    })
    const selection: ProviderSelection = { forced: 'degraded' }

    const result: TransportResolution = selectTransport(selection, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R2 — claude/api + claudeApiKeyPresent → claude/api", () => {
    const { deps, claudeApi } = makeDeps({ claudeApiKeyPresent: true })
    const result = selectTransport({ provider: 'claude', mode: 'api' }, deps)

    expect(result.resolved).toEqual({ provider: 'claude', mode: 'api' })
    expect(result.port).toBe(claudeApi)
  })

  it("R3 — claude/api + !claudeApiKeyPresent → degraded", () => {
    const { deps, degraded } = makeDeps({ claudeApiKeyPresent: false })
    const result = selectTransport({ provider: 'claude', mode: 'api' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R4 — claude/cli + claudeCliResolved → claude/cli", () => {
    const { deps, claudeCli } = makeDeps({ claudeCliResolved: true })
    const result = selectTransport({ provider: 'claude', mode: 'cli' }, deps)

    expect(result.resolved).toEqual({ provider: 'claude', mode: 'cli' })
    expect(result.port).toBe(claudeCli)
  })

  it("R5 — claude/cli + !claudeCliResolved → degraded", () => {
    const { deps, degraded } = makeDeps({ claudeCliResolved: false })
    const result = selectTransport({ provider: 'claude', mode: 'cli' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R6 — cursor/api + secretStore && cursorApiKey && cursorApiPreview → cursor/api (TST-MPS-04)", () => {
    const { deps, cursorApi } = makeDeps({
      secretStoreAvailable: true,
      cursorApiKeyPresent: true,
      cursorApiPreviewEnabled: true,
    })
    const result = selectTransport({ provider: 'cursor', mode: 'api' }, deps)

    expect(result.resolved).toEqual({ provider: 'cursor', mode: 'api' })
    expect(result.port).toBe(cursorApi)
  })

  it("R7 — cursor/api + !secretStoreAvailable → degraded (TST-MPS-05)", () => {
    const { deps, degraded } = makeDeps({
      secretStoreAvailable: false,
      cursorApiKeyPresent: true,
      cursorApiPreviewEnabled: true,
    })
    const result = selectTransport({ provider: 'cursor', mode: 'api' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R7 — cursor/api + !cursorApiKeyPresent → degraded", () => {
    const { deps, degraded } = makeDeps({
      secretStoreAvailable: true,
      cursorApiKeyPresent: false,
      cursorApiPreviewEnabled: true,
    })
    const result = selectTransport({ provider: 'cursor', mode: 'api' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R7 — cursor/api + !cursorApiPreviewEnabled → degraded", () => {
    const { deps, degraded } = makeDeps({
      secretStoreAvailable: true,
      cursorApiKeyPresent: true,
      cursorApiPreviewEnabled: false,
    })
    const result = selectTransport({ provider: 'cursor', mode: 'api' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R8 — cursor/cli + cursorCliResolved → cursor/cli", () => {
    const { deps, cursorCli } = makeDeps({ cursorCliResolved: true })
    const result = selectTransport({ provider: 'cursor', mode: 'cli' }, deps)

    expect(result.resolved).toEqual({ provider: 'cursor', mode: 'cli' })
    expect(result.port).toBe(cursorCli)
  })

  it("R9 — cursor/cli + !cursorCliResolved → degraded", () => {
    const { deps, degraded } = makeDeps({ cursorCliResolved: false })
    const result = selectTransport({ provider: 'cursor', mode: 'cli' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })

  it("R10 — auto + claudeApiKeyPresent + autoPreferProvider='claude' → claude/api", () => {
    const { deps, claudeApi } = makeDeps({
      autoPreferProvider: 'claude',
      claudeApiKeyPresent: true,
    })
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toEqual({ provider: 'claude', mode: 'api' })
    expect(result.port).toBe(claudeApi)
  })

  it("R11 — auto + cursorApiKeyPresent && cursorApiPreviewEnabled && autoPreferProvider='cursor' → cursor/api (TST-MPS-06)", () => {
    const { deps, cursorApi } = makeDeps({
      autoPreferProvider: 'cursor',
      cursorApiKeyPresent: true,
      cursorApiPreviewEnabled: true,
      // Even with claudeApiKeyPresent we should prefer cursor because R10 only
      // fires for prefer='claude'; R11 wins ahead of R12 when prefer='cursor'.
      claudeApiKeyPresent: true,
      secretStoreAvailable: true,
    })
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toEqual({ provider: 'cursor', mode: 'api' })
    expect(result.port).toBe(cursorApi)
  })

  it("R12 — auto + claudeApiKeyPresent (with prefer='cursor' but no cursor key) → claude/api", () => {
    const { deps, claudeApi } = makeDeps({
      autoPreferProvider: 'cursor',
      claudeApiKeyPresent: true,
      // Cursor side empty so R11 cannot fire — R12 takes precedence over CLI rows.
      cursorApiKeyPresent: false,
      cursorApiPreviewEnabled: false,
      claudeCliResolved: true,
      cursorCliResolved: true,
    })
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toEqual({ provider: 'claude', mode: 'api' })
    expect(result.port).toBe(claudeApi)
  })

  it("R13 — auto + !claudeApiKey + claudeCliResolved → claude/cli", () => {
    const { deps, claudeCli } = makeDeps({
      claudeApiKeyPresent: false,
      claudeCliResolved: true,
      // cursorCliResolved=true must lose to claudeCliResolved because R13 < R14.
      cursorCliResolved: true,
    })
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toEqual({ provider: 'claude', mode: 'cli' })
    expect(result.port).toBe(claudeCli)
  })

  it("R14 — auto + only cursorCliResolved → cursor/cli", () => {
    const { deps, cursorCli } = makeDeps({
      claudeApiKeyPresent: false,
      claudeCliResolved: false,
      cursorCliResolved: true,
    })
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toEqual({ provider: 'cursor', mode: 'cli' })
    expect(result.port).toBe(cursorCli)
  })

  it("R15 — auto + nothing available → degraded", () => {
    const { deps, degraded } = makeDeps({})
    const result = selectTransport({ forced: 'auto' }, deps)

    expect(result.resolved).toBe('degraded')
    expect(result.port).toBe(degraded)
  })
})

// -----------------------------------------------------------------------------
// Purity / no-I/O guards
// -----------------------------------------------------------------------------

describe('selectTransport() purity invariants (SPEC-MPS-001 §4)', () => {
  it('never invokes any method on candidate ports during selection', () => {
    // Mock ports throw on any method call; if selector ever calls one, this
    // assertion fails. Exercise every row group.
    const cases: ReadonlyArray<{
      selection: ProviderSelection
      overrides: MakeDepsOverrides
    }> = [
      { selection: { forced: 'degraded' }, overrides: {} },
      { selection: { provider: 'claude', mode: 'api' }, overrides: { claudeApiKeyPresent: true } },
      { selection: { provider: 'claude', mode: 'api' }, overrides: {} },
      { selection: { provider: 'claude', mode: 'cli' }, overrides: { claudeCliResolved: true } },
      { selection: { provider: 'claude', mode: 'cli' }, overrides: {} },
      {
        selection: { provider: 'cursor', mode: 'api' },
        overrides: { secretStoreAvailable: true, cursorApiKeyPresent: true, cursorApiPreviewEnabled: true },
      },
      { selection: { provider: 'cursor', mode: 'api' }, overrides: {} },
      { selection: { provider: 'cursor', mode: 'cli' }, overrides: { cursorCliResolved: true } },
      { selection: { provider: 'cursor', mode: 'cli' }, overrides: {} },
      { selection: { forced: 'auto' }, overrides: { claudeApiKeyPresent: true, autoPreferProvider: 'claude' } },
      {
        selection: { forced: 'auto' },
        overrides: { autoPreferProvider: 'cursor', cursorApiKeyPresent: true, cursorApiPreviewEnabled: true },
      },
      { selection: { forced: 'auto' }, overrides: { claudeApiKeyPresent: true } },
      { selection: { forced: 'auto' }, overrides: { claudeCliResolved: true } },
      { selection: { forced: 'auto' }, overrides: { cursorCliResolved: true } },
      { selection: { forced: 'auto' }, overrides: {} },
    ]

    for (const c of cases) {
      const { deps } = makeDeps(c.overrides)
      expect(() => selectTransport(c.selection, deps)).not.toThrow()
    }
  })

  it('is deterministic across repeated calls with identical inputs', () => {
    const { deps } = makeDeps({ claudeApiKeyPresent: true })
    const first = selectTransport({ forced: 'auto' }, deps)
    const second = selectTransport({ forced: 'auto' }, deps)

    expect(first.resolved).toEqual(second.resolved)
    expect(first.port).toBe(second.port)
  })
})
