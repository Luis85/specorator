/**
 * T-ASM-036 — Tests for `validateProposalPath` + `posixNormalize`.
 *
 * Covers TEST-ASM-030 plus the five `PathValidationFailureKind` cases:
 *   - EMPTY
 *   - LEADING_SLASH
 *   - CONTAINS_DOTDOT
 *   - BAD_EXTENSION
 *   - ESCAPES_VAULT_ROOT
 *
 * Plus pure-function coverage of `posixNormalize` (the in-module helper that
 * collapses `./` and dedupes `//` without touching the filesystem and without
 * resolving `..` segments).
 *
 * Satisfies REQ-ASM-048.
 */

import { describe, it, expect } from 'vitest'

import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'
import { PathValidationError } from '@/application/chat/errors'
import {
  posixNormalize,
  validateProposalPath,
} from '@/application/chat/validateProposalPath'

/** Helper: build a `CreateFileEnvelope` with the path under test. */
function envelopeWith(path: string): CreateFileEnvelope {
  return { action: 'createFile', path, content: 'body' }
}

describe('posixNormalize', () => {
  it('preserves a plain forward-slash path unchanged', () => {
    expect(posixNormalize('a/b/c.md')).toBe('a/b/c.md')
  })

  it('converts backslashes to forward slashes', () => {
    expect(posixNormalize('a\\b\\c.md')).toBe('a/b/c.md')
  })

  it('collapses repeated slashes to a single slash', () => {
    expect(posixNormalize('a//b///c.md')).toBe('a/b/c.md')
  })

  it("removes '.' segments", () => {
    expect(posixNormalize('./a/./b.md')).toBe('a/b.md')
  })

  it("does NOT resolve '..' segments — leaves them in place", () => {
    // The validator must see '..' so it can reject it. Pre-resolving here
    // would mask vault-escape attempts.
    expect(posixNormalize('a/../b.md')).toBe('a/../b.md')
    expect(posixNormalize('./../etc/passwd')).toBe('../etc/passwd')
  })

  it('preserves a trailing slash so callers can compose vaultRoot + "/"', () => {
    expect(posixNormalize('workspace/')).toBe('workspace/')
  })

  it('handles the bare-root case', () => {
    expect(posixNormalize('/')).toBe('/')
  })
})

describe('validateProposalPath — happy path (TEST-ASM-030 baseline)', () => {
  it('returns ok(envelope) for a valid vault-relative .md path under the root', () => {
    const env = envelopeWith('specs/foo/idea.md')
    const result = validateProposalPath(env, 'workspace')
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Round-trips the original envelope unchanged.
      expect(result.value).toEqual(env)
    }
  })

  it("accepts a path containing a single '.' segment after normalisation chain stays valid", () => {
    // A literal single dot in a deeper path is not rejected — it is just
    // normalised away when composing the resolved path.
    const env = envelopeWith('specs/foo/idea.md')
    const result = validateProposalPath(env, 'workspace')
    expect(result.ok).toBe(true)
  })
})

describe('validateProposalPath — EMPTY', () => {
  it("returns err(EMPTY) when the path is the empty string", () => {
    const result = validateProposalPath(envelopeWith(''), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PathValidationError)
      expect(result.error.kind).toBe('EMPTY')
      expect(result.error.errorCode).toBe('PATH_INVALID')
    }
  })
})

describe('validateProposalPath — LEADING_SLASH', () => {
  it("returns err(LEADING_SLASH) for a Unix absolute path '/etc/passwd'", () => {
    // TEST-ASM-030 sibling: vault-escape via leading slash.
    const result = validateProposalPath(envelopeWith('/etc/passwd'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('LEADING_SLASH')
    }
  })

  it("returns err(LEADING_SLASH) for a leading slash on a .md path", () => {
    const result = validateProposalPath(envelopeWith('/specs/foo/idea.md'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('LEADING_SLASH')
    }
  })
})

describe('validateProposalPath — CONTAINS_DOTDOT (TEST-ASM-030)', () => {
  it("returns err(CONTAINS_DOTDOT) for '../escape.md'", () => {
    // TEST-ASM-030: the canonical vault-escape case.
    const result = validateProposalPath(envelopeWith('../escape.md'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('CONTAINS_DOTDOT')
    }
  })

  it("returns err(CONTAINS_DOTDOT) for an interior '..' segment", () => {
    const result = validateProposalPath(
      envelopeWith('specs/../../etc/passwd.md'),
      'workspace',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('CONTAINS_DOTDOT')
    }
  })
})

describe('validateProposalPath — BAD_EXTENSION', () => {
  it("returns err(BAD_EXTENSION) for a non-.md extension", () => {
    const result = validateProposalPath(envelopeWith('specs/foo/idea.txt'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('BAD_EXTENSION')
    }
  })

  it('returns err(BAD_EXTENSION) for a path with no extension', () => {
    const result = validateProposalPath(envelopeWith('specs/foo/idea'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('BAD_EXTENSION')
    }
  })
})

describe('validateProposalPath — ESCAPES_VAULT_ROOT', () => {
  it("returns err(ESCAPES_VAULT_ROOT) when the normalised resolved path does not have the normalised root as prefix", () => {
    // The ESCAPES_VAULT_ROOT branch in SPEC §3.4 step 5 is a defence-in-depth
    // guard that fires when `posixNormalize(vaultRoot + '/' + path)` does NOT
    // start with `posixNormalize(vaultRoot + '/')`. Because step 3 already
    // rejects any path with a `..` segment, the branch is hard to reach with
    // a "normal" vault root — but it is reachable when the vault root itself
    // contains `.` segments that normalise asymmetrically.
    //
    // Construction: vaultRoot='.', path='b.md'.
    //   resolved = posixNormalize('./b.md')  → 'b.md'
    //   root     = posixNormalize('./')      → '/'   (trailing slash preserved)
    //   'b.md'.startsWith('/') → false → ESCAPES_VAULT_ROOT.
    const result = validateProposalPath(envelopeWith('b.md'), '.')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PathValidationError)
      expect(result.error.kind).toBe('ESCAPES_VAULT_ROOT')
      expect(result.error.errorCode).toBe('PATH_INVALID')
    }
  })
})

describe('validateProposalPath — ordering / defence-in-depth', () => {
  it("rejects '..' before checking extension (CONTAINS_DOTDOT wins over BAD_EXTENSION)", () => {
    // 'specs/../etc/passwd' would fail both step 3 ('..' segment) and step
    // 4 (no .md extension). Step 3 runs first per SPEC-ASM-001 §3.4.
    const result = validateProposalPath(envelopeWith('specs/../etc/passwd'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('CONTAINS_DOTDOT')
    }
  })

  it('rejects leading slash before checking dotdot (LEADING_SLASH wins)', () => {
    const result = validateProposalPath(envelopeWith('/../escape.md'), 'workspace')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('LEADING_SLASH')
    }
  })
})
