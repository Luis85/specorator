import { setIcon } from 'obsidian';
import { type Ref, ref, watch } from 'vue';

/** Shared toolbar-icon wiring: returns a ref to bind on the icon element;
 *  paints the Obsidian icon when the element appears and whenever a reactive id
 *  changes. Dedupes the toggle/selector icon boilerplate across the composer
 *  toolbar widgets. */
export function useToolbarIcon(iconId: string | Ref<string>): Ref<HTMLElement | null> {
  const iconEl = ref<HTMLElement | null>(null);
  const paint = (): void => {
    const el = iconEl.value;
    if (el) setIcon(el, typeof iconId === 'string' ? iconId : iconId.value);
  };
  // Watch the element ref (immediate) rather than onMounted: the widget stays
  // mounted but gates its icon element behind an internal `v-if` (visibility from
  // the store), so the element can appear AFTER mount when plan-mode/service-tier/
  // etc. become visible on a provider/model change. onMounted painted once while
  // the ref was still null, leaving the later-inserted span blank; watching the ref
  // repaints on the null→element transition.
  watch(iconEl, paint, { immediate: true });
  if (typeof iconId !== 'string') watch(iconId, paint);
  return iconEl;
}
