/**
 * T-ASM-038 — Tests for `queryStructured` (application-layer wrapper around
 * the subscription adapter's structured-output path).
 *
 * Spec reference: SPEC-ASM-001 §2.9 (port-as-runStructured-owner) and §6.6
 * (`queryStructured` algorithm).
 *
 * Maps to:
 *   - REQ-ASM-001  (transport-agnostic application layer; ADR-008 narrow port preserved)
 *   - REQ-ASM-021  (structured envelope schema flows through the parser)
 *   - REQ-ASM-049  (one-shot proposal process; mock asserts a single `runStructured` call)
 *
 * Notes:
 *   - The SDK adapter (`ClaudeCliAdapter`) does NOT implement `runStructured`
 *     — the `typeof port.runStructured === 'function'` check inside
 *     `queryStructured` must fail closed for it. We exercise this with a
 *     structural fake rather than importing the real SDK adapter, to keep
 *     this suite hermetic and free of Anthropic SDK initialisation.
 *   - The `degradedClaudeCliPort` sentinel is a frozen no-op stub with no
 *     `runStructured` method — also covered by the negative branch.
 *   - The happy / error / fallback paths are exercised through
 *     `MockClaudeSubprocessAdapter`, whose `runStructured` mirrors the
 *     production surface.
 *
 * Reshaped in WP-12 (Arch review #3): the `isSubscriptionCapable` guard and
 * the `streamFromQuery` shim are gone — `runStructured` lives on the port
 * directly, and non-streaming converge-to-string callers use
 * `collectStream(port.queryStream(...))`.
 */
import { describe, it, expect } from 'vitest'

import {
  queryStructured,
  type StructuredCliCallOptions,
  type StructuredCliRawResult,
} from '@/application/chat/queryStructured'
import { EnvelopeParseError } from '@/application/chat/errors'
import {
  ClaudeCliError,
  type ClaudeCliPort,
  type ClaudeCliStreamOptions,
  type StreamDelta,
} from '@/domain/ports/ClaudeCliPort'
import { ok, type Result } from '@/domain/shared/Result'
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'

// -----------------------------------------------------------------------------
// Minimal structural fake for the SDK adapter. `ClaudeCliAdapter` does not
// implement `runStructured`, so the application-layer narrowing check
// (`typeof port.runStructured === 'function'`) must fail closed for it. We
// don't import the real adapter — keeps the suite hermetic and avoids pulling
// the Anthropic SDK into a pure-application test.
// -----------------------------------------------------------------------------

function makeSdkLikePort(): ClaudeCliPort {
  return {
    async isAvailable() {
      return true
    },
    async *queryStream(
      _prompt: string,
      _options?: ClaudeCliStreamOptions,
    ): AsyncIterable<StreamDelta> {
      yield { type: 'done' }
    },
    // No `runStructured` — that's the point of this fake.
  }
}

// =============================================================================
// 1. `queryStructured` — algorithm from SPEC §6.6.
// =============================================================================

