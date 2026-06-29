/**
 * Iterates an unknown array, keeping each entry the `map` callback turns into a
 * non-null `{ dedupeKey, item }`, and dropping later duplicates by `dedupeKey`.
 * Non-object entries are skipped. This is the shared scaffold behind the
 * OpenCode model/mode discovery normalizers, which only differ in which trimmed
 * string fields they read and what they build. `str(key)` returns the trimmed
 * string value of `key`, or `''` when absent or non-string.
 */
export function normalizeUniqueRecords<T>(
  value: unknown,
  map: (str: (key: string) => string) => { dedupeKey: string; item: T } | null,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: T[] = [];
  const seen = new Set<string>();
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const str = (key: string): string => {
      const raw = record[key];
      return typeof raw === 'string' ? raw.trim() : '';
    };
    const mapped = map(str);
    if (!mapped || seen.has(mapped.dedupeKey)) {
      continue;
    }
    seen.add(mapped.dedupeKey);
    result.push(mapped.item);
  }

  return result;
}
