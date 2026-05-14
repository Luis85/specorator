// Tests FeatureService.archiveFeature — ArchiveFeatureUseCase was inlined in C2.
import { describe, it, expect, vi } from 'vitest'
import { FeatureService } from '@/application/feature/FeatureService'
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
    save: vi.fn().mockResolvedValue(ok({ ideaCreated: true })),
    createStageFile: vi.fn().mockResolvedValue(ok({ created: true })),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  }
}

describe('FeatureService.archiveFeature', () => {
  it('archives a non-archived feature and persists it via the repository (happy path)', async () => {
    const draft = makeDraftFeature('feat-1', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(draft),
    })

    const result = await new FeatureService(repo).archiveFeature('feat-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('archived')
    expect(result.value.id).toBe('feat-1')
    expect(result.value.slug.toString()).toBe('search')

    expect(repo.findById).toHaveBeenCalledTimes(1)
    expect(repo.findById).toHaveBeenCalledWith('feat-1')
    expect(repo.save).toHaveBeenCalledTimes(1)

    const savedArg = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Feature
    expect(savedArg.status).toBe('archived')
    expect(savedArg.id).toBe('feat-1')
  })

  it('archives an active feature (happy path from active)', async () => {
    const active = makeActiveFeature('feat-2', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(active),
    })

    const result = await new FeatureService(repo).archiveFeature('feat-2')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('archived')
    expect(repo.save).toHaveBeenCalledTimes(1)
  })

  it('returns an error when the feature does not exist (not found)', async () => {
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(null),
    })

    const result = await new FeatureService(repo).archiveFeature('missing-id')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.message).toContain('missing-id')
    expect(result.error.message).toMatch(/not found/i)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('returns the domain error when the feature is already archived', async () => {
    const archived = makeArchivedFeature('feat-3', 'Search', 'search')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(archived),
    })

    const result = await new FeatureService(repo).archiveFeature('feat-3')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/already archived/i)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('propagates the repository save error when persistence fails', async () => {
    const draft = makeDraftFeature('feat-4', 'Search', 'search')
    const saveError = new Error('disk full')
    const repo = makeRepoMock({
      findById: vi.fn().mockResolvedValue(draft),
      save: vi.fn().mockResolvedValue(err(saveError)),
    })

    const result = await new FeatureService(repo).archiveFeature('feat-4')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(saveError)
    expect(result.error.message).toBe('disk full')
    expect(repo.save).toHaveBeenCalledTimes(1)
  })
})
