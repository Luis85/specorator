/**
 * T-ASM-024 — Tests for getActiveFeatureSlug() pure helper.
 * Satisfies REQ-ASM-011 (TEST-ASM-018).
 *
 * Spec source: specs/agent-sidepanel-mvp/spec.md §6.2.
 *   getActiveFeatureSlug(activeFilePath: string | null, specsFolder: string): string | null
 *   Pure. Matches ^<specsFolder>/([^/]+)/ and returns the slug; null otherwise.
 */
import { describe, it, expect } from 'vitest'
import { getActiveFeatureSlug } from '@/application/chat/assembleSystemPrompt'

describe('REQ-ASM-011: getActiveFeatureSlug()', () => {
  // TEST-ASM-018 case 1
  it('returns null when activeFilePath is null', () => {
    expect(getActiveFeatureSlug(null, 'specs')).toBeNull()
  })

  // TEST-ASM-018 case 2
  it('returns null when the active file is not under specs/', () => {
    expect(getActiveFeatureSlug('README.md', 'specs')).toBeNull()
  })

  it('returns null when the path starts with something other than the specsFolder', () => {
    expect(getActiveFeatureSlug('docs/foo/idea.md', 'specs')).toBeNull()
  })

  // TEST-ASM-018 case 3 — workflow-state.md
  it('returns the slug for specs/<slug>/workflow-state.md', () => {
    expect(getActiveFeatureSlug('specs/foo/workflow-state.md', 'specs')).toBe('foo')
  })

  // TEST-ASM-018 case 4 — any stage file
  it('returns the slug for specs/<slug>/idea.md', () => {
    expect(getActiveFeatureSlug('specs/foo/idea.md', 'specs')).toBe('foo')
  })

  // TEST-ASM-018 case 5 — nested folders under the feature
  it('returns the slug when the active file is in a nested sub-folder under specs/<slug>/', () => {
    expect(getActiveFeatureSlug('specs/foo/sub/bar.md', 'specs')).toBe('foo')
  })

  // TEST-ASM-018 case 6 — leading-slash normalisation
  it('normalises a leading slash and still returns the slug', () => {
    expect(getActiveFeatureSlug('/specs/foo/idea.md', 'specs')).toBe('foo')
  })

  // TEST-ASM-018 case 7 — non-matching configurable specsFolder setting
  it('honours a custom specsFolder setting and returns null when the prefix does not match', () => {
    expect(getActiveFeatureSlug('specs/foo/idea.md', 'features')).toBeNull()
  })

  it('honours a custom specsFolder setting and returns the slug when the prefix matches', () => {
    expect(getActiveFeatureSlug('features/foo/idea.md', 'features')).toBe('foo')
  })

  it('returns null when the path is exactly the specs folder (no slug segment)', () => {
    expect(getActiveFeatureSlug('specs/', 'specs')).toBeNull()
  })

  it('returns null for a bare file directly inside specs/ (no slug folder)', () => {
    expect(getActiveFeatureSlug('specs/README.md', 'specs')).toBeNull()
  })

  it('treats a trailing slash on specsFolder as the same prefix', () => {
    expect(getActiveFeatureSlug('specs/foo/idea.md', 'specs/')).toBe('foo')
  })
})
