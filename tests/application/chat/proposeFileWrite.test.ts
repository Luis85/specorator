/**
 * T-ASM-063 — Tests for `proposeFileWrite`.
 *
 * Asserts the read-only invariant (REQ-ASM-041, NFR-ASM-011):
 *   - `vault.fileExists` is called exactly once with the envelope path.
 *   - `vault.writeFile`, `vault.createFolder`, and `vault.deleteFile` are
 *     never invoked from the propose path — the trust-first guarantee.
 *   - `targetExists` reflects the live vault state (both branches covered).
 *   - `diff` is `null` in Increment 1 (reserved for Increment 2 updateFile).
 *   - A throwing `fileExists` surfaces as `Result.err(VaultReadError)` without
 *     escaping.
 *
 * Read-only invariant is asserted via the shared `fakeModulePorts()` harness
 * (CLAUDE.md testing conventions §ADR-009): mutations through any port would
 * be visible through the others, so spying on the bridge's mutators is
 * sufficient.
 *
 * Satisfies REQ-ASM-041; cites SPEC-ASM-001 §3.5 + §6.4.
 */

import { describe, it, expect, vi } from 'vitest'

import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'
import { VaultReadError } from '@/application/chat/errors'
import { proposeFileWrite } from '@/application/chat/proposeFileWrite'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

/** Helper: build a `CreateFileEnvelope` with the given path + content. */
function envelopeWith(
  path: string,
  content = '# hello\n',
): CreateFileEnvelope {
  return { action: 'createFile', path, content }
}

describe('proposeFileWrite', () => {
  describe('happy path — target does not exist', () => {
    it('returns ok with targetExists=false and diff=null when the path is absent from the vault', async () => {
      const ports = fakeModulePorts()
      const envelope = envelopeWith('specs/foo/idea.md')

      const result = await proposeFileWrite(envelope, ports.vault)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.envelope).toBe(envelope)
      expect(result.value.targetExists).toBe(false)
      expect(result.value.diff).toBeNull()
    })

    it('passes the envelope through unchanged (preview.envelope === input.envelope)', async () => {
      const ports = fakeModulePorts()
      const envelope = envelopeWith('specs/x/y.md', 'body')

      const result = await proposeFileWrite(envelope, ports.vault)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Reference equality — the propose path is read-only, no envelope rewrite.
      expect(result.value.envelope).toBe(envelope)
    })
  })

  describe('happy path — target exists', () => {
    it('returns ok with targetExists=true when the path is present in the vault', async () => {
      const ports = fakeModulePorts()
      // Seed the vault through the bridge so any port observes the file.
      await ports.bridge.writeFile('specs/foo/idea.md', 'pre-existing body')
      const envelope = envelopeWith('specs/foo/idea.md', 'new body')

      const result = await proposeFileWrite(envelope, ports.vault)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.targetExists).toBe(true)
      // Increment 1: diff reserved for Increment 2 — must remain null even
      // when the target exists, so the UI prop shape is stable.
      expect(result.value.diff).toBeNull()
    })
  })

  describe('read-only invariant — NFR-ASM-011 (trust-first)', () => {
    it('calls vault.fileExists exactly once with the envelope path', async () => {
      const ports = fakeModulePorts()
      const fileExistsSpy = vi.spyOn(ports.vault, 'fileExists')
      const envelope = envelopeWith('a/b/c.md')

      await proposeFileWrite(envelope, ports.vault)

      expect(fileExistsSpy).toHaveBeenCalledTimes(1)
      expect(fileExistsSpy).toHaveBeenCalledWith('a/b/c.md')
    })

    it('never calls vault.writeFile, createFolder, or deleteFile (trust-first guarantee)', async () => {
      const ports = fakeModulePorts()
      // Seed an existing target BEFORE installing the spies so we cover both
      // targetExists branches without polluting the mutation counters.
      await ports.bridge.writeFile('specs/foo/idea.md', 'seed')

      const writeFileSpy = vi.spyOn(ports.vault, 'writeFile')
      const createFolderSpy = vi.spyOn(ports.vault, 'createFolder')
      const deleteFileSpy = vi.spyOn(ports.vault, 'deleteFile')

      // targetExists=false branch.
      await proposeFileWrite(envelopeWith('specs/bar/idea.md'), ports.vault)
      // targetExists=true branch.
      await proposeFileWrite(envelopeWith('specs/foo/idea.md'), ports.vault)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(createFolderSpy).not.toHaveBeenCalled()
      expect(deleteFileSpy).not.toHaveBeenCalled()
    })

    it('leaves the underlying MockBridge file map unchanged after a propose', async () => {
      const ports = fakeModulePorts()
      const before = await ports.vault.listFiles('specs')

      await proposeFileWrite(envelopeWith('specs/foo/idea.md'), ports.vault)

      const after = await ports.vault.listFiles('specs')
      expect(after).toEqual(before)
    })
  })

  describe('failure path — VaultPort.fileExists throws', () => {
    it('returns err(VaultReadError) wrapping the thrown cause', async () => {
      const ports = fakeModulePorts()
      const cause = new Error('disk on fire')
      vi.spyOn(ports.vault, 'fileExists').mockRejectedValueOnce(cause)
      const envelope = envelopeWith('specs/foo/idea.md')

      const result = await proposeFileWrite(envelope, ports.vault)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBeInstanceOf(VaultReadError)
      expect(result.error.errorCode).toBe('VAULT_READ_FAILED')
      // The original cause is preserved for logging at the call site.
      expect(result.error.cause).toBe(cause)
    })

    it('still does not mutate the vault when fileExists throws', async () => {
      const ports = fakeModulePorts()
      vi.spyOn(ports.vault, 'fileExists').mockRejectedValueOnce(new Error('boom'))
      const writeFileSpy = vi.spyOn(ports.vault, 'writeFile')
      const createFolderSpy = vi.spyOn(ports.vault, 'createFolder')

      await proposeFileWrite(envelopeWith('specs/foo/idea.md'), ports.vault)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(createFolderSpy).not.toHaveBeenCalled()
    })
  })
})
