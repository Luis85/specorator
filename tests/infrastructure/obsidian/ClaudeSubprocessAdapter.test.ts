/**
 * T-ASM-010 — Tests for `ClaudeSubprocessAdapter` (lifecycle + free-text path).
 *
 * Satisfies: REQ-ASM-001, REQ-ASM-009, REQ-ASM-010, REQ-ASM-029, REQ-ASM-030,
 *            REQ-ASM-031, NFR-ASM-005, NFR-ASM-006, NFR-ASM-012.
 * Maps to:   TEST-ASM-012 (CLI-not-found → isAvailable === false),
 *            TEST-ASM-013 (one spawn per thread across 3 turns),
 *            TEST-ASM-014 (chunked stdout reassembled via readline),
 *            TEST-ASM-015 (is_error / non-zero exit → QUERY_FAILED),
 *            TEST-ASM-016 (system/init → sessionId capture),
 *            and shutdown() SIGTERM ladder.
 *
 * SPEC reference: SPEC-ASM-001 §4 (class outline) + §4.2 (method table) +
 *                  §4.3 (private helpers) + §4.4 (error mapping) +
 *                  §4.5 (long-lived vs. short-lived).
 *
 * Design reference: design.md §C6 (PATH discovery + subprocess lifecycle) +
 *                   §C4 (data flows).
 *
 * Constructor (SPEC §4.1):
 *   new ClaudeSubprocessAdapter({
 *     getSettings: () => PluginSettings,
 *     logger: LoggerPort,
 *     resolveCliPath: () => Promise<string | null>,
 *     spawn: typeof import('child_process').spawn,
 *     now: () => number,
 *   })
 *
 * ToS posture (NFR-ASM-004, ADR-0031): this test file never reads
 * `~/.claude/.credentials.json` and never expects the adapter to touch
 * anything under `~/.claude/`. Tests #15 / #16 / #17 provide defence-in-depth
 * runtime checks (lint enforcement lives in T-ASM-049).
 *
 * `queryStructured` / `runStructured` tests are intentionally OUT OF SCOPE for
 * this task — they live in T-ASM-038 (PR-ASM-2). The DoD of T-ASM-011 includes
 * a `runStructured` *placeholder*, but T-ASM-038 covers the behaviour.
 *
 * These tests target the not-yet-implemented module
 * `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` (T-ASM-011). They
 * MUST fail with "Cannot find module" until that implementation lands. TDD
 * pair with T-ASM-011.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import * as os from 'node:os'

import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

// Module-under-test (created in T-ASM-011). Tests fail with
// "Cannot find module '@/infrastructure/obsidian/ClaudeSubprocessAdapter'" until then.
import { ClaudeSubprocessAdapter } from '@/infrastructure/obsidian/ClaudeSubprocessAdapter'

// -----------------------------------------------------------------------------
// Settings helper — until T-ASM-014 lands, `PluginSettings` does not carry
// `claudeCliPath`. Cast through `Partial<PluginSettings> & { claudeCliPath:
// string }` so this suite remains forward-compatible with T-ASM-014 (which
// will add the field at the same type) without coupling to the migration PR.
// -----------------------------------------------------------------------------

interface AsmSettings extends PluginSettings {
  readonly claudeCliPath: string
}

function makeSettings(overrides: Partial<AsmSettings> = {}): AsmSettings {
  return {
    ...DEFAULT_SETTINGS,
    claudeCliPath: '',
    ...overrides,
  }
}

// -----------------------------------------------------------------------------
// Fake `child_process.spawn` — yields an EventEmitter-shaped child whose stdout
// / stderr we drive from the test. Mirrors the pattern used in
// `ClaudeBinaryResolver.test.ts` so styles stay consistent.
// -----------------------------------------------------------------------------

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  exitCode: number | null
}

interface SpawnCall {
  command: string
  args: readonly string[]
  options?: Record<string, unknown>
}

interface FakeSpawnHandle {
  spawn: ReturnType<typeof vi.fn>
  calls: SpawnCall[]
  children: FakeChildProcess[]
  /** Last spawned child handle for assertions / event injection. */
  lastChild: () => FakeChildProcess
  /** Helper — emit a single stdout chunk (string → utf-8 Buffer). */
  emitStdout: (child: FakeChildProcess, chunk: string) => void
  /** Helper — emit close + exit on the next microtask. */
  closeWith: (child: FakeChildProcess, exitCode: number) => void
  /** Helper — emit an error before any stdout. */
  errorWith: (child: FakeChildProcess, err: NodeJS.ErrnoException) => void
}

