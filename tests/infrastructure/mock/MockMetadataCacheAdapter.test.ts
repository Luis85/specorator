import { describe, it, expect, vi } from 'vitest'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'

describe('MockMetadataCacheAdapter', () => {
  it('getFileMetadata returns null when path not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getFileMetadata('specs/foo/idea.md')).toBeNull()
  })

  it('getFileMetadata returns seeded snapshot', () => {
    const adapter = new MockMetadataCacheAdapter()
    const snapshot = {
      path: 'specs/foo/idea.md',
      tags: ['#feature'],
      frontmatter: { stage: 'idea' },
      links: ['specs/bar/idea.md'],
      embeds: [],
    }
    adapter.seedMetadata('specs/foo/idea.md', snapshot)
    expect(adapter.getFileMetadata('specs/foo/idea.md')).toEqual(snapshot)
  })

  it('getBacklinks returns empty array when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getBacklinks('specs/foo/idea.md')).toEqual([])
  })

  it('getBacklinks returns seeded backlinks', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedBacklinks('specs/foo/idea.md', ['specs/bar/idea.md', 'specs/baz/idea.md'])
    expect(adapter.getBacklinks('specs/foo/idea.md')).toEqual([
      'specs/bar/idea.md',
      'specs/baz/idea.md',
    ])
  })

  it('getResolvedLinks returns empty object when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getResolvedLinks('specs/foo/idea.md')).toEqual({})
  })

  it('getResolvedLinks returns seeded resolved links', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedResolvedLinks('specs/foo/idea.md', { 'specs/bar/idea.md': 2 })
    expect(adapter.getResolvedLinks('specs/foo/idea.md')).toEqual({ 'specs/bar/idea.md': 2 })
  })

  it('getAllTags returns empty object when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getAllTags()).toEqual({})
  })

  it('getAllTags returns seeded tags', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedTags({ '#feature': 3, '#bug': 1 })
    expect(adapter.getAllTags()).toEqual({ '#feature': 3, '#bug': 1 })
  })

  it('triggerChange fires all registered onMetadataChanged handlers with the path', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler = vi.fn()
    adapter.onMetadataChanged(handler)
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler).toHaveBeenCalledWith('specs/foo/idea.md')
  })

  it('unsubscriber stops handler from firing', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler = vi.fn()
    const unsub = adapter.onMetadataChanged(handler)
    unsub()
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscriber removes only its own handler', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const unsub1 = adapter.onMetadataChanged(handler1)
    adapter.onMetadataChanged(handler2)
    unsub1()
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith('specs/foo/idea.md')
  })

  it('getFirstLinkpathDest returns null when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getFirstLinkpathDest('Foo', 'specs/bar/idea.md')).toBeNull()
  })

  it('getFirstLinkpathDest returns the seeded destination', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedLinkpathDest('Foo', 'specs/bar/idea.md', 'specs/foo/idea.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'specs/bar/idea.md')).toBe('specs/foo/idea.md')
  })

  it('getFirstLinkpathDest is keyed by both linktext and source', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedLinkpathDest('Foo', 'a.md', 'specs/a-foo.md')
    adapter.seedLinkpathDest('Foo', 'b.md', 'specs/b-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'a.md')).toBe('specs/a-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'b.md')).toBe('specs/b-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'c.md')).toBeNull()
  })
})
