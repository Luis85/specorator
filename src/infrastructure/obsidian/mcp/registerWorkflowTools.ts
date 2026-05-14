import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { FEATURE_STEPS, getAllStepMeta, getStepMeta } from '@/domain/feature/FeatureStep'
import { Slug } from '@/domain/shared/Slug'
import type { AdvanceFeatureStageUseCase } from '@/application/feature/AdvanceFeatureStageUseCase'
import type { FeedbackService } from '@/application/shared/FeedbackService'
import type { ProposalStore } from '../ProposalStore'
import { joinVaultPath, ok } from './shared'

export function registerWorkflowTools(
  mcp: McpServer,
  repo: IFeatureRepository,
  vault: VaultPort,
  store: ProposalStore,
  specsFolder: () => string,
  advanceUseCase: AdvanceFeatureStageUseCase,
  feedback?: FeedbackService,
): void {
  mcp.registerTool(
    'workflow_get_state',
    {
      description: 'Get the full workflow state for a feature by slug',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      return ok(feature.toPlainObject())
    },
  )

  mcp.registerTool(
    'workflow_list_features',
    {
      description: 'List all features with their current stage and title',
      inputSchema: {},
    },
    async () => {
      const features = await repo.findAll()
      return ok({
        features: features.map((f) => ({
          slug: f.slug.toString(),
          stage: f.isComplete ? 'retrospective' : (getStepMeta(f.currentStep)?.slug ?? 'unknown'),
          title: f.title,
        })),
      })
    },
  )

  mcp.registerTool(
    'workflow_get_stage_artifacts',
    {
      description: 'Get all stage artifact files for a feature and their vault existence status',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const stage = feature.isComplete ? 'retrospective' : (getStepMeta(feature.currentStep)?.slug ?? 'unknown')
      const artifacts = await Promise.all(
        getAllStepMeta().map(async (meta) => {
          const path = joinVaultPath(joinVaultPath(specsFolder(), feature.slug.toString()), meta.fileName)
          const exists = await vault.fileExists(path)
          return { slug: meta.slug, path, exists }
        }),
      )
      return ok({ stage, artifacts })
    },
  )

  mcp.registerTool(
    'workflow_get_quality_gates',
    {
      description: 'Get all 12 workflow stage definitions (quality gates) in order',
      inputSchema: {},
    },
    async () => ok({ gates: getAllStepMeta() }),
  )

  mcp.registerTool(
    'workflow_create_artifact',
    {
      description: 'Create a stage artifact file (idempotent, overwrite-safe). Queued for proposal review.',
      inputSchema: {
        slug: z.string().describe('Feature slug'),
        stage: z.string().describe('Stage slug (one of the 12 FEATURE_STEPS)'),
      },
    },
    async ({ slug, stage }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const stageIndex = (FEATURE_STEPS as readonly string[]).indexOf(stage)
      if (stageIndex === -1) throw new Error(`Invalid stage: ${stage}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      // Bind to feature.id (not slug) so a delayed accept cannot retarget a
      // replacement feature that happens to reuse the same slug after delete.
      const featureId = feature.id
      const proposalId = store.queue('workflow_create_artifact', { slug, stage }, async () => {
        const fresh = await repo.findById(featureId)
        if (!fresh) throw new Error(`Feature no longer exists: ${slug}`)
        const result = await repo.createStageFile(fresh, stageIndex + 1)
        if (!result.ok) throw result.error
        // REQ-AVS-005: the repository preserved an existing stage file. Surface
        // a notice so the user knows their handwritten file was kept.
        if (!result.value.created) {
          const meta = getStepMeta(stageIndex + 1)
          if (meta !== undefined) {
            feedback?.info(
              `Specorator: ${meta.slug}.md already exists — keeping your version.`,
            )
          }
        }
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'workflow_propose_advance',
    {
      description: 'Advance a feature to the next workflow stage. Queued for proposal review.',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const featureId = feature.id
      const proposalId = store.queue('workflow_propose_advance', { slug }, async () => {
        const result = await advanceUseCase.execute({ featureId })
        if (!result.ok) throw result.error
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}
