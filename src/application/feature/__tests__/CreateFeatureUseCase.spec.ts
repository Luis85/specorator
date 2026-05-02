import { describe, it, expect, beforeEach } from 'vitest'
import { CreateFeatureUseCase } from '../CreateFeatureUseCase'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'

function makeUseCase(bridge: MockBridge) {
  return new CreateFeatureUseCase(new FeatureRepository(bridge, DEFAULT_SETTINGS))
}

describe('CreateFeatureUseCase', () => {
  let bridge: MockBridge

  beforeEach(() => {
    bridge = new MockBridge()
  })

  it('creates a feature and persists it to the bridge', async () => {
    const useCase = makeUseCase(bridge)
    const result = await useCase.execute({ title: 'Dark mode' })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.title).toBe('Dark mode')
    expect(result.value.status).toBe('draft')
    expect(result.value.slug.toString()).toBe('dark-mode')

    const files = bridge.getAllFiles()
    const metaPath = `specs/dark-mode/workflow-state.md`
    expect(metaPath in files).toBe(true)
    expect(files[metaPath]).toContain('title: "Dark mode"')
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