describe('queryStructured (SPEC §6.6)', () => {
  it('non-subscription-capable port (no runStructured) → err(ClaudeCliError{ NOT_INSTALLED })', async () => {
    const port = makeSdkLikePort()

    const result = await queryStructured(port, 'hello', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect((result.error as ClaudeCliError).errorCode).toBe('NOT_INSTALLED')
    }
  })

  it('degradedClaudeCliPort sentinel → err(ClaudeCliError{ NOT_INSTALLED })', async () => {
    const result = await queryStructured(degradedClaudeCliPort, 'hello', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect((result.error as ClaudeCliError).errorCode).toBe('NOT_INSTALLED')
    }
  })

  it('happy path: parses cannedStructuredEnvelope via parseStructuredEnvelope', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true
    // Default cannedStructuredEnvelope is the §5.1 sample envelope.

    const result = await queryStructured(mock, 'propose an idea', {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.action).toBe('createFile')
      expect(result.value.path).toBe('specs/mock/idea.md')
    }
    // REQ-ASM-049 — one-shot: exactly one runStructured call.
    expect(mock.structuredLog).toHaveLength(1)
    expect(mock.structuredLog[0]?.prompt).toBe('propose an idea')
  })

  it('propagates adapter error from runStructured (e.g. CLI_LAUNCH_FAILED)', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true
    mock.queryError = new ClaudeCliError('CLI_LAUNCH_FAILED', 'binary missing')

    const result = await queryStructured(mock, 'hello', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect((result.error as ClaudeCliError).errorCode).toBe('CLI_LAUNCH_FAILED')
    }
  })

  it('invalid structured_output → err(EnvelopeParseError{ PRIMARY_ZOD_FAILED })', async () => {
    // Bypass the typed default and stuff a shape the Zod schema will reject.
    const port: ClaudeCliPort & {
      runStructured: (
        p: string,
        o: StructuredCliCallOptions,
      ) => Promise<Result<StructuredCliRawResult, ClaudeCliError>>
    } = {
      async isAvailable() {
        return true
      },
      async *queryStream(
        _prompt: string,
        _options?: ClaudeCliStreamOptions,
      ): AsyncIterable<StreamDelta> {
        yield { type: 'done' }
      },
      async runStructured() {
        return ok({
          result: '',
          // Wrong literal — schema requires action: 'createFile'.
          structured_output: {
            action: 'deleteFile',
            path: 'a.md',
            content: '',
          },
        })
      },
    }

    const result = await queryStructured(port, 'hello', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(EnvelopeParseError)
      expect((result.error as EnvelopeParseError).kind).toBe('PRIMARY_ZOD_FAILED')
    }
  })

  it('missing structured_output but valid .result → parser fallback returns ok', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true
    mock.cannedStructuredEnvelope = null
    mock.cannedStructuredRawResult =
      'Sure: {"action":"createFile","path":"a.md","content":"hi"} done.'

    const result = await queryStructured(mock, 'hello', {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        action: 'createFile',
        path: 'a.md',
        content: 'hi',
      })
    }
  })

  it('forwards the options bag to runStructured (systemPromptSuffix gets the JSON-only guard appended, Codex P2 fix)', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true

    await queryStructured(mock, 'p', {
      systemPromptSuffix: 'PRE',
      resumeSessionId: 'sess-1',
      timeoutMs: 5000,
    })

    const entry = mock.structuredLog[0]
    expect(entry).toBeDefined()
    const opts = entry.options
    expect(opts.resumeSessionId).toBe('sess-1')
    expect(opts.timeoutMs).toBe(5000)
    // The caller's suffix is preserved as a prefix; the structured guard is
    // appended so the model returns an object-only response.
    const suffix = opts.systemPromptSuffix ?? ''
    expect(suffix.startsWith('PRE')).toBe(true)
    expect(suffix).toContain('JSON object')
    expect(suffix).toContain('Do not include any prose')
  })

  it('appends the JSON-only guard even when no caller suffix is provided (Codex P2 fix)', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true

    await queryStructured(mock, 'p', {})

    const entry = mock.structuredLog[0]
    expect(entry).toBeDefined()
    const suffix = entry.options.systemPromptSuffix ?? ''
    expect(suffix).toContain('JSON object')
    expect(suffix).toContain('Do not include any prose')
  })
})

// =============================================================================
// 2. Argv invariants — the structured path must use `--output-format json`
//    and `--json-schema` (INV-4). This is asserted directly against the
//    canonical `buildSubprocessArgs` so the test stays decoupled from
//    `ClaudeSubprocessAdapter` internals; it confirms the inputs the adapter
//    feeds to the argv builder match REQ-ASM-021.
// =============================================================================

describe('queryStructured + buildSubprocessArgs argv invariants (REQ-ASM-021, INV-4)', () => {
  it('produces argv with --output-format json --json-schema <schema>', async () => {
    const { buildSubprocessArgs } = await import(
      '@/infrastructure/obsidian/buildSubprocessArgs'
    )
    const { createFileEnvelopeJsonSchema } = await import(
      '@/application/chat/createFileEnvelopeSchema'
    )

    const argv = buildSubprocessArgs({
      prompt: 'hi',
      systemPromptSuffix: '',
      resumeSessionId: null,
      jsonSchema: createFileEnvelopeJsonSchema,
    })

    expect(argv).toContain('--output-format')
    expect(argv).toContain('json')
    expect(argv).toContain('--json-schema')
    expect(argv).toContain(createFileEnvelopeJsonSchema)
    // INV-4: must NOT carry the free-text framing tokens.
    expect(argv).not.toContain('stream-json')
    expect(argv).not.toContain('--include-partial-messages')
  })
})
