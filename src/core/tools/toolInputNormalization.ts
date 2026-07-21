/**
 * Provider-neutral tool-input normalization primitives, shared by the provider
 * adaptors (Codex, Opencode) and the chat tool-label renderer. Keeping these in
 * core means the same value stringification and canonical web-search shape are
 * produced regardless of which backend emitted the raw tool call, instead of
 * each provider carrying its own copy.
 */

/** Renders an arbitrary tool value as a display string (JSON for objects). */
export function stringifyToolValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** First trimmed non-empty string among the candidates, or '' if none. */
function firstTrimmedString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Deduped, trimmed string list; non-strings and blanks are dropped. */
function dedupeTrimmedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

/**
 * Collapses the assorted provider-specific web-search tool-input shapes into
 * one canonical `{ actionType, query, queries, url, pattern }` object. The
 * `actionType` is inferred from the present fields when the provider did not
 * stamp one explicitly.
 */
export function normalizeWebSearchInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const action = isPlainObject(input.action) ? input.action : {};

  const queries = dedupeTrimmedStrings(action.queries ?? input.queries);
  const query = firstTrimmedString(action.query, input.query, queries[0]);
  const url = firstTrimmedString(action.url, input.url);
  const pattern = firstTrimmedString(action.pattern, input.pattern);
  const explicitType = firstTrimmedString(action.type, input.actionType, input.action_type);

  const actionType = explicitType
    || (url && pattern ? 'find_in_page' : url ? 'open_page' : (query || queries.length > 0) ? 'search' : '');

  const normalized: Record<string, unknown> = {};
  if (actionType) normalized.actionType = actionType;
  if (query) normalized.query = query;
  if (queries.length > 0) normalized.queries = queries;
  if (url) normalized.url = url;
  if (pattern) normalized.pattern = pattern;
  return normalized;
}