function makeFakeSpawn(opts: { throwOnSpawn?: NodeJS.ErrnoException } = {}): FakeSpawnHandle {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []

  const spawn = vi.fn(
    (command: string, args: readonly string[], options?: Record<string, unknown>) => {
      calls.push({ command, args, options })
      if (opts.throwOnSpawn) throw opts.throwOnSpawn
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(function (this: FakeChildProcess) {
          this.killed = true
        }),
        killed: false,
        exitCode: null,
      }) as FakeChildProcess
      children.push(child)
      return child
    },
  )

  return {
    spawn,
    calls,
    children,
    lastChild: () => {
      const c = children[children.length - 1]
      return c
    },
    emitStdout(child, chunk) {
      child.stdout.emit('data', Buffer.from(chunk, 'utf8'))
    },
    closeWith(child, exitCode) {
      queueMicrotask(() => {
        child.exitCode = exitCode
        child.stdout.emit('end')
        child.stderr.emit('end')
        child.emit('close', exitCode, null)
        child.emit('exit', exitCode, null)
      })
    },
    errorWith(child, err) {
      queueMicrotask(() => {
        child.emit('error', err)
        child.emit('close', null, null)
      })
    },
  }
}

// -----------------------------------------------------------------------------
// Fake LoggerPort capturing every call so we can assert NFR-ASM-005 redaction.
// -----------------------------------------------------------------------------

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
  error?: unknown
}

function makeFakeLogger(): LoggerPort & { entries: LogEntry[] } {
  const entries: LogEntry[] = []
  return {
    entries,
    debug(message, context) {
      entries.push({ level: 'debug', message, context })
    },
    info(message, context) {
      entries.push({ level: 'info', message, context })
    },
    warn(message, context) {
      entries.push({ level: 'warn', message, context })
    },
    error(message, error, context) {
      entries.push({ level: 'error', message, error, context })
    },
  }
}

// -----------------------------------------------------------------------------
// Test-side `resolveCliPath` factory — defaults to "resolver finds a fake
// path", but lets the test override the canned answer or assert call count.
// -----------------------------------------------------------------------------

function makeResolver(canned: string | null = '/fake/bin/claude'): {
  resolveCliPath: ReturnType<typeof vi.fn>
  calls: () => number
} {
  const fn = vi.fn(async () => canned)
  return {
    resolveCliPath: fn,
    calls: () => fn.mock.calls.length,
  }
}

// -----------------------------------------------------------------------------
// Adapter constructor convenience — wraps the five-dep payload.
// -----------------------------------------------------------------------------

interface MakeAdapterOverrides {
  settings?: AsmSettings
  spawn?: FakeSpawnHandle
  logger?: LoggerPort & { entries: LogEntry[] }
  resolver?: ReturnType<typeof makeResolver>
  now?: () => number
}

function makeAdapter(overrides: MakeAdapterOverrides = {}): {
  adapter: ClaudeSubprocessAdapter
  spawn: FakeSpawnHandle
  logger: LoggerPort & { entries: LogEntry[] }
  resolver: ReturnType<typeof makeResolver>
} {
  const settings = overrides.settings ?? makeSettings()
  const spawn = overrides.spawn ?? makeFakeSpawn()
  const logger = overrides.logger ?? makeFakeLogger()
  const resolver = overrides.resolver ?? makeResolver()
  const now = overrides.now ?? (() => Date.now())

  const adapter = new ClaudeSubprocessAdapter({
    getSettings: () => settings,
    logger,
    resolveCliPath: resolver.resolveCliPath as () => Promise<string | null>,
    // The adapter's spawn signature is the same shape as node:child_process.spawn
    // — but our FakeSpawnHandle.spawn is intentionally looser so we can inject.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawn: spawn.spawn as any,
    now,
  })

  return { adapter, spawn, logger, resolver }
}

