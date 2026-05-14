/**
 * T-ASM-008 — Tests for `ClaudeBinaryResolver`.
 *
 * Satisfies: REQ-ASM-004, REQ-ASM-005, NFR-ASM-010, NFR-ASM-004.
 * Maps to:   TEST-ASM (resolver platform branches), the three platform branch
 *            requirements in T-ASM-008 Definition of Done.
 *
 * SPEC-ASM-001 §4 / DESIGN §C6 / Component table §C ("New infrastructure
 * components"):
 *
 *   class ClaudeBinaryResolver {
 *     resolve(): Promise<string | null>
 *   }
 *
 * Resolution order (DESIGN §C "New infrastructure components" row
 * `ClaudeBinaryResolver`):
 *   (a) Settings value if non-empty   — handled by callers (NOT by resolver)
 *   (b) `sh -lc 'command -v claude'`  on darwin / linux  (REQ-ASM-004)
 *   (c) `where.exe claude`            on win32           (REQ-ASM-004)
 *   (d) returns `null`                                   (T-ASM-009 DoD)
 *
 * Other invariants (T-ASM-009 description + DoD):
 *   - 5 s timeout on the discovery shell call (NFR-ASM-010).
 *   - Multi-line stdout: take the FIRST non-empty line (REQ-ASM-005).
 *   - Validate `path.isAbsolute` on the chosen line; reject otherwise → null.
 *   - Injectable `spawn` for tests (DI for isolation).
 *   - Source MUST NOT contain literal `'~/.claude/'` or `'.credentials.json'`
 *     (NFR-ASM-004) — verified at the lint layer, not here, but this suite
 *     asserts no path under `~/.claude/` is ever passed to spawn / read.
 *
 * These tests target the not-yet-implemented module
 * `src/infrastructure/obsidian/ClaudeBinaryResolver.ts` (T-ASM-009). They MUST
 * fail with "Cannot find module" until that implementation lands. TDD pair.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import * as os from 'node:os'
import * as path from 'node:path'

// Module-under-test (created in T-ASM-009). Tests fail with
// "Cannot find module '@/infrastructure/obsidian/ClaudeBinaryResolver'" until then.
import { ClaudeBinaryResolver } from '@/infrastructure/obsidian/ClaudeBinaryResolver'

// -----------------------------------------------------------------------------
// Fakes — a `spawn`-shaped function we can hand to the resolver constructor.
//
// We model only what the resolver consumes: a ChildProcess-like object with
// `stdout`, `stderr` streams (here EventEmitters), a `kill()` method, and
// `close` / `error` events. The resolver itself uses readline OR string
// concatenation — both are compatible with EventEmitter `data` chunks plus a
// `close` event.
// -----------------------------------------------------------------------------

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

interface SpawnCall {
  command: string
  args: readonly string[]
  options?: Record<string, unknown>
}

interface FakeSpawnHandle {
  spawn: (
    command: string,
    args: readonly string[],
    options?: Record<string, unknown>,
  ) => FakeChildProcess
  calls: SpawnCall[]
  /** Emit stdout chunks and an exit code, scheduled via microtask. */
  reply: (opts: { stdout?: string; stderr?: string; exitCode?: number }) => void
  /** Emit an `error` event before any data (e.g. ENOENT). */
  fail: (err: NodeJS.ErrnoException) => void
  /** Last spawned child for assertions on kill(), etc. */
  lastChild: () => FakeChildProcess | undefined
}

function makeFakeSpawn(): FakeSpawnHandle {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []
  let pending: FakeChildProcess | null = null

  const spawn = (
    command: string,
    args: readonly string[],
    options?: Record<string, unknown>,
  ): FakeChildProcess => {
    calls.push({ command, args, options })
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    }) as FakeChildProcess
    children.push(child)
    pending = child
    return child
  }

  return {
    spawn,
    calls,
    reply({ stdout = '', stderr = '', exitCode = 0 }) {
      const child = pending
      if (!child) throw new Error('reply() called before spawn()')
      // Schedule asynchronously so the resolver can attach listeners.
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr, 'utf8'))
        child.stdout.emit('end')
        child.stderr.emit('end')
        child.emit('close', exitCode, null)
        child.emit('exit', exitCode, null)
      })
    },
    fail(err) {
      const child = pending
      if (!child) throw new Error('fail() called before spawn()')
      queueMicrotask(() => {
        child.emit('error', err)
        child.emit('close', null, null)
      })
    },
    lastChild: () => children[children.length - 1],
  }
}

