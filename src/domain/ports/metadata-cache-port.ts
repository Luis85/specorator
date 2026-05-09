import type { Unsubscriber } from './shared'

export interface FileMetadataSnapshot {
  path: string
  tags: string[]
  frontmatter: Record<string, unknown>
  links: string[]
  embeds: string[]
}

export interface MetadataCachePort {
  getFileMetadata(path: string): FileMetadataSnapshot | null
  getBacklinks(path: string): string[]
  getResolvedLinks(sourcePath: string): Record<string, number>
  getAllTags(): Record<string, number>
  onMetadataChanged(handler: (path: string) => void): Unsubscriber
}