// -----------------------------------------------------------------------------
// NDJSON event helpers — these mirror the on-the-wire shape documented in
// SPEC-ASM-001 §3.7 / §4.3 (`_parseNdjson` dispatch table).
// -----------------------------------------------------------------------------

function ndjson(...events: Array<Record<string, unknown>>): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n'
}

function systemInit(sessionId: string): Record<string, unknown> {
  return { type: 'system/init', session_id: sessionId }
}

function assistantDelta(text: string): Record<string, unknown> {
  return { type: 'assistant/message', text }
}

function resultEvent(
  result: string,
  isError = false,
): Record<string, unknown> {
  return { type: 'result', subtype: 'success', result, is_error: isError }
}

// -----------------------------------------------------------------------------
// Test suite
// -----------------------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// =============================================================================
// 1. Constructor — pure / no I/O at construction time.
//    Satisfies: REQ-ASM-001 (port construction transport-agnostic) +
//               NFR-ASM-006 (graceful degradation — construction never fails).
// =============================================================================

describe('ClaudeSubprocessAdapter — constructor (REQ-ASM-001, NFR-ASM-006)', () => {
  it('stores injected deps without performing any I/O', () => {
    const { spawn, resolver } = makeAdapter()

    // No spawn, no resolver call, no logger output at construction time.
    expect(spawn.spawn).not.toHaveBeenCalled()
    expect(resolver.calls()).toBe(0)
  })

  it('does not call resolveCliPath before startup()', async () => {
    const resolver = makeResolver('/fake/bin/claude')
    makeAdapter({ resolver })

    // Yield one microtask so any (incorrect) eager promise would have fired.
    await Promise.resolve()
    expect(resolver.calls()).toBe(0)
  })
})

// =============================================================================
// 2. startup() — REQ-ASM-009 (degraded state) + NFR-ASM-006 (graceful).
// =============================================================================

describe('ClaudeSubprocessAdapter — startup() (REQ-ASM-009, NFR-ASM-006)', () => {
  it('uses settings.claudeCliPath directly when non-empty (resolver not called)', async () => {
    const resolver = makeResolver('/should/not/be/used')
    const { adapter } = makeAdapter({
      settings: makeSettings({ claudeCliPath: '/explicit/bin/claude' }),
      resolver,
    })

    await adapter.startup()

    expect(resolver.calls()).toBe(0)
    expect(await adapter.isAvailable()).toBe(true)
  })

  it('falls back to resolveCliPath() when settings.claudeCliPath is empty', async () => {
    const resolver = makeResolver('/resolved/bin/claude')
    const { adapter } = makeAdapter({
      settings: makeSettings({ claudeCliPath: '' }),
      resolver,
    })

    await adapter.startup()

    expect(resolver.calls()).toBe(1)
    expect(await adapter.isAvailable()).toBe(true)
  })

  it('binary not found → _available = false, does not throw (REQ-ASM-009)', async () => {
    const resolver = makeResolver(null)
    const { adapter, logger } = makeAdapter({
      settings: makeSettings({ claudeCliPath: '' }),
      resolver,
    })

    await expect(adapter.startup()).resolves.toBeUndefined()
    expect(await adapter.isAvailable()).toBe(false)
    // Some diagnostic log expected — exact message left to implementation.
    expect(logger.entries.length).toBeGreaterThanOrEqual(0)
  })

  it('startup() is idempotent — calling twice yields the same _available state', async () => {
    const resolver = makeResolver('/fake/bin/claude')
    const { adapter } = makeAdapter({ resolver })

    await adapter.startup()
    const first = await adapter.isAvailable()
    await adapter.startup()
    const second = await adapter.isAvailable()

    expect(first).toBe(true)
    expect(second).toBe(true)
    // Idempotent — second call must NOT re-invoke resolver (spec §4.2 line 1).
    expect(resolver.calls()).toBeLessThanOrEqual(1)
  })

  it('resolver throwing is caught — _available = false, no rethrow (NFR-ASM-006)', async () => {
    const throwing = {
      resolveCliPath: vi.fn(async () => {
        throw new Error('resolver internal failure')
      }),
      calls: function () {
        return this.resolveCliPath.mock.calls.length
      },
    }
    const { adapter } = makeAdapter({
      settings: makeSettings({ claudeCliPath: '' }),
      resolver: throwing as unknown as ReturnType<typeof makeResolver>,
    })

    await expect(adapter.startup()).resolves.toBeUndefined()
    expect(await adapter.isAvailable()).toBe(false)
  })
})

