import type { MetadataCachePort, FileMetadataSnapshot, Unsubscriber } from '@/domain/ports'

export class MockMetadataCacheAdapter implements MetadataCachePort {
  private readonly metadata = new Map<string, FileMetadataSnapshot>()
  private readonly backlinks = new Map<string, string[]>()
  private readonly resolvedLinks = new Map<string, Record<string, number>>()
  private tags: Record<string, number> = {}
  private readonly handlers = new Set<(path: string) => void>()

  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadata.set(path, snapshot)
  }

  seedBacklinks(path: string, sources: string[]): void {
    this.backlinks.set(path, sources)
  }

  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.resolvedLinks.set(path, links)
  }

  seedTags(tags: Record<string, number>): void {
    this.tags = { ...tags }
  }

  triggerChange(path: string): void {
    for (const handler of this.handlers) {
      handler(path)
    }
  }

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    return this.metadata.get(path) ?? null
  }

  getBacklinks(path: string): string[] {
    return this.backlinks.get(path) ?? []
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return this.resolvedLinks.get(sourcePath) ?? {}
  }

  getAllTags(): Record<string, number> {
    return { ...this.tags }
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }
}
