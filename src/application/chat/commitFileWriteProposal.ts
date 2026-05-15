/**
 * T-ASM-067 — `commitFileWriteProposal` + `rejectFileWriteProposal`.
 *
 * Application-layer service that consumes a `FileWriteProposal` and either:
 *   - **Accepts** it: mutates the vault by writing the envelope's `content` to
 *     `envelope.path`, with an overwrite-confirmation gate (REQ-ASM-044) and a
 *     folder-hint creation step (REQ-ASM-047), then awaits an audit-row write
 *     to the session log (REQ-ASM-046). This is `commitFileWriteProposal`.
 *   - **Rejects** it: writes only the audit row; does not touch the vault.
 *     This is `rejectFileWriteProposal` (REQ-ASM-045).
 *
 * **Trust-first invariant (verbatim, SPEC-ASM-001 §3.6, NFR-ASM-011):**
 * `commitFileWriteProposal` is the only function in the codebase that, on
 * behalf of a model proposal, calls `VaultPort.writeFile`. No other code path
 * mutates the vault from an LLM response. The Accept button click handler in
 * `FileWriteProposalCard.vue` is the sole call site (NFR-ASM-011).
 *
 * Pure application layer (ADR-001, ADR-008): no `obsidian` imports, no
 * `node:fs`, no `any`. All Vault interaction goes through the narrow
 * {@link VaultPort}. All fallible operations are wrapped via `tryAsync`; raw
 * try/catch is forbidden in application code.
 *
 * Algorithm (SPEC-ASM-001 §3.6):
 *   1. **Overwrite guard (REQ-ASM-044).** Read `vault.fileExists`. If `true`,
 *      show the `ConfirmModalPort` with translated title/body/labels. If the
 *      user cancels, append a `rejected` audit row and return
 *      `err(OVERWRITE_CANCELLED)`. **No further VaultPort calls.**
 *   2. **Folder hint (REQ-ASM-047).** If `envelope.folderHint` is a non-empty
 *      string, call `vault.createFolder`. On error → `err(FOLDER_CREATE_FAILED)`
 *      AFTER firing a best-effort `decision: 'failed'` audit row.
 *   3. **Write (REQ-ASM-043).** Call `vault.writeFile`. On error → `err(WRITE_FAILED)`
 *      AFTER firing an audit row with decision `'failed'` and rationale
 *      preserved (the audit row is best-effort here — its own failure does not
 *      override the original write failure). The same trust-first audit
 *      invariant applies to the `fileExists` probe in step 1: a rejection
 *      surfaces as `WRITE_FAILED` and still mirrors a `'failed'` audit row.
 *   4. **Audit log (REQ-ASM-046).** Append a `## proposal` decision block with
 *      `decision: 'accepted'`. Awaited inline — a missing audit row for a
 *      vault-mutating action is treated as a hard failure (`SESSION_LOG_FAILED`).
 *      This is the single departure from §6.7's fire-and-forget rule.
 *   5. Return `ok(undefined)`.
 *
 * Satisfies REQ-ASM-043, REQ-ASM-044, REQ-ASM-045, REQ-ASM-046, REQ-ASM-047,
 * NFR-ASM-011.
 */

import { type Result, ok, err } from '@/domain/shared/Result'
import { tryAsync } from '@/domain/shared/tryAsync'
import type {
  ConfirmModalPort,
  LoggerPort,
  TranslationPort,
  VaultPort,
} from '@/domain/ports'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'

import type { FileWriteProposal } from './FileWriteProposal'
import type { SessionLogWriter } from './SessionLogWriter'
import { CommitProposalError } from './errors'

/**
 * Dependency bag for the commit pipeline. See SPEC-ASM-001 §3.6.
 *
 * The `nowIso` factory is injected so tests get deterministic timestamps on
 * the audit row without monkey-patching `Date`.
 */
export interface CommitFileWriteDeps {
  readonly vault: VaultPort
  readonly logger: LoggerPort
  readonly sessionLog: SessionLogWriter
  readonly confirmModal: ConfirmModalPort
  readonly i18n: TranslationPort
  readonly nowIso: () => string
}

/**
 * Read an optional envelope field without forcing the schema to grow.
 * `CreateFileEnvelope` is currently `.strict()` and does not expose
 * `folderHint` / `rationale`; the spec's §3.6 algorithm + §5.1 mock envelope
 * both reference them. This typed accessor lets the commit pipeline honour the
 * spec today without breaking the existing schema contract — when the schema
 * is extended later, this helper becomes a no-op.
 */