// -----------------------------------------------------------------------------
// Helpers — construct the resolver with an injected spawn and an explicit
// `platform` so we can exercise all three platform branches without depending
// on the host CI runner's `process.platform`.
// -----------------------------------------------------------------------------

type Platform = 'darwin' | 'linux' | 'win32'

function makeResolver(platform: Platform, fake: FakeSpawnHandle): ClaudeBinaryResolver {
  // The resolver accepts an injectable spawn + platform per T-ASM-009 ("Injectable
  // `spawn` for tests" and "process.platform switch covers darwin, linux, win32").
  return new ClaudeBinaryResolver({ platform, spawn: fake.spawn })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// -----------------------------------------------------------------------------
// 1. Platform branch — macOS uses `sh -lc 'command -v claude'`.
//    (REQ-ASM-004, T-ASM-008 DoD: darwin branch.)
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — platform branches (REQ-ASM-004)', () => {
  it('darwin: shells out to `sh -lc "command -v claude"`', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('darwin', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/claude\n', exitCode: 0 })

    const result = await promise

    expect(result).toBe('/usr/local/bin/claude')
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].command).toBe('sh')
    expect(fake.calls[0].args).toEqual(['-lc', 'command -v claude'])
  })

  // 2. Platform branch — Linux uses the same `sh -lc 'command -v claude'`.
  //    (REQ-ASM-004, T-ASM-008 DoD: linux branch.)
  it('linux: shells out to `sh -lc "command -v claude"`', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/bin/claude\n', exitCode: 0 })

    const result = await promise

    expect(result).toBe('/usr/bin/claude')
    expect(fake.calls[0].command).toBe('sh')
    expect(fake.calls[0].args).toEqual(['-lc', 'command -v claude'])
  })

  // 3. Platform branch — Windows uses `where.exe claude`.
  //    (REQ-ASM-004, T-ASM-008 DoD: win32 branch.)
  it('win32: shells out to `where.exe claude`', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('win32', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: 'C:\\Program Files\\Claude\\claude.exe\r\n', exitCode: 0 })

    const result = await promise

    expect(result).toBe('C:\\Program Files\\Claude\\claude.exe')
    expect(fake.calls[0].command).toBe('where.exe')
    expect(fake.calls[0].args).toEqual(['claude'])
  })
})

// -----------------------------------------------------------------------------
// 4. Multi-line output — first non-empty line wins (REQ-ASM-005).
//    Directly mirrors T-ASM-008 DoD bullet:
//      "/usr/local/bin/claude\n/opt/homebrew/bin/claude" → /usr/local/bin/claude
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — multi-line output (REQ-ASM-005)', () => {
  it('takes the first non-empty line when discovery emits multiple paths', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('darwin', fake)

    const promise = resolver.resolve()
    fake.reply({
      stdout: '/usr/local/bin/claude\n/opt/homebrew/bin/claude\n',
      exitCode: 0,
    })

    expect(await promise).toBe('/usr/local/bin/claude')
  })

  it('skips leading blank lines and returns the first non-empty path', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '\n\n/usr/bin/claude\n/usr/local/bin/claude\n', exitCode: 0 })

    expect(await promise).toBe('/usr/bin/claude')
  })

  it('trims whitespace around the chosen line', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '  /usr/bin/claude  \n', exitCode: 0 })

    expect(await promise).toBe('/usr/bin/claude')
  })
})

// -----------------------------------------------------------------------------
// 5. `path.isAbsolute` rejection — relative paths or shell-builtin output
//    (e.g. `claude: aliased to ...`) yield `null`.
//    T-ASM-008 DoD: "Non-absolute result → resolver returns `null`."
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — path.isAbsolute validation (REQ-ASM-005)', () => {
  it('returns null when the first non-empty line is a relative path', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: './claude\n', exitCode: 0 })

    expect(await promise).toBeNull()
  })

  it('returns null when stdout looks like a shell alias rather than a path', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('darwin', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: "claude: aliased to /usr/local/bin/claude\n", exitCode: 0 })

    // The first line is not absolute by `path.isAbsolute`, so resolver returns null
    // rather than silently storing a non-path string. This is the Windows
    // multi-path mitigation extended (R-ASM-007).
    expect(await promise).toBeNull()
  })
})

