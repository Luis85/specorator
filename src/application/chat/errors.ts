/**
 * Application-layer error classes for the agent side-panel chat.
 *
 * All five error classes in this surface area (the four defined here plus
 * `ChatTransportError` in `src/domain/ports/ChatTransportPort.ts`) extend {@link Error}
 * and are returned via `Result.error` — they are never thrown across a port
 * boundary (ADR-004, SPEC-ASM-001 §2.8).
 *
 * Each class restores the prototype chain via
 * `Object.setPrototypeOf(this, new.target.prototype)` so that `instanceof`
 * checks work in transpiled code (matches the `ChatTransportError` pattern).
 *
 * Satisfies REQ-ASM-023, REQ-ASM-025, REQ-ASM-044, REQ-ASM-048.
 */

/**
 * Discriminator for {@link EnvelopeParseError}. Identifies which parser stage
 * rejected the assistant's structured output. All UI copy collapses to the
 * single string "Assistant returned an unexpected response. Please try again."
 * (REQ-ASM-025); the kind is used for logging and tests only.
 */
export type EnvelopeParseFailureKind =
  | 'STRUCTURED_OUTPUT_MISSING'
  | 'PRIMARY_ZOD_FAILED'
  | 'FALLBACK_EXTRACTION_FAILED'
  | 'FALLBACK_JSON_PARSE_FAILED'
  | 'FALLBACK_ZOD_FAILED'

/**
 * Raised when `parseStructuredEnvelope` cannot produce a valid
 * `CreateFileEnvelope` from a Claude response. `errorCode` is fixed at
 * `'STRUCTURED_PARSE_FAILED'` so callers can branch on the discriminator
 * without inspecting `kind`.
 *
 * Satisfies REQ-ASM-023, REQ-ASM-025.
 */
export class EnvelopeParseError extends Error {
  public readonly name = 'EnvelopeParseError'
  public readonly errorCode = 'STRUCTURED_PARSE_FAILED' as const

  constructor(
    public readonly kind: EnvelopeParseFailureKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    // Restore prototype chain (required for instanceof checks in transpiled code).
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Discriminator for {@link PathValidationError}. Each kind maps to a distinct
 * UI hint surfaced by `FileWriteProposalCard` in the `'path-invalid'` state
 * (REQ-ASM-048).
 */
export type PathValidationFailureKind =
  | 'EMPTY'
  | 'CONTAINS_DOTDOT'
  | 'LEADING_SLASH'
  | 'ESCAPES_VAULT_ROOT'
  | 'BAD_EXTENSION'

/**
 * Raised when `validateProposalPath` rejects an envelope's `path`. `errorCode`
 * is fixed at `'PATH_INVALID'`; callers may inspect `kind` for the precise
 * reason.
 *
 * Satisfies REQ-ASM-048.
 */
export class PathValidationError extends Error {
  public readonly name = 'PathValidationError'
  public readonly errorCode = 'PATH_INVALID' as const

  constructor(
    public readonly kind: PathValidationFailureKind,
    message: string,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Discriminator for {@link CommitProposalError}. Identifies the commit-time
 * stage that failed when accepting a `FileWriteProposal`.
 *
 * - `OVERWRITE_CANCELLED`: user dismissed the overwrite confirmation modal.
 * - `FOLDER_CREATE_FAILED`: VaultPort.createFolder rejected.
 * - `WRITE_FAILED`:        VaultPort.writeFile rejected.
 * - `SESSION_LOG_FAILED`:  audit-log append rejected (REQ-ASM-046).
 */
export type CommitProposalErrorCode =
  | 'OVERWRITE_CANCELLED'
  | 'FOLDER_CREATE_FAILED'
  | 'WRITE_FAILED'
  | 'SESSION_LOG_FAILED'

/**
 * Raised by the proposal commit use case. Surfaces to the UI as a toast and is
 * recorded against the proposal's `failureReason` field.
 *
 * Satisfies REQ-ASM-044, REQ-ASM-046.
 */
export class CommitProposalError extends Error {
  public readonly name = 'CommitProposalError'

  constructor(
    public readonly errorCode: CommitProposalErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Raised when {@link VaultPort.fileExists} (or, in Increment 2, `readFile`)
 * throws while `proposeFileWrite` is inspecting a proposal target. `errorCode`
 * is fixed at `'VAULT_READ_FAILED'`; the underlying cause is preserved on
 * `cause` for logging.
 *
 * Read-only failure mode — separate from {@link CommitProposalError} because
 * the propose path never mutates the vault (SPEC-ASM-001 §3.5, REQ-ASM-041).
 *
 * Satisfies REQ-ASM-041.
 */
export class VaultReadError extends Error {
  public readonly name = 'VaultReadError'
  public readonly errorCode = 'VAULT_READ_FAILED' as const

  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Discriminator for {@link ClaudeSubscriptionError}. Identifies the
 * subscription-transport failure mode; the adapter composes this into a
 * `ChatTransportError` before surfacing to the UI (SPEC-ASM-001 §2.8).
 */
export type ClaudeSubscriptionErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'BINARY_NOT_ABSOLUTE'
  | 'SPAWN_FAILED'
  | 'NON_ZERO_EXIT'
  | 'STDOUT_INVALID_JSON'

/**
 * Subscription-transport specific errors that compose into `ChatTransportError`.
 * Stays in the application layer so that the infrastructure adapter can map
 * its internal failure modes to the existing UI copy table without leaking
 * subprocess internals across the port boundary.
 */
export class ClaudeSubscriptionError extends Error {
  public readonly name = 'ClaudeSubscriptionError'

  constructor(
    public readonly errorCode: ClaudeSubscriptionErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
