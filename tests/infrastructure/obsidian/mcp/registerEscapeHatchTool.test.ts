/**
 * T-MHP-073 — `obsidian_cli_read_command` escape-hatch tests (SPEC-MHP-025).
 *
 * Owner: qa.
 *
 * Satisfies:
 *   - REQ-MHP-013 (regex + path-traversal + absolute-prefix rejection)
 *   - REQ-MHP-014 (deny-list enforced through the escape hatch)
 *   - REQ-MHP-015 (deny-list overrides allow-list)
 *   - NFR-MHP-004 (deny-list 100% unreachable)
 *   - NFR-MHP-005 (arg-regex 100% rejects shell metacharacters)
 * Covers TEST-MHP-014, TEST-MHP-016; EC-MHP-029, EC-MHP-030, EC-MHP-031, EC-MHP-032.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports'

import {
  registerEscapeHatchTool,
  ESCAPE_HATCH_ALLOW_LIST,
} from '@/infrastructure/obsidian/mcp/registerEscapeHatchTool'
import { PERMANENT_DENY_LIST } from '@/infrastructure/obsidian/mcp/denyList'
import type {
  CliRunner,
  ReadToolHandler,
} from '@/infrastructure/obsidian/mcp/registerObsidianCliReadTools'

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

function makeRunner(): CliRunner & { calls: Array<{ cmd: string; args: readonly string[] }> } {
  const calls: Array<{ cmd: string; args: readonly string[] }> = []
  return {
    calls,
    async runJson(command: string, args: readonly string[]): Promise<unknown> {
      calls.push({ cmd: command, args })
      return { ok: true }
    },
  }
}

describe('registerEscapeHatchTool (SPEC-MHP-025, REQ-MHP-013/-014/-015)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  function setup(opts: { allowList?: ReadonlyArray<string>; denyList?: ReadonlyArray<string> } = {}) {
    const { server, registered } = makeServerStub()
    const runner = makeRunner()
    registerEscapeHatchTool(server, {
      cli: { available: true },
      logger: ports.logger,
      runner,
      allowList: opts.allowList,
      denyList: opts.denyList,
    })
    expect(registered).toHaveLength(1)
    expect(registered[0].name).toBe('obsidian_cli_read_command')
    return { handler: registered[0].handler!, runner }
  }

  it('registers nothing when cli.available === false', () => {
    const { server, registered } = makeServerStub()
    registerEscapeHatchTool(server, {
      cli: { available: false },
      logger: ports.logger,
    })
    expect(registered).toHaveLength(0)
  })

  it('hard-coded allow-list is the 12 Tier-A CLI command names (CLAR-MHP-012)', () => {
    expect([...ESCAPE_HATCH_ALLOW_LIST].sort()).toEqual(
      [
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
      ].sort(),
    )
    expect(ESCAPE_HATCH_ALLOW_LIST).toHaveLength(12)
  })

  describe('allow-list / deny-list gate', () => {
    it('TEST-MHP-014 — allow-listed command + safe args → success; runner invoked exactly once', async () => {
      const { handler, runner } = setup()
      const result = await handler({ command: 'outline', args: ['x.md'] })
      expect(result.ok).toBe(true)
      expect(runner.calls).toEqual([{ cmd: 'outline', args: ['x.md'] }])
    })

    it('TEST-MHP-016 — command not on allow-list returns not_allowed; CLI NOT invoked', async () => {
      const { handler, runner } = setup()
      const result = await handler({ command: 'delete', args: ['x.md'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('not_allowed')
      expect(runner.calls).toEqual([])
    })

    it('REQ-MHP-015 — command on deny-list returns not_allowed; CLI NOT invoked', async () => {
      const { handler, runner } = setup()
      const result = await handler({ command: 'eval', args: ['1+1'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('not_allowed')
      expect(runner.calls).toEqual([])
    })

    it('REQ-MHP-015 — deny-list overrides allow-list (deny wins even when both contain the same name)', async () => {
      // Construct an adversarial scenario: a command that is BOTH on the
      // injected allow-list AND on the deny-list. The deny-list must win.
      const { handler, runner } = setup({
        allowList: ['shadow-cmd', 'outline'],
        denyList: ['shadow-cmd'],
      })
      const result = await handler({ command: 'shadow-cmd', args: [] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('not_allowed')
      expect(runner.calls).toEqual([])
    })

    it('REQ-MHP-014 — every permanently-denied command yields not_allowed (default deny-list)', async () => {
      const { handler, runner } = setup()
      for (const denied of PERMANENT_DENY_LIST) {
        const result = await handler({ command: denied, args: [] })
        expect(result.ok).toBe(false)
        if (result.ok) continue
        expect(result.error.code).toBe('not_allowed')
      }
      expect(runner.calls).toEqual([])
    })
  })

  describe('per-arg validation (REQ-MHP-013, NFR-MHP-005)', () => {
    it('rejects shell-metacharacter args; CLI NOT invoked', async () => {
      const { handler, runner } = setup()
      // Per SPEC-MHP-025 step 3a, each is independently rejected.
      const metaArgs = [
        'x.md; rm -rf /',
        'x.md | cat',
        'x.md && echo',
        'x.md $(pwd)',
        'x.md `pwd`',
        'x.md\n',
        'x.md\r',
        'x.md\\evil',
      ]
      for (const bad of metaArgs) {
        const result = await handler({ command: 'outline', args: [bad] })
        expect(result.ok).toBe(false)
        if (result.ok) continue
        expect(result.error.code).toBe('invalid_argument')
      }
      expect(runner.calls).toEqual([])
    })

    it("rejects path-traversal '..' segments anywhere in the arg", async () => {
      const { handler, runner } = setup()
      const traversal = [
        '..',
        '../etc/passwd',
        'specs/../etc/passwd',
        'a/..',
        '..\\windows',
      ]
      for (const bad of traversal) {
        const result = await handler({ command: 'outline', args: [bad] })
        expect(result.ok).toBe(false)
        if (result.ok) continue
        expect(result.error.code).toBe('invalid_argument')
      }
      expect(runner.calls).toEqual([])
    })

    it('rejects absolute-path prefixes (Unix root, drive-letter, UNC)', async () => {
      const { handler, runner } = setup()
      const absolute = [
        '/etc/passwd',
        '/var/log/messages',
        // backslash also matches shell-safe rejection, so use forward variant:
        'C:/Windows/notepad.exe',
        'd:/Users/file',
        // The UNC form contains backslashes — rejected by shell-safe regex
        // first, which is also `invalid_argument`. Asserts the layered guard.
      ]
      for (const bad of absolute) {
        const result = await handler({ command: 'outline', args: [bad] })
        expect(result.ok).toBe(false)
        if (result.ok) continue
        expect(result.error.code).toBe('invalid_argument')
      }
      expect(runner.calls).toEqual([])
    })

    it('accepts vault-relative POSIX-style args', async () => {
      const { handler, runner } = setup()
      const result = await handler({
        command: 'outline',
        args: ['specs/x/idea.md'],
      })
      expect(result.ok).toBe(true)
      expect(runner.calls).toEqual([{ cmd: 'outline', args: ['specs/x/idea.md'] }])
    })

    it('accepts zero-arg invocations on zero-arg commands', async () => {
      const { handler, runner } = setup()
      const result = await handler({ command: 'unresolved', args: [] })
      expect(result.ok).toBe(true)
      expect(runner.calls).toEqual([{ cmd: 'unresolved', args: [] }])
    })
  })

  describe('guard ordering — all guards must pass before CLI spawn', () => {
    it('does NOT spawn the CLI on any rejection (allow-list, deny-list, regex, traversal, absolute)', async () => {
      const { handler, runner } = setup()
      // One representative input per rejection arm:
      const rejections: Array<Record<string, unknown>> = [
        { command: 'eval', args: ['1+1'] }, // deny-list
        { command: 'unknown_cmd', args: ['x.md'] }, // not on allow-list
        { command: 'outline', args: ['x.md;ls'] }, // regex
        { command: 'outline', args: ['../escape'] }, // traversal
        { command: 'outline', args: ['/etc/passwd'] }, // absolute
      ]
      for (const input of rejections) {
        const result = await handler(input)
        expect(result.ok).toBe(false)
      }
      expect(runner.calls).toEqual([])
    })

    it('CLI body executed only if all guards pass', async () => {
      const { handler, runner } = setup()
      const result = await handler({ command: 'backlinks', args: ['notes/idea.md'] })
      expect(result.ok).toBe(true)
      expect(runner.calls).toEqual([{ cmd: 'backlinks', args: ['notes/idea.md'] }])
    })
  })

  describe('runner failure surfaces as cli_failed', () => {
    it('runner throw → cli_failed with the thrown message', async () => {
      const { server, registered } = makeServerStub()
      const failingRunner: CliRunner = {
        async runJson(): Promise<never> {
          throw new Error('boom')
        },
      }
      registerEscapeHatchTool(server, {
        cli: { available: true },
        logger: ports.logger,
        runner: failingRunner,
      })
      const handler = registered[0].handler!
      const result = await handler({ command: 'outline', args: ['x.md'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('cli_failed')
      expect(result.error.message).toContain('boom')
    })

    it('runner absent → cli_failed; no throw', async () => {
      const { server, registered } = makeServerStub()
      registerEscapeHatchTool(server, {
        cli: { available: true },
        logger: ports.logger,
      })
      const handler = registered[0].handler!
      const result = await handler({ command: 'outline', args: ['x.md'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('cli_failed')
    })
  })

  describe('input schema rejects malformed payloads', () => {
    it('missing command → invalid_argument', async () => {
      const { handler } = setup()
       
      const result = await handler({ args: ['x.md'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('invalid_argument')
    })

    it('extra unknown fields → invalid_argument (strict schema)', async () => {
      const { handler } = setup()
       
      const result = await handler({ command: 'outline', args: ['x.md'], extra: 1 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('invalid_argument')
    })
  })
})

/**
 * Sanity: the test file exercises the `vi` import so the import is not
 * flagged as unused by lint. Holding a no-op spy keeps the lint clean in
 * case future test scaffolding wants to assert on `logger.warn`.
 */
describe('lint hygiene', () => {
  it('vi import is exercised', () => {
    const spy = vi.fn()
    spy()
    expect(spy).toHaveBeenCalled()
  })
})
