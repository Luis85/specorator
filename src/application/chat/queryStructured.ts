/**
 * T-ASM-039 — `queryStructured`: application-layer wrapper around the
 * structured-output path on the subscription transport.
 *
 * Spec reference: SPEC-ASM-001 §2.9 (type seam) and §6.6 (module shape and
 * algorithm). ADR-008 narrow-port discipline is preserved: `ClaudeCliPort`
 * keeps its four methods (query, isAvailable, startup, shutdown). The
 * structured capability is exposed as a tagged structural extension —
 * `SubscriptionCapable` — that downstream callers narrow to via the
 * user-defined type guard `isSubscriptionCapable`. The SDK adapter
 * (`ClaudeCliAdapter`) has no `kind` field and therefore fails the guard
 * closed.
 *
 * The interface lives in this application module (per spec §6.6 and the task
 * description) rather than in `@/domain/ports/ClaudeCliPort` so that the
 * domain port remains a four-method surface. `SubscriptionCapable extends
 * ClaudeCliPort` purely as a type seam; the production adapter satisfies it
 * structurally, not by `implements`-declaration.
 *
 * Algorithm (§6.6):
 *   1. If `!isSubscriptionCapable(port)` → return `err(ClaudeCliError{
 *      NOT_INSTALLED })` — structured output requires the subscription
 *      transport.
 *   2. `raw = await port.runStructured(prompt, options)`.
 *   3. If `!raw.ok` → propagate the adapter's `ClaudeCliError`.
 *   4. Return `parseStructuredEnvelope(raw.value)`.
 *
 * Satisfies REQ-ASM-001, REQ-ASM-021, REQ-ASM-049.
 */
import type { SessionId } from '@/domain/chat/SessionId'
import {
  ClaudeCliError,
  type ClaudeCliPort,
  type ClaudeCliQueryOptions,
} from '@/domain/ports/ClaudeCliPort'
import { err, type Result } from '@/domain/shared/Result'

import type { CreateFileEnvelope } from './createFileEnvelopeSchema'
import type { EnvelopeParseError } from './errors'
import { parseStructuredEnvelope } from './parseStructuredEnvelope'

/**
 * Raw response from a structured-output Claude CLI invocation
 * (`claude -p '<prompt>' --output-format json --json-schema '<schema>'`).
 *
 * `result` is the model's free-text payload; `structured_output` is the
 * schema-validated JSON object (or `unknown` for the parser to validate via
 * Zod). Both fields are populated by the adapter from a single `JSON.parse`
 * of the subprocess's full stdout (SPEC §4.2 `runStructured` row).
 */
export interface StructuredCliRawResult {
  readonly result: string
  readonly structured_output: unknown
}

/**
 * Options forwarded to the structured one-shot call. Mirror of the relevant
 * fields from `ClaudeCliQueryOptions`; kept as a separate interface so the
 * structured surface can evolve without widening the free-text port.
 */
export interface StructuredCliCallOptions {
  readonly systemPromptSuffix?: string
  readonly resumeSessionId?: string
  readonly timeoutMs?: number
  /**
   * Optional caller-supplied callback invoked exactly once when the structured
   * call's response envelope yields a non-empty `session_id`. Mirrors the
   * free-text `ClaudeCliQueryOptions.onSessionId` contract (REQ-ASM-031): the
   * callback must be invoked before the wrapper's promise resolves so the
   * caller can persist the session id alongside the resolved envelope.
   *
   * Load-bearing for proposals (REQ-ASM-046) — without it, a thread that
   * starts with `/create-file` keeps `thread.sessionId === null` and the
   * subsequent `appendProposalDecision` would reject with
   * `SessionLogNoSessionError`, surfacing the trust-first violation as
   * `SESSION_LOG_FAILED` instead of silently dropping the audit row.
   */
  readonly onSessionId?: (sessionId: SessionId) => void
}

