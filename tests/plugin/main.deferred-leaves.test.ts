import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceLeaf } from 'obsidian'
import { ensureLeafLoaded } from '@/plugin/leafLoader'

/**
 * Smoke tests for the deferred-leaf hardening (issue #239).
 *
 * Obsidian 1.7.2 introduced deferred view leaves: `workspace.getLeavesOfType()`
 * can return leaves whose `.view` is a `DeferredView` placeholder. Awaiting
 * `leaf.loadIfDeferred()` materialises the real view. The helper must be
 * backward-compatible with Obsidian <1.7.2 where the properties are absent.
 *
 * These tests cover `ensureLeafLoaded` only — exercising the full plugin
 * lifecycle would require booting the real Obsidian `Plugin` base class.
 */
describe('ensureLeafLoaded (deferred-leaf safety)', () => {
  it('resolves without calling loadIfDeferred on a non-deferred leaf', async () => {
    const loadIfDeferred = vi.fn().mockResolvedValue(undefined)
    const leaf = {
      isDeferred: false,
      loadIfDeferred,
    } as unknown as WorkspaceLeaf

    await expect(ensureLeafLoaded(leaf)).resolves.toBeUndefined()
    expect(loadIfDeferred).not.toHaveBeenCalled()
  })

  it('awaits loadIfDeferred when leaf.isDeferred is true', async () => {
    const loadIfDeferred = vi.fn().mockResolvedValue(undefined)
    const leaf = {
      isDeferred: true,
      loadIfDeferred,
    } as unknown as WorkspaceLeaf

    await expect(ensureLeafLoaded(leaf)).resolves.toBeUndefined()
    expect(loadIfDeferred).toHaveBeenCalledTimes(1)
  })

  it('propagates rejection from loadIfDeferred', async () => {
    const boom = new Error('load failed')
    const loadIfDeferred = vi.fn().mockRejectedValue(boom)
    const leaf = {
      isDeferred: true,
      loadIfDeferred,
    } as unknown as WorkspaceLeaf

    await expect(ensureLeafLoaded(leaf)).rejects.toBe(boom)
    expect(loadIfDeferred).toHaveBeenCalledTimes(1)
  })

  it('resolves without throwing on older Obsidian (no isDeferred / loadIfDeferred)', async () => {
    // Obsidian <1.7.2: neither property exists. Helper must treat the leaf as
    // not-deferred and resolve immediately.
    const leaf = {} as unknown as WorkspaceLeaf

    await expect(ensureLeafLoaded(leaf)).resolves.toBeUndefined()
  })

  it('resolves without invoking loadIfDeferred if isDeferred is undefined but the method exists', async () => {
    // Defensive: some intermediate Obsidian versions may expose the method but
    // not the getter. Treat as not-deferred.
    const loadIfDeferred = vi.fn().mockResolvedValue(undefined)
    const leaf = {
      loadIfDeferred,
    } as unknown as WorkspaceLeaf

    await expect(ensureLeafLoaded(leaf)).resolves.toBeUndefined()
    expect(loadIfDeferred).not.toHaveBeenCalled()
  })
})
