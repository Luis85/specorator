/**
 * Stage-aware system-prompt helpers for the agent side-panel.
 *
 * Exports:
 *  - getActiveFeatureSlug — pure, extracts <slug> from `<specsFolder>/<slug>/...`
 *  - WorkflowStateSnapshot — minimal frontmatter projection (REQ-ASM-012)
 *  - loadWorkflowStateSnapshot — reads + parses `workflow-state.md` via VaultPort;
 *      never throws; warns once on any failure (REQ-ASM-012, REQ-ASM-015)
 *  - assembleSystemPrompt — pure; builds the stage preamble forwarded to the
 *      CLI via `--append-system-prompt` (T-ASM-030; REQ-ASM-013, REQ-ASM-014,
 *      REQ-ASM-016, REQ-ASM-018, REQ-ASM-019, REQ-ASM-020).
 *
 * Satisfies T-ASM-026 + T-ASM-030.
 * Spec: specs/agent-sidepanel-mvp/spec.md §3.2 + §6.2.
 */
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep'
import { parseWorkflowStateFrontmatter } from '@/infrastructure/workflow-state/WorkflowStateDocument'
import { tryAsync } from '@/domain/shared/tryAsync'
import type { StagePromptMap } from '@/application/chat/stagePromptMap'

/**
 * Minimal projection of `workflow-state.md` consumed by `assembleSystemPrompt`.
 *
 * NOTE: per spec §6.2, `feature` carries the slug (not the human-readable title).
 * The name is preserved from the upstream specification.
 */
export interface WorkflowStateSnapshot {
  readonly feature: string
  /**
   * Stage slug. Typically a {@link FEATURE_STEPS} member, but typed as
   * `string` so non-canonical slugs from out-of-tree templates pass through
   * unmodified (REQ-ASM-012 — tolerant projection).
   */
  readonly stage: string
  readonly status: string
}

/**
 * Returns the feature slug for an active editor path under `<specsFolder>/`.
 *
 * Pure. Returns `null` when:
 *  - the path is `null`,
 *  - the path is not under `<specsFolder>/`,
 *  - the path has no slug segment (e.g. `specs/`, `specs/README.md`).
 *
 * Normalises a single leading slash and a trailing slash on `specsFolder`.
 */
export function getActiveFeatureSlug(
  activeFilePath: string | null,
  specsFolder: string,
): string | null {
  if (activeFilePath === null) return null

  const normalisedPath = activeFilePath.startsWith('/')
    ? activeFilePath.slice(1)
    : activeFilePath
  const normalisedFolder = specsFolder.endsWith('/')
    ? specsFolder.slice(0, -1)
    : specsFolder

  const prefix = `${normalisedFolder}/`
  if (!normalisedPath.startsWith(prefix)) return null

  const remainder = normalisedPath.slice(prefix.length)
  const slashIdx = remainder.indexOf('/')
  if (slashIdx <= 0) return null

  return remainder.slice(0, slashIdx)
}

/**
 * Reads `<specsFolder>/<feature>/workflow-state.md` via VaultPort, parses the
 * YAML frontmatter, and returns a snapshot. Returns `null` and warns exactly
 * once on any read or parse failure (REQ-ASM-015). Never throws.
 *
 * Reuses the canonical parser in `WorkflowStateDocument.deserializeWorkflowState`
 * — does not duplicate YAML parsing.
 */
export async function loadWorkflowStateSnapshot(
  feature: string,
  vault: VaultPort,
  logger: LoggerPort,
  specsFolder: string,
): Promise<WorkflowStateSnapshot | null> {
  const folder = specsFolder.endsWith('/') ? specsFolder.slice(0, -1) : specsFolder
  const path = `${folder}/${feature}/workflow-state.md`

  const readResult = await tryAsync(() => vault.readFile(path))
  if (!readResult.ok) {
    logger.warn('loadWorkflowStateSnapshot: failed to read workflow-state', {
      path,
      feature,
      error: readResult.error.message,
    })
    return null
  }

  const frontmatter = parseWorkflowStateFrontmatter(readResult.value)
  const slug = frontmatter.slug
  const status = frontmatter.status
  const stage = resolveStage(frontmatter)

  if (
    slug === undefined ||
    slug === '' ||
    status === undefined ||
    status === '' ||
    stage === null
  ) {
    logger.warn('loadWorkflowStateSnapshot: malformed workflow-state frontmatter', {
      path,
      feature,
    })
    return null
  }

  return { feature: slug, stage, status }
}

/**
 * Default upper bound on the assembled preamble length (REQ-ASM-020). The cap
 * protects the CLI subprocess argv from accidentally ballooning when a stage
 * description grows beyond expectations.
 */
const DEFAULT_MAX_CHARS = 2_000

/**
 * Builds the stage-aware preamble forwarded to the CLI via
 * `--append-system-prompt` (REQ-ASM-013). Pure — no I/O, no caching, no
 * dependency on `VaultPort` or `LoggerPort`. Recomputed on every send so a
 * stage change between sends is reflected without invalidation (REQ-ASM-019).
 *
 * Algorithm (spec §3.2 steps 1–7):
 *  1. `snapshot === null` → return `''` (REQ-ASM-014; caller omits the argv
 *     flag entirely when the result is empty).
 *  2. `descriptor = stageMap.get(snapshot.stage)`.
 *  3. `descriptor === null` → return `''` (unknown stage; REQ-ASM-015
 *     graceful fallback).
 *  4. Compose the body from `feature` + `displayName` + `oneLineDescription`.
 *     Reads only those three fields — no other snapshot or workflow-state
 *     content reaches the body (REQ-ASM-016).
 *  5. If `body.length <= maxChars` → return `body`.
 *  6. Sentence-boundary trim: `body.lastIndexOf('. ', maxChars - 1)`. If a
 *     boundary exists → slice up to and including the period.
 *  7. Otherwise → hard slice at `maxChars` (REQ-ASM-020).
 */
export function assembleSystemPrompt(
  snapshot: WorkflowStateSnapshot | null,
  stageMap: StagePromptMap,
  options?: { readonly maxChars?: number },
): string {
  if (snapshot === null) return ''

  const descriptor = stageMap.get(snapshot.stage)
  if (descriptor === null) return ''

  const body =
    `You are assisting with feature "${snapshot.feature}" at the ` +
    `"${descriptor.displayName}" stage.\n${descriptor.oneLineDescription}`

  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS
  if (body.length <= maxChars) return body

  const boundary = body.lastIndexOf('. ', maxChars - 1)
  if (boundary >= 0) return body.slice(0, boundary + 1)

  return body.slice(0, maxChars)
}

/**
 * Resolves the snapshot's `stage` value from frontmatter. Prefers the explicit
 * `current_stage` key; falls back to `FEATURE_STEPS[currentStep-1]` when
 * `currentStep` is a valid integer. Returns `null` when neither path yields
 * a usable stage slug.
 */
function resolveStage(
  frontmatter: Partial<Record<string, string>>,
): string | null {
  const explicit = frontmatter.current_stage
  if (explicit !== undefined && explicit !== '') return explicit

  const stepRaw = frontmatter.currentStep
  if (stepRaw === undefined) return null
  const step = Number.parseInt(stepRaw, 10)
  if (!Number.isInteger(step) || step < 1 || step > FEATURE_STEPS.length) return null
  return FEATURE_STEPS[step - 1]
}
