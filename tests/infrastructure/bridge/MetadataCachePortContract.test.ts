// NOTE(asymmetry): LocalStorageBridge does not implement MetadataCachePort —
// the browser demo has no metadata-cache concept. ObsidianMetadataCacheAdapter
// requires a live Obsidian runtime and is excluded from unit tests.
// This contract runs against MockMetadataCacheAdapter only.
import { beforeEach, describe, expect, it } from 'vitest'
import type { MetadataCachePort, FileMetadataSnapshot } from '@/domain/ports'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'

interface Harness {
	readonly name: string
	readonly makeAdapter: () => MockMetadataCacheAdapter
}

function registerMetadataCacheContract(harness: Harness): void {
	describe(`${harness.name} MetadataCachePort contract`, () => {
		let port: MetadataCachePort
		let adapter: MockMetadataCacheAdapter

		const PATH = 'specs/search/workflow-state.md'
		const SNAPSHOT: FileMetadataSnapshot = {
			path: PATH,
			tags: ['#planning'],
			frontmatter: { stage: 'idea' },
			links: ['specs/other/idea.md'],
			embeds: [],
		}

		beforeEach(() => {
			adapter = harness.makeAdapter()
			port = adapter
		})

		describe('getFileMetadata', () => {
			it('returns null for an unknown path', () => {
				expect(port.getFileMetadata('specs/missing.md')).toBeNull()
			})

			it('returns snapshot after seeding', () => {
				adapter.seedMetadata(PATH, SNAPSHOT)
				expect(port.getFileMetadata(PATH)).toEqual(SNAPSHOT)
			})

			it('returns a defensive copy — caller mutation does not affect stored data', () => {
				adapter.seedMetadata(PATH, SNAPSHOT)
				const result = port.getFileMetadata(PATH)!
				result.tags.push('#mutated')
				expect(port.getFileMetadata(PATH)?.tags).toEqual(['#planning'])
			})
		})

		describe('getBacklinks', () => {
			it('returns empty array for an unknown path', () => {
				expect(port.getBacklinks(PATH)).toEqual([])
			})

			it('returns seeded backlinks', () => {
				adapter.seedBacklinks(PATH, ['specs/other/idea.md'])
				expect(port.getBacklinks(PATH)).toEqual(['specs/other/idea.md'])
			})

			it('returns a defensive copy', () => {
				adapter.seedBacklinks(PATH, ['specs/other/idea.md'])
				const result = port.getBacklinks(PATH)
				result.push('mutated')
				expect(port.getBacklinks(PATH)).toEqual(['specs/other/idea.md'])
			})
		})

		describe('getResolvedLinks', () => {
			it('returns empty object for an unknown path', () => {
				expect(port.getResolvedLinks(PATH)).toEqual({})
			})

			it('returns seeded resolved links', () => {
				adapter.seedResolvedLinks(PATH, { 'specs/other/idea.md': 2 })
				expect(port.getResolvedLinks(PATH)).toEqual({ 'specs/other/idea.md': 2 })
			})

			it('returns a defensive copy', () => {
				adapter.seedResolvedLinks(PATH, { 'specs/other/idea.md': 2 })
				const result = port.getResolvedLinks(PATH)
				result.mutated = 99
				expect(port.getResolvedLinks(PATH)).not.toHaveProperty('mutated')
			})
		})

		describe('getAllTags', () => {
			it('returns empty object when no tags seeded', () => {
				expect(port.getAllTags()).toEqual({})
			})

			it('returns seeded tags', () => {
				adapter.seedTags({ '#planning': 3, '#done': 1 })
				expect(port.getAllTags()).toEqual({ '#planning': 3, '#done': 1 })
			})

			it('returns a defensive copy', () => {
				adapter.seedTags({ '#planning': 3 })
				const result = port.getAllTags()
				result['#mutated'] = 99
				expect(port.getAllTags()).not.toHaveProperty('#mutated')
			})
		})

		describe('getFirstLinkpathDest', () => {
			it('returns null for an unknown linktext/source pair', () => {
				expect(port.getFirstLinkpathDest('Search', 'specs/other/idea.md')).toBeNull()
			})

			it('resolves a seeded linkpath', () => {
				adapter.seedLinkpathDest('Search', 'specs/other/idea.md', 'specs/search/idea.md')
				expect(port.getFirstLinkpathDest('Search', 'specs/other/idea.md')).toBe(
					'specs/search/idea.md',
				)
			})

			it('treats linktext + sourcePath as a composite key — different source returns null', () => {
				adapter.seedLinkpathDest('Search', 'specs/other/idea.md', 'specs/search/idea.md')
				expect(port.getFirstLinkpathDest('Search', 'specs/different/idea.md')).toBeNull()
			})
		})

		describe('onMetadataChanged', () => {
			it('delivers path to handler on triggerChange', () => {
				const received: string[] = []
				port.onMetadataChanged((p) => received.push(p))
				adapter.triggerChange(PATH)
				expect(received).toEqual([PATH])
			})

			it('unsubscriber stops delivery', () => {
				const received: string[] = []
				const unsub = port.onMetadataChanged((p) => received.push(p))
				unsub()
				adapter.triggerChange(PATH)
				expect(received).toEqual([])
			})

			it('unsubscriber is idempotent', () => {
				const unsub = port.onMetadataChanged(() => {})
				expect(() => {
					unsub()
					unsub()
				}).not.toThrow()
			})
		})
	})
}

registerMetadataCacheContract({
	name: 'MockMetadataCacheAdapter',
	makeAdapter: () => new MockMetadataCacheAdapter(),
})
