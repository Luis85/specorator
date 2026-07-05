/**
 * Structural deep-equality for the plain, serializable data the Library stores
 * carry (RosterAgent, SkillLibraryRow, LoopDefinition, QuickAction — all JSON
 * shapes: primitives, arrays, plain objects). Not a general-purpose deepEqual:
 * no Map/Set/Date/RegExp/cyclic handling, because these rows never contain them.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr && bIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Merge a freshly-loaded list into the previous one BY IDENTITY: an item in
 * `next` whose key matches an item in `prev` AND is deep-equal reuses the `prev`
 * object reference; changed, added, or removed items take their `next` value.
 *
 * Every Library store reload replaces its whole reactive array with fresh
 * objects parsed off disk. With brand-new identities for every row, child
 * render effects keyed on the item reference (AvatarSlot's `watchEffect` +
 * canvas/icon repaint, card icon `setIcon`) re-run on EVERY mutation even though
 * the visible row is unchanged — visible flicker. Routing the post-load
 * assignment through this helper keeps untouched rows referentially stable so
 * their effects don't re-run; only the mutated/added/removed rows update.
 *
 * Returns a NEW array (so the shallowRef assignment still triggers list-level
 * reactivity) whose element order follows `next`.
 */
export function mergeById<T>(
  prev: readonly T[],
  next: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const prevByKey = new Map<string, T>();
  for (const item of prev) prevByKey.set(keyOf(item), item);
  return next.map((item) => {
    const previous = prevByKey.get(keyOf(item));
    return previous !== undefined && deepEqual(previous, item) ? previous : item;
  });
}
