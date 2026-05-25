import type { CatalogIndex } from "./types";

/** Phase 1 BundledCatalogSource: the index is generated at build time and
 *  imported as a string. The CatalogSource interface seam comes in Phase 3. */
export function loadBundledCatalog(indexJson: string): CatalogIndex {
  try {
    const idx = JSON.parse(indexJson) as CatalogIndex;
    if (!Array.isArray(idx.assets)) throw new Error("no assets[]");
    return idx;
  } catch (e) {
    throw new Error(`invalid bundled catalog index: ${(e as Error).message}`, { cause: e });
  }
}
