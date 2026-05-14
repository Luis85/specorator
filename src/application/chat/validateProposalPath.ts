/**
 * T-ASM-037 — `validateProposalPath` + `posixNormalize` helper.
 *
 * Defense-in-depth path validation for LLM-proposed file writes. This is the
 * only place that decides whether a `CreateFileEnvelope.path` is allowed to
 * land in the vault: the Zod schema (`createFileEnvelopeSchema`) enforces the
 * shape; this module enforces the path safety rules per SPEC-ASM-001 §3.4 and
 * ADR-0032 (trust-first vault writes).
 *
 * Pure module: no I/O, no `obsidian` imports, no Node `path` module (we
 * deliberately do not flatten `..` segments — they must be visible to the
 * validator so it can reject them).
 *
 * Satisfies REQ-ASM-048.
 */

import { type Result, ok, err } from '@/domain/shared/Result'

import type { CreateFileEnvelope } from './createFileEnvelopeSchema'
import { PathValidationError } from './errors'

/**
 * Collapse a path into a normalised POSIX form without touching the
 * filesystem and without resolving `..` segments.
 *
 * - Backslashes become forward slashes.
 * - Repeated slashes (`//`, `///`, …) collapse to a single `/`.
 * - `.` segments are dropped (`./a/./b` → `a/b`).
 * - Trailing slash on a non-root path is preserved when present so callers
 *   that compose `vaultRoot + '/'` can rely on the trailing separator (see
 *   `validateProposalPath` step 5).
 * - `..` segments are LEFT IN PLACE so the validator can reject them.
 *
 * Pure; exported for direct unit testing per T-ASM-037 DoD.
 */
export function posixNormalize(path: string): string {
  // Backslashes → forward slashes (Windows / UNC inputs).
  const forward = path.replace(/\\/g, '/')
  // Detect a leading slash so we can re-attach it after segment processing.
  const hadLeadingSlash = forward.startsWith('/')
  // Detect a trailing slash on a non-root path so we can re-attach it.
  const hadTrailingSlash = forward.length > 1 && forward.endsWith('/')

  const segments = forward.split('/')
  const kept: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      // Drop empty segments (collapses '//' → '/') and bare '.' segments.
      continue
    }
    kept.push(segment)
  }

  let result = kept.join('/')
  if (hadLeadingSlash) result = '/' + result
  if (hadTrailingSlash && result !== '/' && !result.endsWith('/')) result = result + '/'
  return result
}

/**
 * Validate that an envelope's `path` is safe to land in the vault under
 * `vaultRoot`. Returns the original envelope unchanged on success — callers
 * pass the validated envelope on to `proposeFileWrite` / `commitProposal`.
 *
 * Algorithm (per SPEC-ASM-001 §3.4):
 *   1. `envelope.path.length === 0`         → `EMPTY`
 *   2. `envelope.path.startsWith('/')`      → `LEADING_SLASH`
 *   3. any `..` segment in `path`           → `CONTAINS_DOTDOT`
 *   4. `!path.endsWith('.md')`              → `BAD_EXTENSION`
 *   5. `posixNormalize(root + '/' + path)`
 *        does not start with
 *      `posixNormalize(root + '/')`         → `ESCAPES_VAULT_ROOT`
 *   6. otherwise                             → `ok(envelope)`
 *
 * Pure; no `obsidian` imports.
 */
export function validateProposalPath(
  envelope: CreateFileEnvelope,
  vaultRoot: string,
): Result<CreateFileEnvelope, PathValidationError> {
  const { path } = envelope

  // 1. Empty path.
  if (path.length === 0) {
    return err(new PathValidationError('EMPTY', 'Path is empty.'))
  }

  // 2. Leading slash (Unix absolute path).
  if (path.startsWith('/')) {
    return err(
      new PathValidationError('LEADING_SLASH', `Path must be vault-relative, got: ${path}`),
    )
  }

  // 3. Any '..' segment is forbidden (defence against vault escape).
  if (path.split('/').includes('..')) {
    return err(
      new PathValidationError(
        'CONTAINS_DOTDOT',
        `Path contains a '..' segment which is not allowed: ${path}`,
      ),
    )
  }

  // 4. Extension allow-list: `.md` only (defence-in-depth — Zod regex already
  //    enforces this once the envelope schema is tightened).
  if (!path.endsWith('.md')) {
    return err(
      new PathValidationError(
        'BAD_EXTENSION',
        `Path must end with '.md', got: ${path}`,
      ),
    )
  }

  // 5. Vault-root containment. Compute resolved vs root using POSIX
  //    normalisation (no filesystem access, no `..` flattening). Because
  //    step 3 already rejected `..` segments, this check primarily catches
  //    pathological compositions that survive normalisation.
  const resolved = posixNormalize(vaultRoot + '/' + path)
  const root = posixNormalize(vaultRoot + '/')
  if (!resolved.startsWith(root)) {
    return err(
      new PathValidationError(
        'ESCAPES_VAULT_ROOT',
        `Path resolves outside the vault root: ${path}`,
      ),
    )
  }

  // 6. All checks passed.
  return ok(envelope)
}