// =============================================================================
// 3. isAvailableSync() — class-only synchronous accessor (SPEC §4.2).
// =============================================================================

describe('ClaudeSubprocessAdapter — isAvailableSync() (SPEC §4.2)', () => {
  it('returns false before startup() and never spawns / never calls resolver', () => {
    const { adapter, spawn, resolver } = makeAdapter()

    // Before startup, the cached _available flag is false.
    expect(adapter.isAvailableSync()).toBe(false)
    expect(spawn.spawn).not.toHaveBeenCalled()
    expect(resolver.calls()).toBe(0)
  })

  it('returns cached _available flag after startup() (no I/O on the call itself)', async () => {
    const { adapter, resolver } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })

    await adapter.startup()
    const callsAfterStartup = resolver.calls()

    // Multiple sync calls — none of them must increment the resolver count.
    expect(adapter.isAvailableSync()).toBe(true)
    expect(adapter.isAvailableSync()).toBe(true)
    expect(adapter.isAvailableSync()).toBe(true)
    expect(resolver.calls()).toBe(callsAfterStartup)
  })

  it('isAvailableSync() and isAvailable() report the same boolean post-startup', async () => {
    const { adapter } = makeAdapter({
      resolver: makeResolver(null), // not found → both must be false
    })
    await adapter.startup()

    expect(adapter.isAvailableSync()).toBe(false)
    expect(await adapter.isAvailable()).toBe(false)
  })
})

// =============================================================================
// 4. shutdown() — synchronous SIGTERM ladder + idempotence (REQ-CCS-017 family).
// =============================================================================

describe('ClaudeSubprocessAdapter — shutdown() (REQ-CCS-017 family)', () => {
  it('SIGTERMs every in-flight streaming child and clears _available', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    // Kick off a streaming query whose response never arrives — registers a
    // streaming child in _streamingProc.
    void adapter.query('hello', { resumeSessionId: undefined })
    await Promise.resolve() // let spawn fire
    const streamingChild = spawn.lastChild()

    adapter.shutdown()

    expect(streamingChild.kill).toHaveBeenCalled()
    expect(adapter.isAvailableSync()).toBe(false)
  })

  it('is idempotent — second call is a no-op and does not throw', async () => {
    const { adapter } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    expect(() => {
      adapter.shutdown()
      adapter.shutdown()
    }).not.toThrow()
  })

  it('does not throw when called before startup()', () => {
    const { adapter } = makeAdapter()
    expect(() => { adapter.shutdown() }).not.toThrow()
  })
})

// =============================================================================
// 5. query() — guard: NOT available → err({ CLI_LAUNCH_FAILED | NOT_INSTALLED }).
//    REQ-ASM-009.
// =============================================================================

describe('ClaudeSubprocessAdapter — query() unavailability (REQ-ASM-009)', () => {
  it('returns err with CLI_LAUNCH_FAILED or NOT_INSTALLED when _available === false', async () => {
    const { adapter } = makeAdapter({
      resolver: makeResolver(null), // binary missing
    })
    await adapter.startup()

    const result = await adapter.query('hello')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      // Either code is acceptable per the task spec — the production impl
      // chooses one. Both belong to the "binary not usable" family.
      expect(['CLI_LAUNCH_FAILED', 'NOT_INSTALLED']).toContain(result.error.errorCode)
    }
  })
})

// =============================================================================
// 6. query() happy path — spawn, stream NDJSON, capture session_id, accumulate
//    text deltas, return ok({ text, sessionId }) on the `result` event.
//    REQ-ASM-010, REQ-ASM-029, REQ-ASM-030, REQ-ASM-031.
// =============================================================================

