/**
 * Stage-aware system-prompt helpers for the agent side-panel.
 *
 * Exports:
 *  - getActiveFeatureSlug — pure, extracts <slug> from `<specsFolder>/<slug>/...`
 *  - WorkflowStateSnapshot — minimal frontmatter projection (REQ-ASM-012)
 *  - loadWorkflowStateSnapshot — reads + parses `workflow-state.md` via VaultPort;
 *      never throws; warns once on any failure (REQ-ASM-012, REQ-ASM-015)
 *
 * Satisfies T-ASM-026 (REQ-ASM-011, REQ-ASM-012, REQ-ASM-015).
 * Spec: specs/agent-sidepanel-mvp/spec.md §6.2.
 */
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep'
import { parseWorkflowStateFrontmatter } from '@/infrastructure/workflow-state/WorkflowStateDocument'
import { tryAsync } from '@/domain/shared/tryAsync'

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
