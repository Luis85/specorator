/**
 * WP-5 — `SessionLogMirror` facade.
 *
 * A thin wrapper around {@link SessionLogWriter} that hides the writer's
 * dual-shape public surface (`appendUserAssistant` fire-and-forget;
 * `appendProposalDecision` await-required) behind clearer, intent-named
 * methods:
 *
 *   - {@link mirrorTurn} — mirror a free-text user/assistant exchange.
 *     **Fire-and-forget**: never rejects, swallows failures with a
 *     `logger.error` line (REQ-ASM-040). Equivalent to the writer's
 *     `appendUserAssistant` but the name removes the ambiguity about
 *     awaiting.
 *   - {@link mirrorProposalDecision} — mirror a `## proposal` audit row.
 *     **Await-required**: rejects on a missing `session_id`
 *     ({@link SessionLogNoSessionError}) or any underlying VaultPort
 *     failure, so the proposal-commit pipeline can map the failure to
 *     `SESSION_LOG_FAILED` (REQ-ASM-046).
 *
 * The facade adds no new error shapes and no new I/O — it forwards every
 * call directly to the underlying writer. The point of the facade is
 * discoverability and a single entry-point for callers outside
 * `src/application/chat/`. Domain logic (mutex, conflict-suffix loop,
 * frontmatter cache) lives in the writer.
 *
 * Pure application layer — no `obsidian` imports.
 */

import type { LoggerPort, VaultPort } from '@/domain/ports'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import {
  SessionLogWriter,
  type ProposalDecisionValue,
  type SessionLogProposalInput,
  type SessionLogWriterOptions,
} from './SessionLogWriter'

/**
 * Arguments for {@link SessionLogMirror.mirrorProposalDecision}. Mirrors the
 * writer's `appendProposalDecision` payload one-for-one — the facade does
 * not reshape it.
 */
export interface MirrorProposalDecisionArgs {
  readonly thread: ChatThreadRecord
  readonly proposal: SessionLogProposalInput
  readonly decision: ProposalDecisionValue
  readonly decidedAt: string
}

/**
 * Thin facade over {@link SessionLogWriter}. Construct once per writer
 * instance and share across UI / orchestrator call sites — the underlying
 * writer carries the per-log-file mutex map, so wrapping a single writer in
 * many facades is safe but pointless. The wiring (`useSessionLogWriter`,
 * `ChatTurnOrchestrator`) memoises one writer per Obsidian session.
 */
export class SessionLogMirror {
  constructor(private readonly writer: SessionLogWriter) {}

  /**
   * Mirror a user/assistant exchange to the session log. Fire-and-forget:
   * the returned promise resolves on a best-effort basis and never rejects
   * (REQ-ASM-040). Failures are routed to `logger.error` inside the writer.
   *
   * Callers in `ChatTurnOrchestrator.mirrorTurnToVault` use `void` on the
   * return value — there is no UI affordance for a session-log failure on
   * the free-text path.
   */
  mirrorTurn(
    thread: ChatThreadRecord,
    turn: { readonly user: string; readonly assistant: string },
  ): Promise<void> {
    return this.writer.appendUserAssistant(thread, turn)
  }

  /**
   * Mirror a `## proposal` audit row. **Awaited by the commit pipeline**
   * (REQ-ASM-046): a missing audit row for a vault-mutating action is a
   * hard failure. Propagates `SessionLogNoSessionError` and any underlying
   * VaultPort failure so the caller can map it to `SESSION_LOG_FAILED`.
   */
  mirrorProposalDecision(args: MirrorProposalDecisionArgs): Promise<void> {
    return this.writer.appendProposalDecision(args)
  }

  /**
   * Idempotent: ensures the parent sessions folder exists for the given
   * feature. Delegates to {@link SessionLogWriter.ensureSessionsFolder}.
   * Used by the wiring code on thread creation.
   */
  ensureSessionsFolder(feature: string | null): Promise<void> {
    return this.writer.ensureSessionsFolder(feature)
  }

  /**
   * Drain every pending debounced frontmatter flush owned by the underlying
   * writer (Codex P1+P2 round-1 fix). Production callers invoke this on
   * plugin teardown so the last few turns' `updated:` timestamps land on
   * disk before the writer goes away. Tests invoke it to assert the
   * post-flush state. Safe to call concurrently.
   */
  flushAll(): Promise<void> {
    return this.writer.flushAll()
  }
}

/**
 * Factory for the UI-layer composable / orchestrator wiring: builds a
 * {@link SessionLogWriter} from the four narrow dependencies and wraps it in
 * a {@link SessionLogMirror}. Keeps the writer construction call site inside
 * `src/application/chat/` so the WP-5 lint rule that bans direct
 * {@link SessionLogWriter} imports outside this folder stays effective.
 *
 * `options.flushDebounceMs` controls the WP-5 frontmatter debounce window
 * (default 30 s). Tests pass `0` to flush on the next microtask; production
 * wiring leaves this at the default and relies on `flushAll()` for
 * deterministic teardown.
 */
export function createSessionLogMirror(
  vault: VaultPort,
  logger: LoggerPort,
  specsFolder: string,
  nowIso: () => string,
  options: SessionLogWriterOptions = {},
): SessionLogMirror {
  return new SessionLogMirror(
    new SessionLogWriter(vault, logger, specsFolder, nowIso, options),
  )
}
