import type { SessionId } from '@/domain/chat/SessionId'
import type { Result } from '@/domain/shared/Result'

/**
 * Discriminator for ClaudeCliError. Each code maps to one UI copy string:
 *   NOT_INSTALLED      → "AI assistant is not available right now."
 *   API_KEY_MISSING    → "Chat is not set up yet."
 *   TIMEOUT            → "That took too long. Please try again."
 *   QUERY_FAILED       → "Something went wrong. Please try again."
 *   CLI_LAUNCH_FAILED  → "Chat needs the Claude command-line tool." (SPEC-ASM-001 §2.7)
 *
 * Satisfies REQ-CCS-021, REQ-ASM-009.
 */
export type ClaudeCliErrorCode =
  | 'NOT_INSTALLED' // Binary could not be resolved or the SDK failed to start
  | 'API_KEY_MISSING' // ANTHROPIC_API_KEY was empty at query time
  | 'TIMEOUT' // No response received within timeoutMs
  | 'QUERY_FAILED' // SDK call returned an error or threw an unexpected exception
  | 'CLI_LAUNCH_FAILED' // Subprocess spawn failed (R-ASM-002 AppArmor / userns) — SPEC-ASM-001 §2.7

export class ClaudeCliError extends Error {
  public readonly name = 'ClaudeCliError'

  constructor(
    public readonly errorCode: ClaudeCliErrorCode,
    message: string,
    /** Original SDK or system error. Used for logging only; never surfaced in UI. */
    public readonly cause?: unknown,
  ) {
    super(message)
    // Restore prototype chain (required for instanceof checks in transpiled code).
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Options forwarded to the underlying SDK call. All fields are optional.
 * Satisfies REQ-CCS-021.
 */
export interface ClaudeCliQueryOptions {
  /**
   * Maximum wall-clock time the adapter waits for a response before returning
   * ClaudeCliError{TIMEOUT}. Unit: milliseconds.
   * Default: 30 000. Valid range: [1 000, 300 000].
   * Values outside the range are silently clamped by the adapter.
   * Satisfies NFR-CCS-003.
   */
  readonly timeoutMs?: number

  /**
   * Maximum number of agent turns. Fixed at 1 in v1.
   * Values > 1 are clamped to 1 by the adapter (logged at warn level; not surfaced to the user).
   * Reserved for v2 multi-turn support.
   */
  readonly maxTurns?: number

  /**
   * Optional suffix appended to the system prompt for stage-aware context
   * (ADR-0027, SPEC-ASM-001 §2.6 and design.md C4). The subscription transport
   * forwards this verbatim as `--append-system-prompt <value>`; the SDK adapter
   * ignores it. Empty strings are treated the same as `undefined` — the flag
   * is omitted.
   * Satisfies REQ-ASM-013.
   */
  readonly systemPromptSuffix?: string

  /**
   * Optional Claude session identifier used to resume an existing conversation.
   * The subscription transport forwards this as `--resume <sessionId>`; the SDK
   * adapter logs at debug level and ignores it (subscription transport only).
   * Satisfies REQ-ASM-035.
   */
  readonly resumeSessionId?: SessionId
}

/**
 * Narrow port for the Claude CLI subprocess adapter (ADR-008).
 * The interface file must not import from 'obsidian' or '@anthropic-ai/claude-agent-sdk'.
 * Satisfies REQ-CCS-021.
 */
export interface ClaudeCliPort {
  /**
   * Send a fully-assembled prompt string to Claude and return the full text response.
   * Never throws. Returns Result<string, ClaudeCliError>.
   * The promise resolves when the response arrives or when an error/timeout occurs.
   * Satisfies REQ-CCS-013, REQ-CCS-016, NFR-CCS-003.
   */
  query(
    prompt: string,
    options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>>

  /**
   * Returns true if the adapter is ready to accept queries.
   * Returns false for all degraded conditions: missing API key, startup failure,
   * binary not found, browser/mobile stubs.
   * This method must not throw. Implementors must catch all errors internally
   * and return false.
   * Satisfies REQ-CCS-018, REQ-CCS-019, REQ-CCS-022.
   */
  isAvailable(): Promise<boolean>

  /**
   * Pre-warm the subprocess. Called from onload() before the first user interaction.
   * Must not throw; log errors internally and return.
   * Satisfies REQ-CCS-003, NFR-CCS-002.
   */
  startup(): Promise<void>

  /**
   * Terminate the subprocess. Called from onunload() which is synchronous.
   * Must be synchronous (fire-and-forget is acceptable).
   * Must not throw.
   * Satisfies REQ-CCS-017, NFR-CCS-007.
   */
  shutdown(): void
}
