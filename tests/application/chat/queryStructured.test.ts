/**
 * T-ASM-038 — Tests for `isSubscriptionCapable` (structural type guard) and
 * `queryStructured` (application-layer wrapper around the subscription
 * adapter's structured-output path).
 *
 * Spec reference: SPEC-ASM-001 §2.9 (`SubscriptionCapable`) and §6.6
 * (`queryStructured` algorithm).
 *
 * Maps to:
 *   - REQ-ASM-001  (transport-agnostic application layer; ADR-008 narrow port preserved)
 *   - REQ-ASM-021  (structured envelope schema flows through the parser)
 *   - REQ-ASM-049  (one-shot proposal process; mock asserts a single `runStructured` call)
 *
 * Notes:
 *   - The SDK adapter (`ClaudeCliAdapter`) has no `kind` field — the guard must fail
 *     closed for it. We exercise this with a structural fake rather than importing the
 *     real SDK adapter, to keep this suite hermetic and free of Anthropic SDK initialisation.
 *   - The `degradedClaudeCliPort` sentinel is a frozen no-op stub with no `kind` field —
 *     also covered by the negative branch of `isSubscriptionCapable`.
 *   - The happy / error / fallback paths are exercised through `MockClaudeSubprocessAdapter`,
 *     whose `runStructured` mirrors the production surface.
 */
import { describe, it, expect } from 'vitest'

import {
  isSubscriptionCapable,
  queryStructured,
  type StructuredCliCallOptions,
  type StructuredCliRawResult,
} from '@/application/chat/queryStructured'
import { EnvelopeParseError } from '@/application/chat/errors'
import { ClaudeCliError, type ClaudeCliPort } from '@/domain/ports/ClaudeCliPort'
import { ok, type Result } from '@/domain/shared/Result'
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'

// -----------------------------------------------------------------------------
// Minimal structural fake for the SDK adapter (`ClaudeCliAdapter` has no
// `kind` field). We don't import the real adapter — keeps the suite hermetic
// and avoids pulling the Anthropic SDK into a pure-application test.
// -----------------------------------------------------------------------------

function makeSdkLikePort(): ClaudeCliPort {
  return {
    async query() {
      return ok('')
    },
    async isAvailable() {
      return true
    },
    async startup() {
      /* no-op */
    },
    shutdown() {
      /* no-op */
    },
  }
}

// =============================================================================
// 1. `isSubscriptionCapable` — structural type guard.
// =============================================================================

describe('isSubscriptionCapable (SPEC §2.9)', () => {
  it('returns true for a port with kind === "subscription" and a runStructured method', () => {
    const port = new MockClaudeSubprocessAdapter()
    expect(isSubscriptionCapable(port)).toBe(true)
  })

  it('returns false for an SDK-shaped port without `kind`', () => {
    const port = makeSdkLikePort()
    expect(isSubscriptionCapable(port)).toBe(false)
  })

  it('returns false for the degradedClaudeCliPort sentinel', () => {
    expect(isSubscriptionCapable(degradedClaudeCliPort)).toBe(false)
  })

  it('returns false when kind is "subscription" but runStructured is missing', () => {
    // Partial mock that sets the tag but omits the method — the guard must
    // require both. Cast through `unknown` so the type system models the
    // structural-check failure at runtime.
    const partial = {
      kind: 'subscription' as const,
      async query() {
        return ok('')
      },
      async isAvailable() {
        return true
      },
      async startup() {
        /* no-op */
      },
      shutdown() {
        /* no-op */
      },
    }
    expect(isSubscriptionCapable(partial as unknown as ClaudeCliPort)).toBe(false)
  })
})

// =============================================================================
// 2. `queryStructured` — algorithm from SPEC §6.6.
// =============================================================================

describe('queryStructured (SPEC §6.6)', () => {
  it('non-subscription-capable port → err(ClaudeCliError{ NOT_INSTALLED })', async () => {
    const port = makeSdkLikePort()

    const result = await queryStructured(port, 'hello', {})

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
      kind: 'subscription'
      runStructured: (
        p: string,
        o: StructuredCliCallOptions,
      ) => Promise<Result<StructuredCliRawResult, ClaudeCliError>>
    } = {
      kind: 'subscription',
      async query() {
        return ok('')
      },
      async isAvailable() {
        return true
      },
      async startup() {
        /* no-op */
      },
      shutdown() {
        /* no-op */
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

  it('forwards the options bag verbatim to runStructured', async () => {
    const mock = new MockClaudeSubprocessAdapter()
    mock.available = true

    await queryStructured(mock, 'p', {
      systemPromptSuffix: 'PRE',
      resumeSessionId: 'sess-1',
      timeoutMs: 5000,
    })

    expect(mock.structuredLog[0]?.options).toEqual({
      systemPromptSuffix: 'PRE',
      resumeSessionId: 'sess-1',
      timeoutMs: 5000,
    })
  })
})

// =============================================================================
// 3. Argv invariants — the structured path must use `--output-format json`
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
