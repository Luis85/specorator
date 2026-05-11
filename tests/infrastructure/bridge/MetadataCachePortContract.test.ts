import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetadataCachePort } from '@/domain/ports'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'

// ObsidianMetadataCacheAdapter wraps the full Obsidian App instance and cannot
// be instantiated in Vitest. Known asymmetry: its onMetadataChanged fires on
// 'changed', 'resolve', 'deleted', and vault 'rename' events from the runtime;
// the mock fires only via the test-seam triggerChange() method.
// Track: ensure any new method added to MetadataCachePort is reflected in both
// ObsidianMetadataCacheAdapter and MockMetadataCacheAdapter before shipping.

interface Harness {
	readonly name: string
	readonly makePort: () => MetadataCachePort
}

function registerMetadataCacheContract(harness: Harness): void {
	describe(`${harness.name} MetadataCachePort contract`, () => {
		let port: MetadataCachePort

		beforeEach(() => {
			port = harness.makePort()
		})

		it('returns null for an unknown file path', () => {
			expect(port.getFileMetadata('specs/unknown.md')).toBeNull()
		})

		it('returns an empty array of backlinks for an unknown path', () => {
			expect(port.getBacklinks('specs/unknown.md')).toEqual([])
		})

		it('returns an empty resolved-links map for an unknown source', () => {
			expect(port.getResolvedLinks('specs/unknown.md')).toEqual({})
		})

		it('getAllTags returns a plain object', () => {
			const tags = port.getAllTags()
			expect(typeof tags).toBe('object')
			expect(Array.isArray(tags)).toBe(false)
		})

		it('returns null for an unresolved linkpath destination', () => {
			expect(port.getFirstLinkpathDest('Unknown Page', 'specs/source.md')).toBeNull()
		})

		it('onMetadataChanged returns a callable unsubscriber', () => {
			const handler = vi.fn()
			const unsub = port.onMetadataChanged(handler)
			expect(typeof unsub).toBe('function')
			// Unsubscribe before any change is triggered — handler must stay silent.
			unsub()
			expect(handler).not.toHaveBeenCalled()
		})
	})
}

registerMetadataCacheContract({
	name: 'MockMetadataCacheAdapter',
	makePort: () => new MockMetadataCacheAdapter(),
})