function optionalString(
  envelope: FileWriteProposal['envelope'],
  key: 'folderHint' | 'rationale',
): string | undefined {
  const record = envelope as unknown as Record<string, unknown>
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Accept a {@link FileWriteProposal}: write the envelope to the vault behind
 * the overwrite-confirmation gate, then append an `accepted` audit row to the
 * session log. Returns `Result.err` with a specific {@link CommitProposalError}
 * code at every reachable failure point.
 *
 * **This is the sole vault-mutation path for LLM-proposed writes** (§3.6).
 */
export async function commitFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: CommitFileWriteDeps,
): Promise<Result<void, CommitProposalError>> {
  const { envelope } = proposal
  const rationale = optionalString(envelope, 'rationale')

  // 1. Overwrite guard (REQ-ASM-044). On any error reading existence, treat
  //    as "unknown → safest to proceed without modal", but surface as
  //    WRITE_FAILED when the subsequent write also fails. We intentionally do
  //    NOT block on `fileExists` errors here: the modal is gated on a
  //    confirmed-true result only.
  const existsResult = await tryAsync(() => deps.vault.fileExists(envelope.path))
  if (!existsResult.ok) {
    // Trust-first invariant: every terminal state mirrors to the session log
    // (SPEC-ASM-001 §3.6, REQ-ASM-046). Best-effort here — the underlying
    // vault probe already failed; an audit-row failure must not override the
    // original error code surfaced to the user.
    await tryAsync(() =>
      deps.sessionLog.appendProposalDecision({
        thread,
        proposal: {
          envelope: { path: envelope.path, rationale },
        },
        decision: 'failed',
        decidedAt: deps.nowIso(),
      }),
    )
    return err(
      new CommitProposalError(
        'WRITE_FAILED',
        `VaultPort.fileExists failed for path: ${envelope.path}`,
        existsResult.error,
      ),
    )
  }
  if (existsResult.value) {
    const confirmed = await deps.confirmModal.show({
      title: deps.i18n.t('chat.proposal.overwriteTitle'),
      body: deps.i18n.t('chat.proposal.overwriteBody', { path: envelope.path }),
      confirmLabel: deps.i18n.t('chat.proposal.overwriteConfirm'),
      cancelLabel: deps.i18n.t('chat.proposal.overwriteCancel'),
    })
    if (!confirmed) {
      // User cancelled the overwrite. Record a `rejected` audit row so the
      // session-log history reflects the decided cancellation (REQ-ASM-046,
      // §3.6 step 1). Best-effort here — a failed audit row should not mask
      // the user's cancellation outcome.
      await deps.sessionLog
        .appendProposalDecision({
          thread,
          proposal: {
            envelope: { path: envelope.path, rationale },
          },
          decision: 'rejected',
          decidedAt: deps.nowIso(),
        })
        .catch(() => {
          /* logged by SessionLogWriter */
        })
      return err(
        new CommitProposalError('OVERWRITE_CANCELLED', 'User cancelled overwrite.'),
      )
    }
  }

  // 2. Folder hint (REQ-ASM-047). Only run when present + non-empty.
  const folderHint = optionalString(envelope, 'folderHint')
  if (folderHint !== undefined && folderHint.length > 0) {
    const folderResult = await tryAsync(() => deps.vault.createFolder(folderHint))
    if (!folderResult.ok) {
      // Trust-first invariant: terminal-failure outcomes mirror to the
      // session log (REQ-ASM-046). Best-effort — folder creation already
      // failed; an audit-row failure must not override the original error.
      await tryAsync(() =>
        deps.sessionLog.appendProposalDecision({
          thread,
          proposal: {
            envelope: { path: envelope.path, rationale },
          },
          decision: 'failed',
          decidedAt: deps.nowIso(),
        }),
      )
      return err(
        new CommitProposalError(
          'FOLDER_CREATE_FAILED',
          `Could not create folder: ${folderHint}`,
          folderResult.error,
        ),
      )
    }
  }

  // 3. Write (REQ-ASM-043). The single vault-mutation site for an LLM proposal.
  const writeResult = await tryAsync(() =>
    deps.vault.writeFile(envelope.path, envelope.content),
  )
  if (!writeResult.ok) {
    // Trust-first invariant: every terminal state mirrors to the session log
    // (SPEC-ASM-001 §3.6 step 3, REQ-ASM-046). Best-effort here — the vault
    // write already failed; an audit-row failure must not compound the
    // original failure or override its error code.
    await tryAsync(() =>
      deps.sessionLog.appendProposalDecision({
        thread,
        proposal: {
          envelope: { path: envelope.path, rationale },
        },
        decision: 'failed',
        decidedAt: deps.nowIso(),
      }),
    )
    return err(
      new CommitProposalError('WRITE_FAILED', 'Could not write file.', writeResult.error),
    )
  }

  // 4. Audit log (REQ-ASM-046). Awaited inline — the §6.7 fire-and-forget rule
  //    has a single exception for this audit row. A failure here is a hard
  //    failure because a vault-mutating action without its audit row violates
  //    the traceability article of the constitution.
  const auditResult = await tryAsync(() =>
    deps.sessionLog.appendProposalDecision({
      thread,
      proposal: {
        envelope: { path: envelope.path, rationale },
      },
      decision: 'accepted',
      decidedAt: deps.nowIso(),
    }),
  )
  if (!auditResult.ok) {
    return err(
      new CommitProposalError(
        'SESSION_LOG_FAILED',
        'Audit log write failed.',
        auditResult.error,
      ),
    )
  }

  // 5. Success.
  return ok(undefined)
}

/**
 * Reject a {@link FileWriteProposal}: append a `rejected` audit row to the
 * session log. **Never invokes any `VaultPort` mutation method** (REQ-ASM-045).
 *
 * The session-log append is awaited so callers know whether the audit row was
 * persisted. Unlike `commitFileWriteProposal`, the audit row is the only side
 * effect — there is no vault mutation to traceability-pair with — so the
 * resolved promise is `void` (no `Result`).
 */
export async function rejectFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: Pick<CommitFileWriteDeps, 'sessionLog' | 'logger' | 'nowIso'>,
): Promise<void> {
  const rationale = optionalString(proposal.envelope, 'rationale')
  // `SessionLogWriter.appendProposalDecision` already routes its own thrown
  // errors to `logger.error`; we await for ordering but do not surface failure
  // — the user's reject decision is recorded best-effort.
  await deps.sessionLog
    .appendProposalDecision({
      thread,
      proposal: {
        envelope: { path: proposal.envelope.path, rationale },
      },
      decision: 'rejected',
      decidedAt: deps.nowIso(),
    })
    .catch((thrown: unknown) => {
      deps.logger.error(
        'rejectFileWriteProposal: audit-row append failed',
        thrown instanceof Error ? thrown : new Error(String(thrown)),
        { proposalId: proposal.proposalId, threadId: thread.threadId },
      )
    })
}
