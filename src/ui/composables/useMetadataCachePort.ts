import { inject } from 'vue'
import type { MetadataCachePort } from '@/domain/ports'
import { METADATA_CACHE_PORT } from '@/infrastructure/bridge/ports'

export function useMetadataCachePort(): MetadataCachePort {
  const port = inject(METADATA_CACHE_PORT)
  if (!port) {
    throw new Error(
      'MetadataCachePort was not provided. Call app.provide(METADATA_CACHE_PORT, port) before mounting the app.',
    )
  }
  return port
}
