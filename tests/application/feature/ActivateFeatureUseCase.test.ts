import { describe, it, expect, vi } from 'vitest'
import { ActivateFeatureUseCase } from '@/application/feature/ActivateFeatureUseCase'
import { Feature } from '@/domain/feature/Feature'
import { Slug } from '@/domain/shared/Slug'
import { ok, err } from '@/domain/shared/Result'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'

function makeSlug(raw: string): Slug {
  const result = Slug.create(raw)
  if (!result.ok) throw result.error
  return result.value
}

function makeDraftFeature(id = 'feature-1', title = 'Search', slugRaw = 'search'): Feature {
  const result = Feature.create(id, makeSlug(slugRaw), title)
  if (!result.ok) throw result.error
  return result.value
}

function makeActiveFeature(id = 'feature-1', title = 'Search', slugRaw = 'search'): Feature {
  return Feature.reconstitute({
    id,
    slug: makeSlug(slugRaw),
    title,
    status: 'active',
    currentStep: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeArchivedFeature(id = 'feature-1', title = 'Search', slugRaw = 'search'): Feature {
  return Feature.reconstitute({
    id,
    slug: makeSlug(slugRaw),
    title,
    status: 'archived',
    currentStep: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeRepoMock(overrides: Partial<IFeatureRepository> = {}): IFeatureRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findBySlug: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    createStageFile: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  }
}

describe('ActivateFeatureUseCase', () => {
  it('activates a draft feature and persists it via the repository (happy path)', async () => {
    const draft = makeDraftFeature('feat-1', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(draft),
    })

    const result = await new ActivateFeatureUseCase(repo).execute({ featureId: 'feat-1' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('active')
    expect(result.value.id).toBe('feat-1')
    expect(result.value.slug.toString()).toBe('search')

    expect(repo.findById).toHaveBeenCalledTimes(1)
    expect(repo.findById).toHaveBeenCalledWith('feat-1')
    expect(repo.save).toHaveBeenCalledTimes(1)

    const savedArg = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Feature
    expect(savedArg.status).toBe('active')
    expect(savedArg.id).toBe('feat-1')
  })

  it('returns an error when the feature does not exist (not found)', async () => {
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(null),
    })

    const result = await new ActivateFeatureUseCase(repo).execute({ featureId: 'missing-id' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.message).toContain('missing-id')
    expect(result.error.message).toMatch(/not found/i)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('returns the domain error when the feature is already active (invalid stage)', async () => {
    const active = makeActiveFeature('feat-2', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(active),
    })

    const result = await new ActivateFeatureUseCase(repo).execute({ featureId: 'feat-2' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/Cannot activate/i)
    expect(result.error.message).toContain('active')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('returns the domain error when the feature is archived (invalid stage)', async () => {
    const archived = makeArchivedFeature('feat-3', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(archived),
    })

    const result = await new ActivateFeatureUseCase(repo).execute({ featureId: 'feat-3' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/Cannot activate/i)
    expect(result.error.message).toContain('archived')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('propagates the repository save error when persistence fails', async () => {
    const draft = makeDraftFeature('feat-4', 'Search', 'search')
    const saveError = new Error('disk full')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(draft),
      save: vi.fn().mockResolvedValue(err(saveError)),
    })

    const result = await new ActivateFeatureUseCase(repo).execute({ featureId: 'feat-4' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(saveError)
    expect(result.error.message).toBe('disk full')
    expect(repo.save).toHaveBeenCalledTimes(1)
  })
})
