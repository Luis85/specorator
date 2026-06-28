/**
 * Resolve the secret values a single tool is allowed to see, keyed by the tool's
 * FILE and its CATALOGED declaration — never the serve-time manifest.
 *
 * The catalog scan captures, per file, the exact secret ids that file declared
 * while its top-level code ran in `--catalog` mode. Granting from this cataloged
 * map (rather than from `manifest.secrets` read in serve mode) closes the
 * per-tool isolation bypass: a tool can't widen its access in serve mode by
 * listing another tool's id that happens to be in the catalog-wide value union.
 *
 * A file with no cataloged entry (e.g. it appeared after a failed scan that
 * preserved the prior map) gets nothing. An id is granted only when it was
 * cataloged for THIS file AND its value is present in the host env.
 */
export function grantSecrets(
  file: string | undefined,
  catalogedByFile: Record<string, string[]>,
  secretsById: Record<string, string>,
): Record<string, string> {
  const granted: Record<string, string> = {};
  if (file === undefined) return granted;
  for (const id of catalogedByFile[file] ?? []) {
    if (secretsById[id] !== undefined) granted[id] = secretsById[id];
  }
  return granted;
}
