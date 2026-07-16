/**
 * Display-path helpers for composer chips and edited-file rows. Match the
 * imperative `FileChipsView` / `EditedFilesView` rules exactly: a
 * backslash-normalized basename, and a parent dir that is `''` (not `.`) at the
 * vault root.
 */

export function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

export function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? '' : normalized.slice(0, slash);
}
