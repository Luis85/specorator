import { getCachedCursorModelIds } from './cursorModelCatalog';
import {
  CURSOR_STANDARD_MODE,
  decomposeMode,
  extractCursorModeValue,
  resolveCursorFamilyId,
} from './cursorModelFamily';
import { type CursorWireModel,parseCursorWireModel } from './cursorWireModel';

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
  knownIds?: readonly string[],
): string | null {
  if (!advertised || advertised.length === 0) {
    return null;
  }
  if (advertised.includes(resolvedId)) {
    return resolvedId;
  }
  if (resolvedId.trim().toLowerCase() === 'auto') {
    return advertised.find(
      (value) => parseCursorWireModel(value).family === CURSOR_AUTO_ADVERTISED_FAMILY,
    ) ?? null;
  }
  const catalog = knownIds ?? getCachedCursorModelIds();
  const resolvedFamily = resolveCursorFamilyId(resolvedId, catalog);
  const familyMatches = advertised.filter(
    (value) => parseCursorWireModel(value).family === resolvedFamily,
  );
  if (familyMatches.length === 0) {
    return null;
  }
  const resolvedMode = extractCursorModeValue(resolvedId, catalog);
  if (!resolvedMode) {
    // No variant requested: prefer a bare family value. A parameterized sibling
    // is safe only when ACP advertises exactly one legal value for that family;
    // choosing the first of several would silently pick an effort.
    return familyMatches.find((value) => !parseCursorWireModel(value).hasBracket)
      ?? (familyMatches.length === 1 ? familyMatches[0] : null);
  }
  return familyMatches.find((value) => advertisedVariantMatches(value, resolvedMode)) ?? null;
}

// True when the advertised value carries the given flag axis, whether encoded as
// a bare bracket token (`[thinking]`) or a keyed flag (`[fast=true]`).
function bracketHasFlag(fields: CursorWireModel, axis: string): boolean {
  return fields.values.has(axis) || fields.keyed.get(axis) === 'true';
}

/** Reads the reasoning/effort level encoded on the wire, if any. */
function bracketReasoningLevel(fields: CursorWireModel): string | null {
  const reasoning = fields.keyed.get('reasoning');
  if (reasoning) {
    return reasoning;
  }
  const effort = fields.keyed.get('effort');
  if (effort) {
    return effort;
  }
  return null;
}

function bracketEffortMatches(fields: CursorWireModel, effort: string): boolean {
  if (effort === CURSOR_STANDARD_MODE) {
    return true;
  }
  const wireLevel = bracketReasoningLevel(fields);
  if (wireLevel === effort || fields.values.has(effort)) {
    return true;
  }
  return false;
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
  const fields = parseCursorWireModel(wireValue);
  if (!fields.hasBracket) {
    return false;
  }
  const { effort, thinking, fast } = decomposeMode(mode);
  if (!bracketEffortMatches(fields, effort)) {
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
