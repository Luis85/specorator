/**
 * Resolve the secret values a single tool is allowed to see, keyed by the tool's
 * FILE and its CATALOGED declaration — never widened by the serve-time manifest.
 *
 * The catalog scan captures, per file, the exact secret ids that file declared
 * while its top-level code ran in `--catalog` mode. Granting from this cataloged
 * map (rather than from `manifest.secrets` read in serve mode) closes the
 * per-tool isolation bypass: a tool can't widen its access in serve mode by
 * listing another tool's id that happens to be in the catalog-wide value union.
 *
 * `declaredNow` (the CURRENT serve-time `manifest.secrets`) NARROWS the cataloged
 * set when provided: a file edited after a failed catalog scan keeps the prior
 * cataloged grant in the host env, but if its current code no longer declares an
 * id, that id is withheld. This is an intersection, so it can only ever drop
 * access — it never lets the serve manifest reach beyond what was cataloged.
 * Omitting `declaredNow` (catalog/internal callers) applies no such gate.
 *
 * A file with no cataloged entry (e.g. it appeared after a failed scan that
 * preserved the prior map) gets nothing. An id is granted only when it was
 * cataloged for THIS file, still declared by the current code (when gated), AND
 * its value is present in the host env.
 */
export function grantSecrets(
  file: string | undefined,
  catalogedByFile: Record<string, string[]>,
  secretsById: Record<string, string>,
  declaredNow?: string[],
): Record<string, string> {
  const granted: Record<string, string> = {};
  if (file === undefined) return granted;
  const allowNow = declaredNow ? new Set(declaredNow) : null;
  for (const id of catalogedByFile[file] ?? []) {
    if (allowNow && !allowNow.has(id)) continue;
    if (secretsById[id] !== undefined) granted[id] = secretsById[id];
  }
  return granted;
}
