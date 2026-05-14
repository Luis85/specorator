/**
 * StagePromptMap — one-line descriptions for every canonical workflow stage.
 *
 * Satisfies T-ASM-028 (REQ-ASM-017). The single source of stage descriptions
 * consumed by `assembleSystemPrompt`; no descriptions are hard-coded inside
 * the assembler itself.
 *
 * Spec: specs/agent-sidepanel-mvp/spec.md §2.11 + §6.2.
 *
 * Slugs are sourced from `FEATURE_STEPS` (the domain's canonical list); this
 * module pairs each slug with a `StageDescriptor`. Unknown slugs return
 * `null` so the assembler can degrade gracefully when an out-of-tree
 * workflow-state.md carries a non-canonical stage value.
 */
import { FEATURE_STEPS, type FeatureStepSlug } from '@/domain/feature/FeatureStep'

export interface StageDescriptor {
  readonly displayName: string
  readonly oneLineDescription: string
}

export interface StagePromptMap {
  /**
   * Returns `null` when `slug` is not a known FEATURE_STEPS member.
   *
   * The parameter type is the documented `FeatureStepSlug | string` from
   * spec §2.11 — `FeatureStepSlug` is for autocompletion on canonical slugs,
   * `string` makes the tolerant out-of-tree-slug branch explicit at the
   * call site. TS collapses the union to `string` at runtime; the eslint
   * disable below preserves the spec-mandated signature.
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- spec §2.11 mandates `FeatureStepSlug | string` for self-documenting API surface
  get(slug: FeatureStepSlug | string): StageDescriptor | null
}

/**
 * Descriptor table — one entry per `FeatureStepSlug`. Object-key shorthand is
 * deliberate: the static-import audit (T-ASM-027) forbids canonical slugs as
 * quoted string literals anywhere in this module, so the bare keys here are
 * the only allowed in-source mention of each slug.
 */
const DESCRIPTORS: Readonly<Record<FeatureStepSlug, StageDescriptor>> = Object.freeze({
  idea: Object.freeze({
    displayName: 'Idea',
    oneLineDescription:
      'Helping the user shape a raw feature idea: clarify intent, primary users, and constraints.',
  }),
  research: Object.freeze({
    displayName: 'Research',
    oneLineDescription:
      'Helping the user investigate prior art, technical constraints, and trade-offs before committing to a direction.',
  }),
  requirements: Object.freeze({
    displayName: 'Requirements',
    oneLineDescription:
      'Helping the user write EARS-style functional and non-functional requirements that map 1:1 to tests.',
  }),
  design: Object.freeze({
    displayName: 'Design',
    oneLineDescription:
      'Helping the user produce the architectural and UX design that satisfies the accepted requirements.',
  }),
  spec: Object.freeze({
    displayName: 'Specification',
    oneLineDescription:
      'Helping the user turn the design into a precise, implementation-ready specification with explicit interfaces.',
  }),
  tasks: Object.freeze({
    displayName: 'Tasks',
    oneLineDescription:
      'Helping the user decompose the spec into the smallest verifiable, dependency-ordered tasks.',
  }),
  'implementation-log': Object.freeze({
    displayName: 'Implementation Log',
    oneLineDescription:
      'Helping the user record build progress, decisions, and deviations encountered while implementing the tasks.',
  }),
  'test-plan': Object.freeze({
    displayName: 'Test Plan',
    oneLineDescription:
      'Helping the user define the test strategy and matrix that verifies every requirement.',
  }),
  'test-report': Object.freeze({
    displayName: 'Test Report',
    oneLineDescription:
      'Helping the user summarise test execution results, coverage, and any outstanding defects.',
  }),
  review: Object.freeze({
    displayName: 'Review',
    oneLineDescription:
      'Helping the user perform a final review against requirements, quality gates, and traceability.',
  }),
  'release-notes': Object.freeze({
    displayName: 'Release Notes',
    oneLineDescription:
      'Helping the user draft user-facing release notes covering what changed and why it matters.',
  }),
  retrospective: Object.freeze({
    displayName: 'Retrospective',
    oneLineDescription:
      'Helping the user capture lessons learned and improvements to feed back into the workflow.',
  }),
})

/**
 * Compile-time guard: the descriptor table must cover every `FeatureStepSlug`.
 * If `FEATURE_STEPS` grows, this assignment fails type-check until a matching
 * descriptor is added above.
 */
const _exhaustiveness: Readonly<Record<FeatureStepSlug, StageDescriptor>> = DESCRIPTORS
void _exhaustiveness

const KNOWN_SLUGS: ReadonlySet<string> = new Set<string>(FEATURE_STEPS)

/**
 * Returns the canonical {@link StagePromptMap}. The map is closed: only slugs
 * present in {@link FEATURE_STEPS} resolve; everything else returns `null`.
 *
 * Implementation note: the returned object is recreated on each call (the
 * `get` closure is fresh), but the underlying descriptor table is a frozen
 * module-level singleton, so the descriptors themselves are referentially
 * stable across calls.
 */
export function buildStagePromptMap(): StagePromptMap {
  return {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- spec §2.11 mandates `FeatureStepSlug | string` for self-documenting API surface
    get(slug: FeatureStepSlug | string): StageDescriptor | null {
      if (!KNOWN_SLUGS.has(slug)) return null
      return DESCRIPTORS[slug as FeatureStepSlug]
    },
  }
}