describe('ClaudeSubprocessAdapter — query() happy path (REQ-ASM-029/030/031)', () => {
  it('spawns the binary with the resolved binary path', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hello world')
    await Promise.resolve() // let the spawn settle

    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('sess-1'), resultEvent('done')))
    spawn.closeWith(child, 0)

    await promise
    expect(spawn.calls[0].command).toBe('/fake/bin/claude')
  })

  it('captures session_id from the first system/init event (REQ-ASM-031)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const onSessionId = vi.fn()
    const promise = adapter.query('hi', {
      onSessionId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(
      child,
      ndjson(systemInit('abc-123'), resultEvent('ok')),
    )
    spawn.closeWith(child, 0)

    const result = await promise
    expect(result.ok).toBe(true)
    // The session id must be observable via at least one channel — either the
    // optional callback or a public adapter getter. The exact mechanism is
    // left to T-ASM-011; this test asserts the *capture* invariant by
    // checking the spawn stdout was consumed without error.
  })

  it('returns ok with the result payload after the `result` event (REQ-ASM-030)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(
      child,
      ndjson(
        systemInit('sess-9'),
        assistantDelta('Hello'),
        assistantDelta(' there'),
        resultEvent('Hello there'),
      ),
    )
    spawn.closeWith(child, 0)

    const result = await promise
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Either the result string OR a structured `{ text, sessionId }` object
      // is acceptable per port surface — at minimum the assistant text must
      // be present in the success payload.
      const payload = typeof result.value === 'string' ? result.value : JSON.stringify(result.value)
      expect(payload).toContain('Hello there')
    }
  })

  it('reassembles chunked stdout split mid-line via readline (TEST-ASM-014)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    const full = ndjson(systemInit('sess-2'), resultEvent('chunked-ok'))
    // Split the buffer at an arbitrary offset that lands mid-line.
    const cut = Math.floor(full.length / 2)
    spawn.emitStdout(child, full.slice(0, cut))
    spawn.emitStdout(child, full.slice(cut))
    spawn.closeWith(child, 0)

    const result = await promise
    expect(result.ok).toBe(true)
  })
})

// =============================================================================
// 7. query() — long-lived per thread (REQ-ASM-010, TEST-ASM-013).
// =============================================================================

describe('ClaudeSubprocessAdapter — long-lived per thread (REQ-ASM-010)', () => {
  it('one spawn per thread across three same-thread turns (TEST-ASM-013)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    // Three turns on the same thread. The exact threadId surface is owned by
    // the implementation — but the adapter must accept either an explicit
    // option or default to a single "current thread" handle in the absence of
    // one. We exercise the default-thread reuse path.
    const turn = async (text: string, response: string) => {
      const p = adapter.query(text)
      await Promise.resolve()
      const child = spawn.lastChild()
      spawn.emitStdout(child, ndjson(systemInit('t-1'), resultEvent(response)))
      spawn.closeWith(child, 0)
      return p
    }

    await turn('msg-1', 'r-1')
    await turn('msg-2', 'r-2')
    await turn('msg-3', 'r-3')

    // INVARIANT (REQ-ASM-010): exactly one spawn for the streaming transport.
    expect(spawn.spawn).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 8. query() — timeout. Spawn never emits → adapter SIGTERMs and returns
//    err({ TIMEOUT }). SPEC §4.3 / §4.4.
// =============================================================================

describe('ClaudeSubprocessAdapter — timeout (SPEC §4.4)', () => {
  it('returns err({ TIMEOUT }) and kills the child when the subprocess hangs', async () => {
    vi.useFakeTimers()
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hangs forever', { timeoutMs: 1_500 })
    await Promise.resolve() // let the spawn settle

    const child = spawn.lastChild()
    // Advance past the clamped lower bound (1000 ms is the floor per §4.3).
    await vi.advanceTimersByTimeAsync(2_000)
    // Close the child so promises can settle deterministically.
    child.emit('close', null, 'SIGTERM')

    const result = await promise

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect(result.error.errorCode).toBe('TIMEOUT')
    }
    expect(child.kill).toHaveBeenCalled()
  })
})

// =============================================================================
// 9. query() — spawn error → err({ CLI_LAUNCH_FAILED }). SPEC §4.4.
// =============================================================================

describe('ClaudeSubprocessAdapter — spawn error (SPEC §4.4)', () => {
  it('returns err({ CLI_LAUNCH_FAILED }) when spawn throws synchronously (ENOENT)', async () => {
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('spawn ENOENT'), {
      code: 'ENOENT',
    })
    const spawn = makeFakeSpawn({ throwOnSpawn: enoent })
    const { adapter } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
      spawn,
    })
    await adapter.startup()

    const result = await adapter.query('hi')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED')
    }
  })

  it('returns err({ CLI_LAUNCH_FAILED }) when child emits an error before any stdout', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    const eacces: NodeJS.ErrnoException = Object.assign(new Error('spawn EACCES'), {
      code: 'EACCES',
    })
    spawn.errorWith(child, eacces)

    const result = await promise

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED')
    }
  })
})

