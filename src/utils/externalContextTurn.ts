import { buildExternalContextDisplayEntries, normalizePathForComparison } from './externalContext';

/**
 * Drops redundant external-context roots when attached files already live under
 * that root (the composer mention suffix carries the same bytes on the wire).
 */
export function filterRedundantExternalContextPaths(
  paths: string[] | undefined,
  attachedFiles: Iterable<string>,
): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;

  const normalizedAttached = [...attachedFiles].map(normalizePathForComparison);
  const uniqueRoots = [...new Set(paths.map(normalizePathForComparison))];

  const filtered = uniqueRoots.filter((root) => {
    const prefix = `${root}/`;
    const coveredByAttachment = normalizedAttached.some(
      (file) => file === root || file.startsWith(prefix),
    );
    return !coveredByAttachment;
  });

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
