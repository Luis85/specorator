/**
 * Branded string type for Claude subscription session identifiers
 * (SPEC-ASM-001 §2.2). The brand is a `unique symbol` so the only way to
 * obtain a `SessionId` value is through the `asSessionId` constructor —
 * preventing accidental mixing with arbitrary strings at the type level
 * while still allowing zero-cost erasure to `string` at runtime.
 *
 * Satisfies REQ-ASM-031, REQ-ASM-035, REQ-ASM-037.
 *
 * Domain layer (ADR-008): no `obsidian` / `child_process` imports.
 */
declare const SessionIdBrand: unique symbol

export type SessionId = string & { readonly [SessionIdBrand]: true }

/**
 * Cast a raw string to `SessionId`. The cast is unchecked by design — the
 * caller (the subprocess adapter parsing `system/init` events) is the single
 * authority on what constitutes a valid session id.
 */
export function asSessionId(raw: string): SessionId {
  return raw as SessionId
}
