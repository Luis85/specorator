/**
 * T-ASM-044 — Tests for `resolveSessionLogPath`.
 *
 * Covers TEST-ASM-031:
 *   - Active feature → `<specsFolder>/<feature>/sessions/<sessionId>.md`.
 *   - Null feature → `.specorator/sessions/<sessionId>.md`.
 *   - `specsFolder` other than `'specs'` is honoured.
 *
 * Pure function under test: no I/O, no `obsidian` imports, deterministic.
 *
 * Satisfies REQ-ASM-032 (per SPEC-ASM-001 §6.7 and ADR-0031).
 */

import { describe, it, expect } from 'vitest'

import { resolveSessionLogPath } from '@/application/chat/sessionLogPath'

describe('resolveSessionLogPath', () => {
  describe('active-feature branch', () => {
    it('returns <specsFolder>/<feature>/sessions/<sessionId>.md when a feature is active', () => {
      // TEST-ASM-031 — active-feature case.
      expect(resolveSessionLogPath('foo', 'abc', 'specs')).toBe(
        'specs/foo/sessions/abc.md',
      )
    })

    it('honours a custom specsFolder name', () => {
      // TEST-ASM-031 — `specsFolder` other than `'specs'`.
      expect(resolveSessionLogPath('foo', 'abc', 'features')).toBe(
        'features/foo/sessions/abc.md',
      )
    })

    it('handles slugs and session ids that contain hyphens', () => {
      expect(
        resolveSessionLogPath(
          'agent-sidepanel-mvp',
          '550e8400-e29b-41d4-a716-446655440000',
          'specs',
        ),
      ).toBe(
        'specs/agent-sidepanel-mvp/sessions/550e8400-e29b-41d4-a716-446655440000.md',
      )
    })
  })

  describe('no-feature fallback branch', () => {
    it('returns .specorator/sessions/<sessionId>.md when feature is null', () => {
      // TEST-ASM-031 — fallback branch (R-ASM-005 mitigation; ADR-0031 layer 2).
      expect(resolveSessionLogPath(null, 'abc', 'specs')).toBe(
        '.specorator/sessions/abc.md',
      )
    })

    it('ignores specsFolder when feature is null (fallback path is vault-root anchored)', () => {
      // The fallback path is `.specorator/sessions/...` regardless of how the
      // user configured `specsFolder`. REQ-ASM-032 statement is explicit: the
      // fallback is at the vault root, not under specsFolder.
      expect(resolveSessionLogPath(null, 'abc', 'features')).toBe(
        '.specorator/sessions/abc.md',
      )
      expect(resolveSessionLogPath(null, 'abc', 'anything-else')).toBe(
        '.specorator/sessions/abc.md',
      )
    })
  })

  describe('purity', () => {
    it('returns the same output for the same inputs (no hidden state)', () => {
      const a = resolveSessionLogPath('foo', 'abc', 'specs')
      const b = resolveSessionLogPath('foo', 'abc', 'specs')
      const c = resolveSessionLogPath(null, 'abc', 'specs')
      const d = resolveSessionLogPath(null, 'abc', 'specs')
      expect(a).toBe(b)
      expect(c).toBe(d)
    })
  })
})
