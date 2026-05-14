/**
 * T-ASM-027 — Tests for buildStagePromptMap().
 * Satisfies REQ-ASM-017.
 *
 * Spec source: specs/agent-sidepanel-mvp/spec.md §2.11.
 *   export interface StageDescriptor {
 *     readonly displayName: string
 *     readonly oneLineDescription: string
 *   }
 *   export interface StagePromptMap {
 *     get(slug: FeatureStepSlug | string): StageDescriptor | null
 *   }
 *   export function buildStagePromptMap(): StagePromptMap
 *
 * buildStagePromptMap() is the single source of stage descriptions. It
 * iterates FEATURE_STEPS and pairs each slug with a one-sentence description
 * maintained in the same module. No stage descriptions are hard-coded inside
 * assembleSystemPrompt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildStagePromptMap } from '@/application/chat/stagePromptMap'
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep'

describe('REQ-ASM-017: buildStagePromptMap()', () => {
  it('returns a descriptor for every canonical FEATURE_STEPS slug', () => {
    const map = buildStagePromptMap()

    for (const slug of FEATURE_STEPS) {
      const descriptor = map.get(slug)
      expect(descriptor, `missing descriptor for slug "${slug}"`).not.toBeNull()
    }
  })

  it('every descriptor has a non-empty displayName and oneLineDescription', () => {
    const map = buildStagePromptMap()

    for (const slug of FEATURE_STEPS) {
      const descriptor = map.get(slug)
      expect(descriptor).not.toBeNull()
      expect(typeof descriptor?.displayName).toBe('string')
      expect(descriptor?.displayName.length).toBeGreaterThan(0)
      expect(typeof descriptor?.oneLineDescription).toBe('string')
      expect(descriptor?.oneLineDescription.length).toBeGreaterThan(0)
    }
  })

  it('returns null for a slug that is not a known FEATURE_STEPS member', () => {
    const map = buildStagePromptMap()

    expect(map.get('not-a-real-stage')).toBeNull()
    expect(map.get('')).toBeNull()
    expect(map.get('IDEA')).toBeNull() // case-sensitive
    expect(map.get('idea ')).toBeNull() // trailing whitespace
  })

  it('descriptors are stable across calls (same content for the same slug)', () => {
    const a = buildStagePromptMap()
    const b = buildStagePromptMap()

    for (const slug of FEATURE_STEPS) {
      expect(a.get(slug)).toEqual(b.get(slug))
    }
  })

  it('descriptor objects are frozen and cannot be mutated', () => {
    const map = buildStagePromptMap()
    const descriptor = map.get('idea')
    expect(descriptor).not.toBeNull()

    expect(Object.isFrozen(descriptor)).toBe(true)
  })

  it('one-line descriptions stay on a single line (no embedded newlines)', () => {
    const map = buildStagePromptMap()

    for (const slug of FEATURE_STEPS) {
      const descriptor = map.get(slug)
      expect(descriptor?.oneLineDescription).not.toMatch(/\n/)
    }
  })

  it('static-import audit: stagePromptMap.ts imports FEATURE_STEPS from FeatureStep.ts', () => {
    // REQ-ASM-017 — no hard-coded stage-name string literals outside the
    // descriptor table; the module's source of truth for slugs is
    // FEATURE_STEPS imported from the domain.
    const source = readFileSync(
      resolve(__dirname, '../../../src/application/chat/stagePromptMap.ts'),
      'utf8',
    )

    expect(source).toMatch(
      /import\s*\{[^}]*\bFEATURE_STEPS\b[^}]*\}\s*from\s*['"]@\/domain\/feature\/FeatureStep['"]/,
    )
  })

  it('static-import audit: no stage-name string literals appear outside the descriptor table', () => {
    // Heuristic: canonical stage slugs may appear only as object-literal keys
    // in the descriptor table (either bare shorthand like `idea:` or quoted
    // when the slug contains a hyphen like `'implementation-log':`). They
    // must NEVER appear as standalone string-literal values — that would be
    // a hard-coded reference bypassing the FEATURE_STEPS source of truth.
    const source = readFileSync(
      resolve(__dirname, '../../../src/application/chat/stagePromptMap.ts'),
      'utf8',
    )

    for (const slug of FEATURE_STEPS) {
      // Match quoted slug NOT immediately followed by `:` (i.e. not used as
      // an object key). E.g. allow `'implementation-log':` but reject
      // `'implementation-log'` appearing alone as a value or argument.
      const valueOccurrence = new RegExp(`['"\`]${slug}['"\`](?!\\s*:)`)
      expect(
        source,
        `stagePromptMap.ts must not hard-code "${slug}" as a string-literal value`,
      ).not.toMatch(valueOccurrence)
    }
  })
})
