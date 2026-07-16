import { setIcon } from 'obsidian';
import { onMounted, type Ref, ref, watch } from 'vue';

/** Shared toolbar-icon wiring: returns a ref to bind on the icon element;
 *  paints the Obsidian icon on mount and whenever a reactive id changes. Dedupes
 *  the toggle/selector icon boilerplate across the composer toolbar widgets. */
export function useToolbarIcon(iconId: string | Ref<string>): Ref<HTMLElement | null> {
  const iconEl = ref<HTMLElement | null>(null);
  const paint = (): void => {
    const el = iconEl.value;
    if (el) setIcon(el, typeof iconId === 'string' ? iconId : iconId.value);
  };
  onMounted(paint);
  if (typeof iconId !== 'string') watch(iconId, paint);
  return iconEl;
}
