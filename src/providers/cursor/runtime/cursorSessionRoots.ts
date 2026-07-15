/**
 * External-context roots for a Cursor ACP session. The selected external folders
 * become the session's `additionalDirectories` (so the agent can read sibling
 * files outside the vault `cwd`). `additionalDirectories` is fixed at
 * `session/new`, so the runtime compares the live session's roots against each
 * turn's selection and mints a fresh session when they differ — mirroring the
 * Claude runtime's restart-on-`externalContextPaths`-change.
 */

/** Deduped, trimmed, sorted root list — the stable comparison key. */
export function normalizeCursorSessionRoots(
  paths: readonly string[] | undefined,
): string[] {
  if (!paths || paths.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  for (const raw of paths) {
    const trimmed = raw?.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen].sort();
}

/** Order-independent equality for two already-normalized root lists. */
export function cursorSessionRootsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** The `additionalDirectories` value for an ACP session request (undefined when empty). */
export function cursorSessionAdditionalDirectories(
  roots: readonly string[],
): string[] | undefined {
  return roots.length > 0 ? [...roots] : undefined;
}
