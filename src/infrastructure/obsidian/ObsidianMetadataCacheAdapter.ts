import { TFile, getAllTags as obsidianGetAllTags, type App } from 'obsidian'
import type { MetadataCachePort, FileMetadataSnapshot, Unsubscriber } from '@/domain/ports'

export class ObsidianMetadataCacheAdapter implements MetadataCachePort {
  constructor(private readonly app: App) {}

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const abstractFile = this.app.vault.getAbstractFileByPath(path)
    if (!(abstractFile instanceof TFile)) return null
    const cache = this.app.metadataCache.getFileCache(abstractFile)
    if (!cache) return null
    return {
      path,
      tags: (cache.tags ?? []).map((t) => t.tag),
      frontmatter: structuredClone(cache.frontmatter ?? {}),
      links: (cache.links ?? []).map((l) => l.link),
      embeds: (cache.embeds ?? []).map((e) => e.link),
    }
  }

  getBacklinks(path: string): string[] {
    const resolved = this.app.metadataCache.resolvedLinks
    const result: string[] = []
    for (const [source, targets] of Object.entries(resolved)) {
      if (path in targets) result.push(source)
    }
    return result
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return { ...this.app.metadataCache.resolvedLinks[sourcePath] }
  }

  getAllTags(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const file of this.app.vault.getFiles()) {
      const cache = this.app.metadataCache.getFileCache(file)
      if (!cache) continue
      const tags = obsidianGetAllTags(cache)
      if (!tags) continue
      for (const tag of tags) {
        counts[tag] = (counts[tag] ?? 0) + 1
      }
    }
    return counts
  }

  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    const dest = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)
    return dest?.path ?? null
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    // 'changed' fires after indexing; 'resolve' fires when resolvedLinks updates complete;
    // 'deleted' fires when a file is removed; vault 'rename' is excluded from 'changed'
    const changedRef = this.app.metadataCache.on('changed', (file) => {
      handler(file.path)
    })
    const resolveRef = this.app.metadataCache.on('resolve', (file) => {
      handler(file.path)
    })
    const deletedRef = this.app.metadataCache.on('deleted', (file) => {
      handler(file.path)
    })
    const renamedRef = this.app.vault.on('rename', (file, oldPath) => {
      handler(oldPath)
      handler(file.path)
    })
    return () => {
      this.app.metadataCache.offref(changedRef)
      this.app.metadataCache.offref(resolveRef)
      this.app.metadataCache.offref(deletedRef)
      this.app.vault.offref(renamedRef)
    }
  }
}
