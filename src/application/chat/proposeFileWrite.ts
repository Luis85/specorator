/**
 * T-ASM-064 — `proposeFileWrite` application service.
 *
 * Read-only inspection of a `CreateFileEnvelope` against the current vault
 * state. The first half of the trust-first file-write path: takes a
 * schema-validated envelope from the model, asks the {@link VaultPort} whether
 * the target path already exists, and returns a {@link ProposalPreview} for
 * the UI to render via `FileWriteProposalCard`.
 *
 * **Trust-first invariant (REQ-ASM-041, NFR-ASM-011):** this module never
 * mutates the vault. It calls `vault.fileExists` only — never `writeFile`,
 * `createFolder`, or `deleteFile`. The single vault-mutation path from a model
 * proposal lives in `commitFileWriteProposal` (§3.6, Increment 1 sole
 * mutation site).
 *
 * Increment 1: `diff` is always `null` (createFile envelopes only). Increment
 * 2 will populate `diff` for updateFile envelopes by reading the target and
 * computing a unified diff — the field shape is reserved here so the UI prop
 * surface is forward-compatible (SPEC-ASM-001 §3.5).
 *
 * Application layer (ADR-001 / ADR-008): no `obsidian` imports; depends on
 * the {@link VaultPort} interface, not on a concrete bridge.
 *
 * Satisfies REQ-ASM-041. Implements SPEC-ASM-001 §3.5 + §6.4.
 */

import { type Result, ok, err } from '@/domain/shared/Result'
import { tryAsync } from '@/domain/shared/tryAsync'
import type { VaultPort } from '@/domain/ports'

import type { CreateFileEnvelope } from './createFileEnvelopeSchema'
import { VaultReadError } from './errors'

/**
 * Read-only preview of a proposed vault write. Returned by
 * {@link proposeFileWrite}; consumed by `FileWriteProposalCard.vue` (§7.4)
 * to decide whether to render the overwrite affordance.
 */
export interface ProposalPreview {
  /** Schema-validated envelope passed through unchanged. */
  readonly envelope: CreateFileEnvelope

  /**
   * `true` iff `vault.fileExists(envelope.path)` returned `true` at the moment
   * the proposal was prepared. The commit path re-checks (TOCTOU acknowledged
   * — confirmation modal narrows the window, see §3.6).
   */
  readonly targetExists: boolean

  /**
   * Unified diff between current and proposed content. Reserved for
   * Increment 2 (`updateFile` action). Always `null` in Increment 1 — kept
   * on the type so consumers can pattern-match a single shape.
   */
  readonly diff: null
}

/**
 * Inspect the vault to produce a {@link ProposalPreview} for an
 * already-schema-validated `CreateFileEnvelope`.
 *
 * Algorithm (SPEC-ASM-001 §3.5):
 *   1. `exists = await vault.fileExists(envelope.path)`. Thrown errors are
 *      wrapped in a {@link VaultReadError} `Result.err`.
 *   2. Return `ok({ envelope, targetExists: exists, diff: null })`.
 *
 * Never calls a vault mutation method (REQ-ASM-041; enforced by tests via
 * `fakeModulePorts()` mutation tracking).
 */
export async function proposeFileWrite(
  envelope: CreateFileEnvelope,
  vault: VaultPort,
): Promise<Result<ProposalPreview, VaultReadError>> {
  const existsResult = await tryAsync(() => vault.fileExists(envelope.path))
  if (!existsResult.ok) {
    return err(
      new VaultReadError(
        `VaultPort.fileExists failed for path: ${envelope.path}`,
        existsResult.error,
      ),
    )
  }

  return ok({
    envelope,
    targetExists: existsResult.value,
    diff: null,
  })
}
