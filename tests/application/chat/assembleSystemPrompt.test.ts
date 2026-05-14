/**
 * T-ASM-029 — Tests for assembleSystemPrompt().
 *
 * Satisfies:
 *  - REQ-ASM-013 (TEST-ASM-020): preamble contains slug + display name + one-line description.
 *  - REQ-ASM-014 (TEST-ASM-021): null snapshot → '' (caller omits --append-system-prompt).
 *  - REQ-ASM-016 (TEST-ASM-023): raw workflow-state body never reaches assembled string.
 *  - REQ-ASM-018: transport-agnostic — function operates on plain snapshot + map only.
 *  - REQ-ASM-019 (TEST-ASM-024): recomputed every call, no caching across calls.
 *  - REQ-ASM-020 (TEST-ASM-025): output capped at 2 000 chars, ends at sentence boundary.
 *
 * Spec source: specs/agent-sidepanel-mvp/spec.md §3.2.
 *   export function assembleSystemPrompt(
 *     snapshot: WorkflowStateSnapshot | null,
 *     stageMap: StagePromptMap,
 *     options?: { readonly maxChars?: number },
 *   ): string
 *
 * Algorithm (§3.2 steps 1–7):
 *   1. snapshot === null → return ''.
 *   2. descriptor = stageMap.get(snapshot.stage).
 *   3. descriptor === null → return '' (unknown stage).
 *   4. body = `You are assisting with feature "<feature>" at the "<displayName>" stage.\n<oneLineDescription>`.
 *   5. body.length <= maxChars → return body.
 *   6. boundary = body.lastIndexOf('. ', maxChars - 1); boundary >= 0 → slice(0, boundary + 1).
 *   7. otherwise → slice(0, maxChars).
 */
import { describe, it, expect } from 'vitest'
import {
  assembleSystemPrompt,
  type WorkflowStateSnapshot,
} from '@/application/chat/assembleSystemPrompt'
import {
  buildStagePromptMap,
  type StageDescriptor,
  type StagePromptMap,
} from '@/application/chat/stagePromptMap'

const snapshot = (overrides: Partial<WorkflowStateSnapshot> = {}): WorkflowStateSnapshot => ({
  feature: 'agent-sidepanel-mvp',
  stage: 'idea',
  status: 'in-progress',
  ...overrides,
})

/**
 * Builds a stage map with a single descriptor for the requested slug; everything
 * else returns null. Useful for tightly-scoped tests that need to verify the
 * exact descriptor that flows into the assembled body.
 */
const stubMap = (slug: string, descriptor: StageDescriptor): StagePromptMap => ({
  get: (s: string) => (s === slug ? descriptor : null),
})

describe('REQ-ASM-013 / TEST-ASM-020: assembleSystemPrompt() with a snapshot', () => {
  it('returns a string containing feature slug, display name, and one-line description', () => {
    const map = stubMap('idea', {
      displayName: 'Idea',
      oneLineDescription: 'Helping the user shape a raw feature idea.',
    })

    const result = assembleSystemPrompt(snapshot({ feature: 'my-feature', stage: 'idea' }), map)

    expect(result).toContain('my-feature')
    expect(result).toContain('Idea')
    expect(result).toContain('Helping the user shape a raw feature idea.')
  })

  it('works for every canonical FEATURE_STEPS slug via buildStagePromptMap()', () => {
    const map = buildStagePromptMap()
    const slugs = [
      'idea',
      'research',
      'requirements',
      'design',
      'spec',
      'tasks',
      'implementation-log',
      'test-plan',
      'test-report',
      'review',
      'release-notes',
      'retrospective',
    ] as const

    for (const slug of slugs) {
      const descriptor = map.get(slug)
      expect(descriptor, `missing descriptor for ${slug}`).not.toBeNull()

      const result = assembleSystemPrompt(snapshot({ feature: 'demo', stage: slug }), map)

      expect(result).toContain('demo')
      expect(result).toContain(descriptor!.displayName)
      expect(result).toContain(descriptor!.oneLineDescription)
    }
  })

  it('uses the spec-defined body layout (feature, then stage display name, then description)', () => {
    const map = stubMap('design', {
      displayName: 'Design',
      oneLineDescription: 'Description sentence.',
    })

    const result = assembleSystemPrompt(snapshot({ feature: 'foo', stage: 'design' }), map)

    const featureIdx = result.indexOf('foo')
    const stageIdx = result.indexOf('Design')
    const descIdx = result.indexOf('Description sentence.')
    expect(featureIdx).toBeGreaterThanOrEqual(0)
    expect(stageIdx).toBeGreaterThan(featureIdx)
    expect(descIdx).toBeGreaterThan(stageIdx)
  })
})

describe('REQ-ASM-014 / TEST-ASM-021: null snapshot', () => {
  it("returns '' when snapshot is null", () => {
    const map = buildStagePromptMap()
    expect(assembleSystemPrompt(null, map)).toBe('')
  })

  it('returns an empty string (not null/undefined) so caller can length-check before pushing argv', () => {
    const map = buildStagePromptMap()
    const result = assembleSystemPrompt(null, map)
    expect(typeof result).toBe('string')
    expect(result.length).toBe(0)
  })
})

describe('REQ-ASM-015 fallback: unknown stage slug', () => {
  it("returns '' when stageMap.get(snapshot.stage) returns null", () => {
    const map = buildStagePromptMap()
    const result = assembleSystemPrompt(
      snapshot({ stage: 'not-a-real-stage' }),
      map,
    )
    expect(result).toBe('')
  })

  it("returns '' for a snapshot whose stage is the empty string", () => {
    const map = buildStagePromptMap()
    const result = assembleSystemPrompt(snapshot({ stage: '' }), map)
    expect(result).toBe('')
  })
})

