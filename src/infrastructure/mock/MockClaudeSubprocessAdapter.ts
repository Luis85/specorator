/**
 * T-ASM-013 — Field-driven mock for the subscription-transport
 * `ClaudeCliPort` implementation. Mirrors the structural conventions of
 * `MockClaudeCliPort` (SPEC-CCS-001 §6) and the public surface of
 * `ClaudeSubprocessAdapter` (SPEC-ASM-001 §4/§5).
 *
 * Satisfies:
 *   - REQ-ASM-001 (transport-agnostic port construction; no I/O)
 *   - REQ-ASM-031 (session_id capture surface)
 *   - NFR-ASM-006 (startup never throws)
 *   - NFR-ASM-007 (shutdown is idempotent / no-op-safe)
 *
 * Used by `fakeModulePorts()` (ADR-009) and any test that needs a
 * subscription-shaped port without spawning a real `claude` binary.
 *
 * Mock files are permitted to live in the infrastructure layer without
 * importing `obsidian` (ADR-008). The matching ESLint override allows the
 * raw `setTimeout` used to honour `delayMs` for synthetic latency.
 */
import type { SessionId } from '@/domain/chat/SessionId'
import type {
  ClaudeCliPort,
  ClaudeCliQueryOptions,
} from '@/domain/ports/ClaudeCliPort'
import type { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import type { Result } from '@/domain/shared/Result'
import { err, ok } from '@/domain/shared/Result'

/**
 * Recorded options metadata for a single `query()` invocation. Kept as a
 * structurally simple plain object so `JSON.stringify(mock)` surfaces every
 * field — the test harness asserts on serialised mock state to verify that
 * options were threaded through (T-ASM-012 tests #12 / #13).
 */
interface RecordedQueryOptions {
  readonly resumeSessionId: SessionId | null
  readonly systemPromptSuffix: string | null
  readonly timeoutMs: number | null
  readonly maxTurns: number | null
}

/**
 * Field-driven mock subscription adapter. Every behaviour is configurable
 * through a public field — no constructor arguments, no I/O.
 */
export class MockClaudeSubprocessAdapter implements ClaudeCliPort {
  /**
   * Structural discriminator for `selectTransport()` / `isSubscriptionCapable()`
   * narrowing (SPEC-ASM-001 §2.9). Declared here so PR-ASM-1 ships a
   * complete mock without waiting on the `SubscriptionCapable` interface
   * landing in PR-ASM-2.
   */
  public readonly kind = 'subscription' as const

  /**
   * Drives `isAvailable()` and `isAvailableSync()`. Defaults to `false` so
   * tests start in the safe degraded state — the standalone browser UI and
   * any test fixture must opt in explicitly.
   */
  available = false

  /**
   * Text returned from `query()` when `queryError === null`.
   */
  cannedResponse = ''

  /**
   * Simulated `session_id` for the subscription transport (REQ-ASM-031).
   * Settable independently of `cannedResponse`. Default `null` — no session
   * captured yet.
   */
  cannedSessionId: SessionId | null = null

  /**
   * If non-null, `query()` resolves with this error instead of `cannedResponse`.
   */
  queryError: ClaudeCliError | null = null

  /**
   * Artificial delay (milliseconds) applied before `query()` resolves.
   * Default `0` — no delay.
   */
  delayMs = 0

  /**
   * Append-only log of every prompt string passed to `query()`. The canonical
   * assertion surface for "was this prompt sent?" checks.
   */
  readonly queryLog: string[] = []

  /**
   * Append-only log of recorded option metadata for every `query()` call.
   * Exposed as a public field so `JSON.stringify(mock)` surfaces forwarded
   * options for test assertions (T-ASM-012 tests #12 / #13).
   */
  readonly optionsLog: RecordedQueryOptions[] = []

  /** No-op startup — never throws (NFR-ASM-006). */
  async startup(): Promise<void> {
    // Intentionally empty.
  }

  /** No-op shutdown — synchronous, idempotent, never throws (NFR-ASM-007). */
  shutdown(): void {
    // Intentionally empty.
  }

  /** Returns the `available` field. Never throws. */
  async isAvailable(): Promise<boolean> {
    return this.available
  }

  /**
   * Synchronous class-only availability accessor (SPEC-ASM-001 §4.2 /
   * `ClaudeSubprocessAdapter.isAvailableSync`). Performs no I/O — reads the
   * cached `available` field directly.
   */
  isAvailableSync(): boolean {
    return this.available
  }

  /**
   * Records the prompt and options, optionally waits `delayMs`, then resolves
   * with `cannedResponse` (or `queryError` if set). Never throws.
   */
  async query(
    prompt: string,
    options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>> {
    this.queryLog.push(prompt)
    this._recordOptions(options)

    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs))
    }

    if (this.queryError !== null) {
      return err(this.queryError)
    }

    return ok(this.cannedResponse)
  }

  /**
   * Records the four ternary-defaulted option fields into `optionsLog`.
   * Extracted from `query()` so its cyclomatic complexity stays under the
   * project ceiling — every `?? null` counts as a branch.
   */
  private _recordOptions(options?: ClaudeCliQueryOptions): void {
    this.optionsLog.push({
      resumeSessionId: options?.resumeSessionId ?? null,
      systemPromptSuffix: options?.systemPromptSuffix ?? null,
      timeoutMs: options?.timeoutMs ?? null,
      maxTurns: options?.maxTurns ?? null,
    })
  }
}
