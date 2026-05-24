/**
 * T-MHP-075 — Deny-list `tools/list` assertion (REQ-MHP-014, NFR-MHP-004).
 *
 * Owner: qa.
 *
 * Direct assert-by-name: registering the Tier-A reads + the escape hatch must
 * NEVER expose any command from the permanent deny-list as a callable MCP
 * tool. The deny-list is enforced at two layers:
 *
 *   1. Registrar layer — `registerObsidianCliReadTools` only registers the 12
 *      canonical Tier-A tool names (each backed by a vetted CLI sub-command).
 *      None of the deny-list commands are in that set.
 *   2. Escape-hatch layer — `registerEscapeHatchTool` checks the deny-list
 *      first; any deny-list invocation returns `not_allowed` without spawning
 *      the CLI. The escape-hatch handler-level test (T-MHP-073) covers this;
 *      here we add the `tools/list` shape assertion at the registrar surface.
 *
 * Note on ADR-019 §3 carve-out: DevTools tools (e.g. `dev:cdp`) are gated by
 * a separate `DevToolsToolRegistrar` (T-MHP-081) and not part of the
 * permanent deny-list. They are not registered by either of the two
 * registrars exercised here.
 *
 * Satisfies: REQ-MHP-014, NFR-MHP-004; TEST-MHP-015.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports'

import {
  registerObsidianCliReadTools,
  TIER_A_READ_TOOL_NAMES,
  type ReadToolHandler,
} from '@/infrastructure/obsidian/mcp/registerObsidianCliReadTools'
import {
  registerEscapeHatchTool,
} from '@/infrastructure/obsidian/mcp/registerEscapeHatchTool'
import { PERMANENT_DENY_LIST } from '@/infrastructure/obsidian/mcp/denyList'

interface RegisteredTool {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: any
  handler?: ReadToolHandler
}

function makeServerStub(): {
  registered: RegisteredTool[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: { tool: (name: string, schema: any, handler: ReadToolHandler) => void }
} {
  const registered: RegisteredTool[] = []
  return {
    registered,
    server: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool: (name: string, schema: any, handler: ReadToolHandler): void => {
        registered.push({ name, schema, handler })
      },
    },
  }
}

describe('Permanent deny-list (REQ-MHP-014, ADR-019 §2)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('deny-list constant covers every command named in REQ-MHP-014', () => {
    // ADR-019 §2 enumerates the deny-list. This assertion pins the constant
    // so a casual addition or deletion trips the test.
    const expected = [
      'eval',
      'plugin:install',
      'plugin:uninstall',
      'plugin:enable',
      'plugin:disable',
      'plugin:reload',
      'plugins:restrict',
      'theme:install',
      'theme:uninstall',
      'theme:set',
      'snippet:enable',
      'snippet:disable',
      'sync:on',
      'sync:off',
      'publish:add',
      'publish:remove',
      'publish:open',
      'command',
      'restart',
      'reload',
      'vault:open',
      'workspace:load',
      'tab:open',
      'delete',
    ].sort()
    expect([...PERMANENT_DENY_LIST].sort()).toEqual(expected)
  })

  it('no Tier-A read-tool NAME matches any deny-list entry (CLI surface invariant)', () => {
    const { server, registered } = makeServerStub()
    registerObsidianCliReadTools(server, {
      cli: { available: true, binaryPath: '/usr/local/bin/obsidian' },
      logger: ports.logger,
    })
    const names = registered.map((t) => t.name)
    // Tier-A tools use `obsidian_cli_*` prefixed names, never raw CLI sub-command
    // names. The assertion guards against accidentally exporting a deny-list
    // raw name as an MCP tool.
    for (const denied of PERMANENT_DENY_LIST) {
      expect(names).not.toContain(denied)
    }
  })

  it('no Tier-A CLI sub-command (the suffix on `obsidian-cli`) matches any deny-list entry', () => {
    // The CLI command names (suffix on `obsidian-cli`) used by the 12 typed
    // reads must not overlap with deny-list. SPEC-MHP-013..024 enumerates
    // them. We assert the mapping (driven by the test rather than reaching
    // into the registrar internals) does not collide with the deny-list.
    const tierACliCommands = [
      'backlinks',
      'links',
      'unresolved',
      'orphans',
      'deadends',
      'outline',
      'diff',
      'history',
      'templates',
      'template:read',
      'property:read',
      'daily:read',
    ]
    for (const denied of PERMANENT_DENY_LIST) {
      expect(tierACliCommands).not.toContain(denied)
    }
  })

  it('escape hatch handler returns not_allowed for every deny-list command (REQ-MHP-015)', async () => {
    const { server, registered } = makeServerStub()
    const calls: Array<{ cmd: string; args: readonly string[] }> = []
    registerEscapeHatchTool(server, {
      cli: { available: true },
      logger: ports.logger,
      runner: {
        async runJson(command: string, args: readonly string[]): Promise<unknown> {
          calls.push({ cmd: command, args })
          return { ok: true }
        },
      },
    })
    expect(registered).toHaveLength(1)
    const handler = registered[0].handler!
    for (const denied of PERMANENT_DENY_LIST) {
      const result = await handler({ command: denied, args: [] })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('not_allowed')
    }
    // The CLI runner was NEVER spawned for any deny-list entry.
    expect(calls).toEqual([])
  })

  it('combined surface (Tier-A reads + escape hatch) registers only the 13 expected tools', () => {
    const { server, registered } = makeServerStub()
    registerObsidianCliReadTools(server, {
      cli: { available: true, binaryPath: '/usr/local/bin/obsidian' },
      logger: ports.logger,
    })
    registerEscapeHatchTool(server, {
      cli: { available: true },
      logger: ports.logger,
    })
    const names = registered.map((t) => t.name).sort()
    const expected = [...TIER_A_READ_TOOL_NAMES, 'obsidian_cli_read_command'].sort()
    expect(names).toEqual(expected)
    expect(names).toHaveLength(13)
    // No deny-list raw-CLI name leaks into the registered set.
    for (const denied of PERMANENT_DENY_LIST) {
      expect(names).not.toContain(denied)
    }
  })

  it('ADR-019 §3 carve-out — `dev:cdp` is NOT in the permanent deny-list (DevTools opt-in surface owns it)', () => {
    // CLAR-MHP-004: DevTools tools (including `dev:cdp`) can be enabled by
    // the user per-tool. They live behind `DevToolsToolRegistrar` and are
    // intentionally outside this deny-list.
    expect(PERMANENT_DENY_LIST).not.toContain('dev:cdp')
    expect(PERMANENT_DENY_LIST).not.toContain('dev:dom')
    expect(PERMANENT_DENY_LIST).not.toContain('dev:debug')
    expect(PERMANENT_DENY_LIST).not.toContain('dev:mobile')
    expect(PERMANENT_DENY_LIST).not.toContain('devtools')
  })
})