describe('REQ-ASM-016 / TEST-ASM-023: raw workflow-state body never reaches preamble', () => {
  it('does not leak secret-shaped strings stored in workflow-state.md', () => {
    // The assembler reads only `feature`, `stage`, and the static descriptor.
    // Even if a snapshot's `status` field carried "TopSecret", that field must
    // not surface in the assembled preamble.
    const map = buildStagePromptMap()
    const snap = snapshot({
      feature: 'safe-slug',
      stage: 'idea',
      status: 'TopSecret',
    })

    const result = assembleSystemPrompt(snap, map)

    expect(result).not.toContain('TopSecret')
    expect(result).not.toContain('status')
  })

  it('reads only feature + stage + descriptor — no extra snapshot properties bleed through', () => {
    // A snapshot constructed with an extra (off-contract) property MUST NOT
    // contribute to the preamble. We cast through `unknown` to add an extra
    // property without violating the readonly contract at the call site.
    const map = buildStagePromptMap()
    const snap = {
      ...snapshot({ feature: 'visible-feature', stage: 'idea' }),
      secretField: 'NEVER_EXFILTRATE_ME',
    } as unknown as WorkflowStateSnapshot

    const result = assembleSystemPrompt(snap, map)
    expect(result).not.toContain('NEVER_EXFILTRATE_ME')
    expect(result).not.toContain('secretField')
  })
})

describe('REQ-ASM-018: transport-agnostic — pure function', () => {
  it('same inputs produce identical output across repeated calls', () => {
    const map = buildStagePromptMap()
    const snap = snapshot({ feature: 'demo', stage: 'requirements' })

    const a = assembleSystemPrompt(snap, map)
    const b = assembleSystemPrompt(snap, map)
    expect(a).toBe(b)
  })

  it('does not mutate the snapshot, the map, or the options object', () => {
    const map = buildStagePromptMap()
    const snap = snapshot({ feature: 'demo', stage: 'idea' })
    const options = { maxChars: 100 } as const
    const snapCopy = { ...snap }
    const optionsCopy = { ...options }

    assembleSystemPrompt(snap, map, options)

    expect(snap).toEqual(snapCopy)
    expect(options).toEqual(optionsCopy)
  })
})

describe('REQ-ASM-019 / TEST-ASM-024: recomputed every call, no caching', () => {
  it('reflects a stage change between two sends', () => {
    const map = buildStagePromptMap()

    const first = assembleSystemPrompt(
      snapshot({ feature: 'feat', stage: 'idea' }),
      map,
    )
    const second = assembleSystemPrompt(
      snapshot({ feature: 'feat', stage: 'design' }),
      map,
    )

    expect(first).toContain('Idea')
    expect(first).not.toContain('Design')
    expect(second).toContain('Design')
    expect(second).not.toContain('Idea')
  })

  it('reflects a feature change between two sends', () => {
    const map = buildStagePromptMap()

    const a = assembleSystemPrompt(snapshot({ feature: 'alpha', stage: 'idea' }), map)
    const b = assembleSystemPrompt(snapshot({ feature: 'bravo', stage: 'idea' }), map)

    expect(a).toContain('alpha')
    expect(a).not.toContain('bravo')
    expect(b).toContain('bravo')
    expect(b).not.toContain('alpha')
  })
})

describe('REQ-ASM-020 / TEST-ASM-025: maxChars cap with sentence-boundary trim', () => {
  it('returns the full body when length <= maxChars (default 2 000)', () => {
    const map = stubMap('idea', {
      displayName: 'Idea',
      oneLineDescription: 'Short description.',
    })
    const result = assembleSystemPrompt(snapshot({ stage: 'idea' }), map)
    // Default cap is 2_000; the body here is well under that.
    expect(result.length).toBeLessThanOrEqual(2_000)
    expect(result).toContain('Short description.')
  })

  it('caps a 5 000-char synthetic description at <= 2 000 chars, ending at a sentence boundary', () => {
    // Build a 5 000-char description composed of sentences ending in `. ` so a
    // boundary is reachable. Use a repeating chunk that is small enough to
    // guarantee at least one `. ` lands inside the first 2 000 chars.
    const sentence = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '
    let bigDesc = ''
    while (bigDesc.length < 5_000) bigDesc += sentence
    bigDesc = bigDesc.slice(0, 5_000)

    const map = stubMap('idea', {
      displayName: 'Idea',
      oneLineDescription: bigDesc,
    })

    const result = assembleSystemPrompt(snapshot({ stage: 'idea' }), map)

    expect(result.length).toBeLessThanOrEqual(2_000)
    // Sentence boundary: the trimmed body ends with `.` (i.e. boundary + 1
    // lands just after the period, before the trailing space).
    expect(result.endsWith('.')).toBe(true)
  })

  it('respects a custom maxChars option', () => {
    const map = stubMap('idea', {
      displayName: 'Idea',
      oneLineDescription:
        'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.',
    })

    const result = assembleSystemPrompt(snapshot({ stage: 'idea' }), map, { maxChars: 120 })

    expect(result.length).toBeLessThanOrEqual(120)
    // Still ends at a sentence boundary when one exists within the cap.
    expect(result.endsWith('.')).toBe(true)
  })

  it('falls back to a hard slice when no sentence boundary exists within maxChars', () => {
    // No `. ` in the description → step 7 (hard slice) applies.
    const noBoundary = 'a'.repeat(5_000)
    const map = stubMap('idea', {
      displayName: 'Idea',
      oneLineDescription: noBoundary,
    })

    const result = assembleSystemPrompt(snapshot({ stage: 'idea' }), map, { maxChars: 100 })

    expect(result.length).toBe(100)
  })
})