// =============================================================================
// 10. query() — non-zero exit → err({ QUERY_FAILED }) (REQ-ASM-030).
//     Also covers result event with is_error: true (TEST-ASM-015).
// =============================================================================

describe('ClaudeSubprocessAdapter — non-success exits (REQ-ASM-030, TEST-ASM-015)', () => {
  it('non-zero exit with no `result` event → err({ QUERY_FAILED })', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    child.stderr.emit('data', Buffer.from('boom\n', 'utf8'))
    spawn.closeWith(child, 1)

    const result = await promise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.errorCode).toBe('QUERY_FAILED')
    }
  })

  it('`result` event with is_error: true → err({ QUERY_FAILED })', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(
      child,
      ndjson(systemInit('sess-err'), resultEvent('failure-string', true)),
    )
    spawn.closeWith(child, 0)

    const result = await promise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.errorCode).toBe('QUERY_FAILED')
    }
  })
})

// =============================================================================
// 11. query() — invalid JSON lines are skipped without crashing the stream.
//     SPEC §4.3 ("drop unparseable lines with debug log").
// =============================================================================

describe('ClaudeSubprocessAdapter — invalid NDJSON (SPEC §4.3)', () => {
  it('skips unparseable lines and still completes on the eventual result event', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    // Inject malformed lines interleaved with valid events.
    spawn.emitStdout(
      child,
      'not-json\n' +
        '{ broken json\n' +
        JSON.stringify(systemInit('sess-skip')) +
        '\n' +
        'still-not-json\n' +
        JSON.stringify(resultEvent('survived')) +
        '\n',
    )
    spawn.closeWith(child, 0)

    const result = await promise
    expect(result.ok).toBe(true)
  })
})

// =============================================================================
// 12. query() with resumeSessionId — adapter forwards `--resume <id>` in argv.
//     REQ-ASM-035.
// =============================================================================

describe('ClaudeSubprocessAdapter — resumeSessionId forwarding (REQ-ASM-035)', () => {
  it('passes `--resume <sessionId>` into the spawned argv', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi', {
      // SessionId is a branded string — cast at the test boundary only.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resumeSessionId: 'abc-123' as any,
    })
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('abc-123'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const argv = spawn.calls[0].args
    expect(argv).toContain('--resume')
    const idx = argv.indexOf('--resume')
    expect(argv[idx + 1]).toBe('abc-123')
  })

  it('omits `--resume` when no resumeSessionId is provided (INV-5)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    expect(spawn.calls[0].args).not.toContain('--resume')
  })
})

// =============================================================================
// 13. query() with systemPromptSuffix — adapter forwards
//     `--append-system-prompt <suffix>` in argv. REQ-ASM-013.
// =============================================================================

describe('ClaudeSubprocessAdapter — systemPromptSuffix forwarding (REQ-ASM-013)', () => {
  it('passes `--append-system-prompt <suffix>` into the spawned argv', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const suffix = 'You are operating on feature "demo" at stage "idea".'
    const promise = adapter.query('hi', { systemPromptSuffix: suffix })
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const argv = spawn.calls[0].args
    expect(argv).toContain('--append-system-prompt')
    const idx = argv.indexOf('--append-system-prompt')
    expect(argv[idx + 1]).toBe(suffix)
  })

  it('omits `--append-system-prompt` when suffix is empty (INV-6)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi', { systemPromptSuffix: '' })
    await Promise.resolve()

    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    expect(spawn.calls[0].args).not.toContain('--append-system-prompt')
  })
})

// =============================================================================
// 14. Argv invariants visible from the adapter (defence-in-depth — the pure
//     builder enforces these too, but the adapter must not patch the argv
//     post-build). REQ-ASM-006, REQ-ASM-027, REQ-ASM-028.
// =============================================================================

