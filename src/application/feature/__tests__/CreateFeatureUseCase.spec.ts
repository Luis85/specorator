import { describe, it, expect, beforeEach } from 'vitest'
import { CreateFeatureUseCase } from '../CreateFeatureUseCase'
import { AdvanceFeatureStageUseCase } from '../AdvanceFeatureStageUseCase'
import { ActivateFeatureUseCase } from '../ActivateFeatureUseCase'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'

function makeRepo(bridge: MockBridge) {
  return new FeatureRepository(bridge, DEFAULT_SETTINGS)
}
function makeUseCase(bridge: MockBridge) {
  return new CreateFeatureUseCase(makeRepo(bridge))
}

describe('CreateFeatureUseCase', () => {
  let bridge: MockBridge

  beforeEach(() => {
    bridge = new MockBridge()
  })

  it('creates a feature and persists workflow-state.md', async () => {
    const useCase = makeUseCase(bridge)
    const result = await useCase.execute({ title: 'Dark mode' })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.title).toBe('Dark mode')
    expect(result.value.status).toBe('draft')
    expect(result.value.slug.toString()).toBe('dark-mode')

    const files = bridge.getAllFiles()
    const metaPath = 'specs/dark-mode/workflow-state.md'
    expect(metaPath in files).toBe(true)
    const meta = files[metaPath]
    expect(meta).toContain('feature: "Dark mode"')
    expect(meta).not.toContain('title:')
  })

  it('writes the full artifacts block map (not an empty list)', async () => {
    const result = await makeUseCase(bridge).execute({ title: 'Dark mode' })
    expect(result.ok).toBe(true)

    const meta = bridge.getAllFiles()['specs/dark-mode/workflow-state.md']
    expect(meta).toContain('artifacts:')
    expect(meta).toContain('  idea: complete')
    expect(meta).toContain('  research: pending')
    expect(meta).not.toContain('artifacts: []')
  })

  it('writes last_updated as a date-only string (YYYY-MM-DD)', async () => {
    const result = await makeUseCase(bridge).execute({ title: 'Dark mode' })
    expect(result.ok).toBe(true)

    const meta = bridge.getAllFiles()['specs/dark-mode/workflow-state.md']
    expect(meta).toMatch(/last_updated: \d{4}-\d{2}-\d{2}\n/)
  })

  it('creates idea.md alongside workflow-state.md on first save', async () => {
    await makeUseCase(bridge).execute({ title: 'Dark mode' })

    const files = bridge.getAllFiles()
    expect('specs/dark-mode/idea.md' in files).toBe(true)
    expect(files['specs/dark-mode/idea.md']).toContain('stage: idea')
  })

  it('preserves an existing idea.md and shows a notice (REQ-AVS-005)', async () => {
    await bridge.writeFile('specs/dark-mode/idea.md', '# my handwritten idea\n')

    // Manually seed a feature folder without workflow-state.md so save() treats it as new
    const result = await makeUseCase(bridge).execute({ title: 'Dark mode' })
    expect(result.ok).toBe(true)

    expect(bridge.getAllFiles()['specs/dark-mode/idea.md']).toBe('# my handwritten idea\n')
    expect(bridge.getNotices().some((n) => n.message.includes('idea.md'))).toBe(true)
  })

  it('stores the user-supplied area in uppercase', async () => {
    await makeUseCase(bridge).execute({ title: 'Dark mode', area: 'dm' })

    const meta = bridge.getAllFiles()['specs/dark-mode/workflow-state.md']
    expect(meta).toContain('area: DM')
  })

  it('strips non-uppercase-letter characters from area so YAML stays valid', async () => {
    await makeUseCase(bridge).execute({ title: 'Dark mode', area: 'R&D' })

    const meta = bridge.getAllFiles()['specs/dark-mode/workflow-state.md']
    // '&' is stripped; result is 'RD'
    expect(meta).toContain('area: RD')
    expect(meta).not.toContain('&')
  })

  it('derives area from slug initials when area is omitted', async () => {
    await makeUseCase(bridge).execute({ title: 'Dark mode' })

    const meta = bridge.getAllFiles()['specs/dark-mode/workflow-state.md']
    expect(meta).toContain('area: DM')
  })

  it('rejects creation when a feature with the same slug already exists', async () => {
    const useCase = makeUseCase(bridge)
    await useCase.execute({ title: 'Dark mode' })
    const second = await useCase.execute({ title: 'dark-mode' })

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.message).toMatch(/already exists/)
  })

  it('rejects an empty title', async () => {
    const result = await makeUseCase(bridge).execute({ title: '   ' })
    expect(result.ok).toBe(false)
  })
})