/**
 * Tagged structural extension of `ClaudeCliPort`. The subscription adapter
 * declares `readonly kind = 'subscription'` and exposes `runStructured`; the
 * SDK adapter does neither. The user-defined type guard
 * `isSubscriptionCapable` is the only sanctioned way to narrow a
 * `ClaudeCliPort` to this capability — call sites must never reach for
 * `instanceof` (which would force a domain ⇄ infrastructure import).
 */
export interface SubscriptionCapable extends ClaudeCliPort {
  readonly kind: 'subscription'
  runStructured(
    prompt: string,
    options: StructuredCliCallOptions,
  ): Promise<Result<StructuredCliRawResult, ClaudeCliError>>
}

/**
 * Structural type guard: returns `true` iff the port both carries the
 * `'subscription'` tag and exposes a callable `runStructured` method. The
 * second check guards against a partially-mocked port that sets `kind` but
 * hasn't implemented the method.
 *
 * Fails closed for: the SDK adapter (no `kind` field), the
 * `degradedClaudeCliPort` sentinel, and any future transport that hasn't
 * opted in.
 */
export function isSubscriptionCapable(port: ClaudeCliPort): port is SubscriptionCapable {
  const candidate = port as Partial<SubscriptionCapable>
  return (
    candidate.kind === 'subscription' && typeof candidate.runStructured === 'function'
  )
}

/**
 * Structured-output guard phrase appended to every structured call's system
 * prompt suffix. The `--output-format json --json-schema` flags constrain the
 * shape, but in practice models will sometimes emit prose or code fences
 * around the JSON object — that prose then trips `parseStructuredEnvelope`
 * and surfaces as `EnvelopeParseError`/`structured-fail` even when the
 * user's command was valid. Pinning the contract in the system prompt makes
 * the model far more likely to return an object-only response (Codex P2,
 * PR #347).
 *
 * Centralised here so every caller of `queryStructured` inherits the guard
 * without having to remember to append it themselves.
 */
export const STRUCTURED_OUTPUT_GUARD_SUFFIX =
  '\n\nRespond with a single JSON object that conforms to the provided schema. ' +
  'Do not include any prose, explanation, code fences, or markdown formatting ' +
  'before or after the JSON object.'

/**
 * Application-layer wrapper around the structured-output path. See module
 * header and SPEC §6.6 for the algorithm. Never throws. The error union
 * surfaces:
 *   - `ClaudeCliError{ NOT_INSTALLED }` when the port is not subscription-capable.
 *   - `ClaudeCliError{ … }` propagated from the adapter (TIMEOUT, QUERY_FAILED, etc.).
 *   - `EnvelopeParseError` from the four-step `parseStructuredEnvelope` pipeline.
 */
export async function queryStructured(
  port: ClaudeCliPort,
  prompt: string,
  options: StructuredCliCallOptions = {},
): Promise<Result<CreateFileEnvelope, EnvelopeParseError | ClaudeCliError>> {
  if (!isSubscriptionCapable(port)) {
    return err(
      new ClaudeCliError(
        'NOT_INSTALLED',
        'Structured output requires the subscription transport.',
      ),
    )
  }

  // Always pin the JSON-only guard on the system prompt suffix so the model
  // returns an object-only response (Codex P2, PR #347). The stage preamble
  // composed by `assembleSystemPrompt` (when present) precedes the guard.
  const callerSuffix = options.systemPromptSuffix ?? ''
  const mergedOptions: StructuredCliCallOptions = {
    ...options,
    systemPromptSuffix: callerSuffix + STRUCTURED_OUTPUT_GUARD_SUFFIX,
  }

  const raw = await port.runStructured(prompt, mergedOptions)
  if (!raw.ok) {
    return err(raw.error)
  }

  return parseStructuredEnvelope(raw.value)
}

// Re-export the standard `ClaudeCliQueryOptions` so call sites that already
// hold a free-text options bag can pass it straight through without an extra
// import line. The structured options are a subset.
export type { ClaudeCliQueryOptions }
