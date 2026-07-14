import { buildExternalContextDisplayEntries, normalizePathForComparison } from './externalContext';

/**
 * Drops an external-context root only when an attached file/folder resolves to
 * the EXACT same path (a true duplicate — the composer mention suffix already
 * carries those bytes). A directory root is NOT dropped just because one file
 * under it is attached: the root grants scope over the whole directory (sibling
 * files), while the mention only carries that single file — dropping it would
 * silently lose access to the rest of the directory.
 */
export function filterRedundantExternalContextPaths(
  paths: string[] | undefined,
  attachedFiles: Iterable<string>,
): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;

  const normalizedAttached = new Set([...attachedFiles].map(normalizePathForComparison));
  const uniqueRoots = [...new Set(paths.map(normalizePathForComparison))];

  const filtered = uniqueRoots.filter((root) => !normalizedAttached.has(root));

  return filtered.length > 0 ? filtered : undefined;
}

/** Resolves one external root per normalized path for turn submission. */
export function dedupeExternalContextPaths(paths: string[] | undefined): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const entries = buildExternalContextDisplayEntries(paths);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const entry of entries) {
    const key = normalizePathForComparison(entry.contextRoot);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry.contextRoot);
  }
  return deduped.length > 0 ? deduped : undefined;
}