describe('ActivateFeatureUseCase', () => {
  it('updates workflow-state.md for an existing feature (upsert)', async () => {
    const bridge = new MockBridge()
    const repo = makeRepo(bridge)
    const createResult = await new CreateFeatureUseCase(repo).execute({ title: 'Search' })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const activateResult = await new ActivateFeatureUseCase(repo).execute({
      featureId: createResult.value.id,
    })
    expect(activateResult.ok).toBe(true)
    if (!activateResult.ok) return

    const meta = bridge.getAllFiles()['specs/search/workflow-state.md']
    expect(meta).toContain('status: active')
  })
})

describe('AdvanceFeatureStageUseCase', () => {
  it('advances step and creates the new stage file', async () => {
    const bridge = new MockBridge()
    const repo = makeRepo(bridge)

    const created = await new CreateFeatureUseCase(repo).execute({ title: 'Search' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const activated = await new ActivateFeatureUseCase(repo).execute({
      featureId: created.value.id,
    })
    expect(activated.ok).toBe(true)

    const advanced = await new AdvanceFeatureStageUseCase(repo).execute({
      featureId: created.value.id,
    })
    expect(advanced.ok).toBe(true)
    if (!advanced.ok) return

    expect(advanced.value.currentStep).toBe(2)

    const files = bridge.getAllFiles()
    expect('specs/search/research.md' in files).toBe(true)
    expect(files['specs/search/research.md']).toContain('stage: research')
  })

  it('keeps an existing stage file without overwriting (REQ-AVS-005)', async () => {
    const bridge = new MockBridge()
    const repo = makeRepo(bridge)

    const created = await new CreateFeatureUseCase(repo).execute({ title: 'Search' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await new ActivateFeatureUseCase(repo).execute({ featureId: created.value.id })

    // Pre-seed the stage file with custom content
    await bridge.writeFile('specs/search/research.md', '# my custom research\n')

    const advanced = await new AdvanceFeatureStageUseCase(repo).execute({
      featureId: created.value.id,
    })
    expect(advanced.ok).toBe(true)

    // Custom file must not be overwritten
    expect(bridge.getAllFiles()['specs/search/research.md']).toBe('# my custom research\n')
    // A notice must have been shown
    expect(bridge.getNotices().some((n) => n.message.includes('research.md'))).toBe(true)
  })

  it('completing the final stage (step 12 → 13) persists without error', async () => {
    const { Feature } = await import('@/domain/feature/Feature')
    const { Slug } = await import('@/domain/shared/Slug')
    const bridge = new MockBridge()
    const repo = makeRepo(bridge)

    const slugResult = Slug.create('retro-feature')
    expect(slugResult.ok).toBe(true)
    if (!slugResult.ok) return

    // Reconstitute a feature already at the last step
    const feature = Feature.reconstitute({
      id: 'retro-id',
      slug: slugResult.value,
      title: 'Retro Feature',
      status: 'active',
      currentStep: 12,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await repo.save(feature)

    const result = await new AdvanceFeatureStageUseCase(repo).execute({ featureId: 'retro-id' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.isComplete).toBe(true)
    expect(result.value.currentStep).toBe(13)

    const meta = bridge.getAllFiles()['specs/retro-feature/workflow-state.md']
    expect(meta).toContain('currentStep: 13')
    // Completed features must write the last stage, not the `idea` fallback
    expect(meta).toContain('current_stage: retrospective')
  })

  it('serialises current_stage as idea when currentStep is 0 (corrupt vault data)', async () => {
    const { Feature } = await import('@/domain/feature/Feature')
    const { Slug } = await import('@/domain/shared/Slug')
    const bridge = new MockBridge()
    const repo = makeRepo(bridge)

    const slugResult = Slug.create('corrupt-feature')
    expect(slugResult.ok).toBe(true)
    if (!slugResult.ok) return

    const feature = Feature.reconstitute({
      id: 'corrupt-id',
      slug: slugResult.value,
      title: 'Corrupt Feature',
      status: 'draft',
      currentStep: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await repo.save(feature)

    const meta = bridge.getAllFiles()['specs/corrupt-feature/workflow-state.md']
    // Clamped to index 0 → idea, never `undefined`
    expect(meta).toContain('current_stage: idea')
    expect(meta).not.toContain('current_stage: undefined')
  })
})