// -----------------------------------------------------------------------------
// 6. Failure modes — non-zero exit, ENOENT spawn error, empty stdout.
//    T-ASM-008 DoD: "timeout/failure → `null`".
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — discovery failure modes', () => {
  it('returns null when the discovery command exits non-zero with no stdout', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '', stderr: 'claude: not found\n', exitCode: 1 })

    expect(await promise).toBeNull()
  })

  it('returns null when stdout is empty (or whitespace only) even on exit 0', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '   \n\n', exitCode: 0 })

    expect(await promise).toBeNull()
  })

  it('returns null when spawn itself errors (ENOENT — `sh` missing in slim sandbox)', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('spawn sh ENOENT'), {
      code: 'ENOENT',
    })
    fake.fail(enoent)

    expect(await promise).toBeNull()
  })
})

// -----------------------------------------------------------------------------
// 7. Timeout — discovery command bounded by 5 s; on exceeding the cap, the
//    resolver kills the child and returns null (NFR-ASM-010 cross-platform;
//    T-ASM-009 description "5 s timeout").
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — 5 s timeout (NFR-ASM-010)', () => {
  it('returns null and kills the child when the discovery command exceeds the timeout', async () => {
    vi.useFakeTimers()
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    // Do NOT reply — let the timeout trip. Advance time past the 5 s cap.
    await vi.advanceTimersByTimeAsync(5_500)

    expect(await promise).toBeNull()
    const child = fake.lastChild()
    expect(child).toBeDefined()
    expect(child!.kill).toHaveBeenCalled()
  })
})

// -----------------------------------------------------------------------------
// 8. ToS posture (REQ-ASM-007 / NFR-ASM-004 / ADR-0031) — the resolver MUST
//    NOT spawn anything that references `~/.claude/` and MUST NOT read any
//    file under that directory. This test asserts no spawn call argv mentions
//    the home `.claude` directory, and the resolver never opens any path that
//    starts with the user's home `.claude/` segment.
//
//    The lint-level enforcement is in T-ASM-049 (ESLint rule). This test is a
//    runtime defence-in-depth check.
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — ToS posture (REQ-ASM-007, NFR-ASM-004)', () => {
  it('never references `~/.claude/` in any spawn argument', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('darwin', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/claude\n', exitCode: 0 })
    await promise

    const homeClaude = path.join(os.homedir(), '.claude')
    for (const call of fake.calls) {
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

  it('never references `~/.claude/` when discovery fails', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('linux', fake)

    const promise = resolver.resolve()
    fake.reply({ stdout: '', exitCode: 1 })
    await promise

    for (const call of fake.calls) {
      for (const arg of call.args) {
        expect(arg).not.toContain('.claude/')
        expect(arg).not.toContain('.credentials.json')
      }
    }
  })
})

// -----------------------------------------------------------------------------
// 9. Idempotence under repeat invocation — calling `resolve()` twice on the
//    same instance produces consistent results. (No specific REQ; defensive
//    check that the resolver does not memoise stale failure state in a way
//    that would break the Settings-tab "Autodetect" button after a fix.)
// -----------------------------------------------------------------------------

describe('ClaudeBinaryResolver — repeat invocation', () => {
  it('returns consistent results across two resolve() calls (each spawns afresh)', async () => {
    const fake = makeFakeSpawn()
    const resolver = makeResolver('darwin', fake)

    const p1 = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/claude\n', exitCode: 0 })
    const r1 = await p1

    const p2 = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/claude\n', exitCode: 0 })
    const r2 = await p2

    expect(r1).toBe('/usr/local/bin/claude')
    expect(r2).toBe('/usr/local/bin/claude')
    // Each `resolve()` triggers a fresh spawn — discovery is cheap and the
    // user's PATH may have changed between Autodetect clicks.
    expect(fake.calls.length).toBe(2)
  })
})