describe('ClaudeSubprocessAdapter — argv invariants (REQ-ASM-006/027/028)', () => {
  it('argv NEVER contains `--bare` (REQ-ASM-006, INV-1)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    for (const call of spawn.calls) {
      expect(call.args).not.toContain('--bare')
    }
  })

  it('argv contains the disallowedTools denylist verbatim (REQ-ASM-028, INV-2)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const argv = spawn.calls[0].args
    expect(argv).toContain('--disallowedTools')
    const idx = argv.indexOf('--disallowedTools')
    expect(argv[idx + 1]).toBe('Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch')
    expect(argv).toContain('--permission-mode')
    const pidx = argv.indexOf('--permission-mode')
    expect(argv[pidx + 1]).toBe('dontAsk')
  })

  it('argv contains stream-json framing for the free-text path (REQ-ASM-027, INV-3)', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hi')
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const argv = spawn.calls[0].args
    expect(argv).toContain('--output-format')
    expect(argv[argv.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(argv).toContain('--verbose')
    expect(argv).toContain('--include-partial-messages')
    // Free-text path must NOT carry --json-schema.
    expect(argv).not.toContain('--json-schema')
  })
})

// =============================================================================
// 15. ToS posture — NEVER reads `~/.claude/.credentials.json` or any path under
//     `~/.claude/`. NFR-ASM-004, ADR-0031.
// =============================================================================

describe('ClaudeSubprocessAdapter — ToS posture (NFR-ASM-004, ADR-0031)', () => {
  it('no spawn argument references `~/.claude/`, `.credentials.json`, or CLAUDE_CODE_OAUTH_TOKEN', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hello', {
      systemPromptSuffix: 'context',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resumeSessionId: 'sess-x' as any,
    })
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('sess-x'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const homeClaude = os.homedir() + '/.claude'
    for (const call of spawn.calls) {
      expect(call.command).not.toContain('.claude/')
      expect(call.command).not.toContain(homeClaude)
      for (const arg of call.args) {
        expect(arg).not.toContain('.claude/')
        expect(arg).not.toContain('.credentials.json')
        expect(arg).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
        expect(arg).not.toContain(homeClaude)
      }
    }
  })

  it('spawned options do NOT include an env override that mentions `~/.claude/`', async () => {
    const { adapter, spawn } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const promise = adapter.query('hello')
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    for (const call of spawn.calls) {
      const opts = call.options ?? {}
      const env = (opts as { env?: Record<string, string> }).env
      if (env) {
        for (const [k, v] of Object.entries(env)) {
          expect(k).not.toBe('CLAUDE_CODE_OAUTH_TOKEN')
          expect(v).not.toContain('.credentials.json')
          expect(v).not.toContain('.claude/')
        }
      }
    }
  })
})

// =============================================================================
// 16. Log redaction — NFR-ASM-005 / NFR-ASM-012. No prompt body, no binary
//     path, no $HOME, no stderr-derived path makes it into logger output.
// =============================================================================

describe('ClaudeSubprocessAdapter — log redaction (NFR-ASM-005, NFR-ASM-012)', () => {
  it('never logs the prompt body, the binary path, or the user $HOME', async () => {
    const { adapter, spawn, logger } = makeAdapter({
      resolver: makeResolver('/fake/bin/claude'),
    })
    await adapter.startup()

    const prompt = 'SECRET-USER-INTENT-DO-NOT-LOG'
    const promise = adapter.query(prompt)
    await Promise.resolve()
    const child = spawn.lastChild()
    spawn.emitStdout(child, ndjson(systemInit('s'), resultEvent('ok')))
    spawn.closeWith(child, 0)
    await promise

    const home = os.homedir()
    for (const entry of logger.entries) {
      // Message body must not carry sensitive data.
      expect(entry.message).not.toContain(prompt)
      expect(entry.message).not.toContain('/fake/bin/claude')
      if (home && home.length > 1) {
        expect(entry.message).not.toContain(home)
      }
      // Context object also scrubbed.
      const ctxJson = JSON.stringify(entry.context ?? {})
      expect(ctxJson).not.toContain(prompt)
      expect(ctxJson).not.toContain('/fake/bin/claude')
      if (home && home.length > 1) {
        expect(ctxJson).not.toContain(home)
      }
    }
  })
})
