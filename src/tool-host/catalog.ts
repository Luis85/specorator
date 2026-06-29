import type { CatalogPayload, LoadResult } from './types';

export function buildCatalog(load: LoadResult): CatalogPayload {
  return {
    tools: load.tools.map((t) => ({
      file: t.file,
      name: t.manifest.name,
      description: t.manifest.description,
      secrets: t.manifest.secrets ?? [],
    })),
    errors: load.errors,
  };
}
