import { getCachedCursorModelIds } from './cursorModelCatalog';
import {
  CURSOR_STANDARD_MODE,
  decomposeMode,
  extractCursorModeValue,
  resolveCursorFamilyId,
} from './cursorModelFamily';

// Auto sentinel family: real Cursor sessions advertise Auto as `default[]`
// (tests/fixtures/providers/cursor/realAcpCaptures.ts:35-37), never as the
// literal string `auto` that `resolveCursorModelSelectionForCli` passes
// through for an Auto selection. ACP clients must special-case `default` as
// the Auto sentinel (forum-confirmed) rather than treating it as an unknown
// family that falls through exact/family matching to null.
const CURSOR_AUTO_ADVERTISED_FAMILY = 'default';

/**
 * Resolves the CLI-picked id to a session-advertised wire id: an exact value
 * match, the Auto sentinel, or the advertised value whose family prefix
 * (everything before `[`) matches the CLI-resolved family AND whose bracket
 * variant matches the resolved mode (e.g. `gpt-5.4-medium` →
 * `gpt-5.4[reasoning=medium]`, never the first family sibling, which would
 * silently pin a different effort). Returns null when nothing lines up — the
 * caller then skips the update rather than sending a value Cursor would
 * accept-then-reject on the next prompt.
 *
 * `knownIds` is the catalog to derive family/mode against; callers pass the
 * ACTIVE endpoint's catalog (cli + env) so an endpoint/auth switch doesn't
 * resolve the family/mode against the previous endpoint's model ids. Omitting
 * it falls back to the no-arg module cache for lightweight callers/tests.
 */
export function matchAdvertisedModelValue(
  advertised: string[] | null,
  resolvedId: string,
  knownIds?: string[],
): string | null {
  if (!advertised || advertised.length === 0) {
    return null;
  }
  if (advertised.includes(resolvedId)) {
    return resolvedId;
  }
  if (resolvedId.trim().toLowerCase() === 'auto') {
    return advertised.find((value) => value.split('[', 1)[0] === CURSOR_AUTO_ADVERTISED_FAMILY) ?? null;
  }
  const catalog = knownIds ?? getCachedCursorModelIds();
  const resolvedFamily = resolveCursorFamilyId(resolvedId, catalog);
  const familyMatches = advertised.filter((value) => value.split('[', 1)[0] === resolvedFamily);
  if (familyMatches.length === 0) {
    return null;
  }
  const resolvedMode = extractCursorModeValue(resolvedId, catalog);
  if (!resolvedMode) {
    // No variant requested: prefer the bare family value over an arbitrary
    // bracket variant, falling back to the first family sibling.
    return familyMatches.find((value) => !value.includes('[')) ?? familyMatches[0];
  }
  return familyMatches.find((value) => advertisedVariantMatches(value, resolvedMode)) ?? null;
}

/**
 * Exact wire match first; optionally retries with the bare family id when the
 * resolved compound suffix cannot be satisfied (stale global effort, etc.).
 */
export function matchAdvertisedModelValueWithFamilyFallback(
  advertised: string[] | null,
  resolvedId: string,
  allowFamilyFallback: boolean,
  knownIds?: string[],
): string | null {
  const direct = matchAdvertisedModelValue(advertised, resolvedId, knownIds);
  if (direct) {
    return direct;
  }
  if (!allowFamilyFallback) {
    return null;
  }
  const familyId = resolveCursorFamilyId(resolvedId, knownIds ?? getCachedCursorModelIds());
  if (!familyId || familyId === resolvedId) {
    return null;
  }
  return matchAdvertisedModelValue(advertised, familyId, knownIds);
}

interface BracketFields {
  // The value part of every bracket segment (`reasoning=medium` → `medium`,
  // bare `thinking` → `thinking`). Effort matches against these.
  values: Set<string>;
  // key → value for `key=value` segments (`fast=true` → `fast`↦`true`).
  keyed: Map<string, string>;
}

// Parses a wire value's bracket suffix into its per-axis fields. Advertised
// values encode each axis as a separate bracket segment
// (`gpt-5.4[reasoning=medium,fast=true]`, bare-token `claude-4.6-opus[thinking]`),
// which is why a single-segment equality check never matched a compound CLI
// suffix like `medium-fast`. Returns null when there is no bracket at all.
function parseBracketFields(wireValue: string): BracketFields | null {
  const start = wireValue.indexOf('[');
  if (start === -1) {
    return null;
  }
  const end = wireValue.lastIndexOf(']');
  const inner = wireValue.slice(start + 1, end > start ? end : undefined);
  const values = new Set<string>();
  const keyed = new Map<string, string>();
  for (const rawSegment of inner.split(',')) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }
    const eq = segment.indexOf('=');
    if (eq === -1) {
      values.add(segment);
    } else {
      const key = segment.slice(0, eq).trim();
      const value = segment.slice(eq + 1).trim();
      values.add(value);
      keyed.set(key, value);
    }
  }
  return { values, keyed };
}

// True when the advertised value carries the given flag axis, whether encoded as
// a bare bracket token (`[thinking]`) or a keyed flag (`[fast=true]`).
function bracketHasFlag(fields: BracketFields, axis: string): boolean {
  return fields.values.has(axis) || fields.keyed.get(axis) === 'true';
}

// An advertised value matches the resolved compound suffix when EVERY axis the
// selection specifies is satisfied by a corresponding bracket field: effort
// against `reasoning=<level>` (or a bare effort token), and the thinking/fast
// flags against `thinking`/`fast=true`. The effort axis stays unconstrained
// when unrequested (Cursor advertises `reasoning=` on everything, so a bare
// `medium` still matches `[reasoning=medium,...]`), but the thinking/fast
// flags are cost/latency-changing toggles: an advertised value that carries
// one the selection didn't ask for must NOT match, or a plain `medium`
// selection could silently pin the `fast` or `thinking` variant instead.
function advertisedVariantMatches(wireValue: string, mode: string): boolean {
  const fields = parseBracketFields(wireValue);
  if (!fields) {
    return false;
  }
  const { effort, thinking, fast } = decomposeMode(mode);
  if (effort !== CURSOR_STANDARD_MODE && !fields.values.has(effort)) {
    return false;
  }
  if (thinking !== bracketHasFlag(fields, 'thinking')) {
    return false;
  }
  if (fast !== bracketHasFlag(fields, 'fast')) {
    return false;
  }
  return true;
}
