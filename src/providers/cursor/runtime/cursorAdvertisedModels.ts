import { getCachedCursorModelIds } from './cursorModelCatalog';
import { extractCursorModeValue, resolveCursorFamilyId } from './cursorModelFamily';

/**
 * Resolves the CLI-picked id to a session-advertised wire id: an exact value
 * match, or the advertised value whose family prefix (everything before `[`)
 * matches the CLI-resolved family AND whose bracket variant matches the
 * resolved mode (e.g. `gpt-5.4-medium` → `gpt-5.4[reasoning=medium]`, never the
 * first family sibling, which would silently pin a different effort). Returns
 * null when nothing lines up — the caller then skips the update rather than
 * sending a value Cursor would accept-then-reject on the next prompt.
 */
export function matchAdvertisedModelValue(
  advertised: string[] | null,
  resolvedId: string,
): string | null {
  if (!advertised || advertised.length === 0) {
    return null;
  }
  if (advertised.includes(resolvedId)) {
    return resolvedId;
  }
  const knownIds = getCachedCursorModelIds();
  const resolvedFamily = resolveCursorFamilyId(resolvedId, knownIds);
  const familyMatches = advertised.filter((value) => value.split('[', 1)[0] === resolvedFamily);
  if (familyMatches.length === 0) {
    return null;
  }
  const resolvedMode = extractCursorModeValue(resolvedId, knownIds);
  if (!resolvedMode) {
    // No variant requested: prefer the bare family value over an arbitrary
    // bracket variant, falling back to the first family sibling.
    return familyMatches.find((value) => !value.includes('[')) ?? familyMatches[0];
  }
  return familyMatches.find((value) => advertisedVariantMatches(value, resolvedMode)) ?? null;
}

// Advertised wire ids encode the variant in brackets (`gpt-5.4[reasoning=high]`,
// `claude-4.6-opus[thinking]`); a value matches when any bracket segment's
// (possibly `key=`-prefixed) value equals the resolved mode token.
function advertisedVariantMatches(wireValue: string, mode: string): boolean {
  const start = wireValue.indexOf('[');
  if (start === -1) {
    return false;
  }
  const end = wireValue.lastIndexOf(']');
  const inner = wireValue.slice(start + 1, end > start ? end : undefined);
  return inner.split(',').some((segment) => {
    const eq = segment.indexOf('=');
    const value = eq === -1 ? segment : segment.slice(eq + 1);
    return value.trim() === mode;
  });
}
