/**
 * T-MHP-080 — `DevToolsToolRegistrar` registration matrix tests
 * (SPEC-MHP-026..033, SPEC-MHP-041; REQ-MHP-016..021, REQ-MHP-043).
 *
 * Drives the contract for the new registrar at
 * `src/infrastructure/obsidian/mcp/DevToolsToolRegistrar.ts`:
 *
 *   - master off → none of the 8 tools register (TEST-MHP-017, TEST-MHP-019)
 *   - master on, per-tool all off → only the 3 low-risk tools register
 *     (TEST-MHP-017 variant)
 *   - master on + per-tool on for a high-risk tool → that tool registers; the
 *     other four high-risk stay absent (TEST-MHP-018)
 *   - master + autoAcceptLowRisk on → low-risk invocations auto-accept;
 *     high-risk always queue pending (TEST-MHP-046)
 *   - `dev:cdp` always queues pending regardless of autoAcceptLowRisk
 *     (TEST-MHP-021)
 *   - every DevTools invocation creates a proposal record AND drives one
 *     audit row via the injected ProposalStore (TEST-MHP-020)
 *   - `refresh(settings)` re-evaluates and unregisters when a tool falls off
 *     the matrix (EC-MHP-025..028)
 *
 * The registrar is intentionally narrow: it accepts a server stub, a
 * `ProposalStore` (extended surface — `tryQueue`), a `settings()` thunk so
 * settings changes propagate without re-wiring, and an optional
 * `mutateFor(toolId, input)` factory the production wire-up supplies (the
 * actual DevTools side-effect closure). The tests supply a no-op mutate so
 * auto-accept paths succeed without a real DevTools binding.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports'
import {
  DevToolsToolRegistrar,
  type DevToolsServer,
} from '@/infrastructure/obsidian/mcp/DevToolsToolRegistrar'
import { ProposalStore, type AuditLogSink } from '@/infrastructure/obsidian/ProposalStore'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type { AuditRow } from '@/domain/mcp/Proposal'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const LOW_RISK_IDS = ['dev:screenshot', 'dev:errors', 'dev:console'] as const
const HIGH_RISK_IDS = [
  'dev:dom',
  'dev:cdp',
  'dev:debug',
  'dev:mobile',
  'devtools',
] as const

interface CapturedTool {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: Record<string, unknown>) => Promise<any>
}

function makeServerStub(): { server: DevToolsServer; registered: CapturedTool[] } {
  const registered: CapturedTool[] = []
  const server: DevToolsServer = {
    tool: (
      name: string,
      schema: unknown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: (input: Record<string, unknown>) => Promise<any>,
    ): (() => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registered.push({ name, schema: schema as any, handler })
      return () => {
        const idx = registered.findIndex((t) => t.name === name)
        if (idx >= 0) registered.splice(idx, 1)
      }
    },
  }
  return { server, registered }
}

function makeAuditLog(): AuditLogSink & { rows: AuditRow[] } {
  const rows: AuditRow[] = []
  return {
    rows,
    append: async (row: AuditRow) => {
      rows.push(row)
      return { ok: true, value: undefined }
    },
  }
}

function settingsWith(overrides: Partial<PluginSettings['devtools']> & {
  requireExplicitAcceptForAllWrites?: boolean
} = {}): PluginSettings {
  const { requireExplicitAcceptForAllWrites = false, ...devtoolsOverrides } = overrides
  return {
    ...DEFAULT_SETTINGS,
    requireExplicitAcceptForAllWrites,
    devtools: {
      ...DEFAULT_SETTINGS.devtools,
      ...devtoolsOverrides,
      tools: {
        ...DEFAULT_SETTINGS.devtools.tools,
        ...(devtoolsOverrides.tools ?? {}),
      },
    },
  }
}

describe('DevToolsToolRegistrar — matrix (SPEC-MHP-026..033, REQ-MHP-016..021/-043)', () => {
  let ports: FakePorts
  let store: ProposalStore
  let auditLog: ReturnType<typeof makeAuditLog>

  beforeEach(() => {
    ports = fakeModulePorts()
    auditLog = makeAuditLog()
    store = new ProposalStore({
      eventBus: new ProposalEventBus({ logger: ports.logger }),
      auditLog,
      logger: ports.logger,
    })
  })

  function makeRegistrar(
    server: DevToolsServer,
    settings: PluginSettings,
  ): DevToolsToolRegistrar {
    return new DevToolsToolRegistrar({
      server,
      store,
      settings: () => settings,
      logger: ports.logger,
      mutateFor: () => async () => undefined,
    })
  }

  // ── REQ-MHP-016 — master gate ───────────────────────────────────────────
  it('REQ-MHP-016 / TEST-MHP-017: master off → none of the 8 DevTools tools register', () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(server, settingsWith())
    reg.refresh()
    expect(registered).toHaveLength(0)
  })

  it('REQ-MHP-018 / TEST-MHP-019: master off + every high-risk per-tool on → none register', () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(
      server,
      settingsWith({
        masterEnabled: false,
        tools: Object.fromEntries(
          HIGH_RISK_IDS.map((id) => [id, { enabled: true }]),
        ) as PluginSettings['devtools']['tools'],
      }),
    )
    reg.refresh()
    expect(registered).toHaveLength(0)
  })

  // ── REQ-MHP-016 — master only ───────────────────────────────────────────
  it('master on + per-tool all off → exactly the 3 low-risk tools register', () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(server, settingsWith({ masterEnabled: true }))
    reg.refresh()
    const names = registered.map((t) => t.name).sort()
    expect(names).toEqual([...LOW_RISK_IDS].sort())
  })

  // ── REQ-MHP-017 — per-tool opt-in ───────────────────────────────────────
  it('REQ-MHP-017 / TEST-MHP-018: master + dev:dom only → low-risk three + dev:dom; other 4 high-risk absent', () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(
      server,
      settingsWith({
        masterEnabled: true,
        tools: {
          ...DEFAULT_SETTINGS.devtools.tools,
          'dev:dom': { enabled: true },
        },
      }),
    )
    reg.refresh()
    const names = registered.map((t) => t.name).sort()
    expect(names).toContain('dev:dom')
    for (const id of LOW_RISK_IDS) expect(names).toContain(id)
    for (const other of HIGH_RISK_IDS) {
      if (other === 'dev:dom') continue
      expect(names).not.toContain(other)
    }
  })

  // ── REQ-MHP-043 — low-risk auto-accept ──────────────────────────────────
  it('REQ-MHP-043 / TEST-MHP-046: autoAcceptLowRisk on → dev:screenshot returns status:accepted', async () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(
      server,
      settingsWith({ masterEnabled: true, autoAcceptLowRisk: true }),
    )
    reg.refresh()
    const tool = registered.find((t) => t.name === 'dev:screenshot')
    expect(tool).toBeDefined()
    const res = await tool!.handler({})
    expect(res.status).toBe('accepted')
    expect(res.proposalId).toBeDefined()
    expect(res.tool).toBe('dev:screenshot')
  })

  it('default (autoAcceptLowRisk off, master on) → dev:screenshot returns status:pending', async () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(server, settingsWith({ masterEnabled: true }))
    reg.refresh()
    const tool = registered.find((t) => t.name === 'dev:screenshot')
    expect(tool).toBeDefined()
    const res = await tool!.handler({})
    expect(res.status).toBe('pending')
  })

  // ── REQ-MHP-020 — dev:cdp always pending ────────────────────────────────
  it('REQ-MHP-020 / TEST-MHP-021: dev:cdp always queues pending even with autoAcceptLowRisk on', async () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(
      server,
      settingsWith({
        masterEnabled: true,
        autoAcceptLowRisk: true,
        tools: {
          ...DEFAULT_SETTINGS.devtools.tools,
          'dev:cdp': { enabled: true },
        },
      }),
    )
    reg.refresh()
    const tool = registered.find((t) => t.name === 'dev:cdp')
    expect(tool).toBeDefined()
    const res = await tool!.handler({ method: 'Runtime.evaluate' })
    expect(res.status).toBe('pending')
  })

  // ── REQ-MHP-019 — proposal + audit row per invocation ───────────────────
  it('REQ-MHP-019 / TEST-MHP-020: every DevTools invocation creates a proposal + audit row', async () => {
    const { server, registered } = makeServerStub()
    const reg = makeRegistrar(
      server,
      settingsWith({ masterEnabled: true, autoAcceptLowRisk: true }),
    )
    reg.refresh()
    const screenshot = registered.find((t) => t.name === 'dev:screenshot')!
    const errors = registered.find((t) => t.name === 'dev:errors')!
    await screenshot.handler({})
    await errors.handler({})
    // Both low-risk calls auto-accept → 2 audit rows recorded.
    expect(auditLog.rows).toHaveLength(2)
    expect(auditLog.rows.every((r) => r.decision.outcome === 'accepted')).toBe(true)
    expect(auditLog.rows.every((r) => r.decision.by === 'auto')).toBe(true)
    expect(auditLog.rows.every((r) => r.decision.rule === 'devtools-low-risk-auto-accept')).toBe(true)
  })

  // ── refresh() — re-evaluates on settings change ─────────────────────────
  it('refresh(): turning the master toggle off unregisters previously-registered tools', () => {
    const { server, registered } = makeServerStub()
    let current = settingsWith({ masterEnabled: true })
    const reg = new DevToolsToolRegistrar({
      server,
      store,
      settings: () => current,
      logger: ports.logger,
      mutateFor: () => async () => undefined,
    })
    reg.refresh()
    expect(registered.length).toBeGreaterThan(0)
    current = settingsWith()
    reg.refresh()
    expect(registered).toHaveLength(0)
  })

  it('refresh(): flipping a per-tool toggle on registers just that tool', () => {
    const { server, registered } = makeServerStub()
    let current = settingsWith({ masterEnabled: true })
    const reg = new DevToolsToolRegistrar({
      server,
      store,
      settings: () => current,
      logger: ports.logger,
      mutateFor: () => async () => undefined,
    })
    reg.refresh()
    expect(registered.some((t) => t.name === 'dev:dom')).toBe(false)
    current = settingsWith({
      masterEnabled: true,
      tools: {
        ...DEFAULT_SETTINGS.devtools.tools,
        'dev:dom': { enabled: true },
      },
    })
    reg.refresh()
    expect(registered.some((t) => t.name === 'dev:dom')).toBe(true)
  })

  // ── REQ-MHP-021 — payloads never enter the audit row ────────────────────
  it('REQ-MHP-021: result payloads do not leak into the audit row', async () => {
    const { server, registered } = makeServerStub()
    const reg = new DevToolsToolRegistrar({
      server,
      store,
      settings: () => settingsWith({ masterEnabled: true, autoAcceptLowRisk: true }),
      logger: ports.logger,
      mutateFor:
        () => async () =>
          // The real screenshot mutate returns base64 PNG; the registrar
          // MUST NOT pipe that into the audit row.
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    })
    reg.refresh()
    const tool = registered.find((t) => t.name === 'dev:screenshot')!
    await tool.handler({})
    expect(auditLog.rows).toHaveLength(1)
    const serialised = JSON.stringify(auditLog.rows[0])
    expect(serialised).not.toContain('iVBORw0KGgo')
  })

  it('uses provided mutateFor when invoking the tool (auto-accept path)', async () => {
    const { server, registered } = makeServerStub()
    const mutateFactory = vi.fn(() => vi.fn(async () => undefined))
    const reg = new DevToolsToolRegistrar({
      server,
      store,
      settings: () => settingsWith({ masterEnabled: true, autoAcceptLowRisk: true }),
      logger: ports.logger,
      mutateFor: mutateFactory,
    })
    reg.refresh()
    const tool = registered.find((t) => t.name === 'dev:screenshot')!
    await tool.handler({})
    expect(mutateFactory).toHaveBeenCalled()
  })
})
