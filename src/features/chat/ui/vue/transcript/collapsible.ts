import { computed, type ComputedRef, type Ref, ref } from 'vue';

/**
 * Vue-idiomatic reproduction of `rendering/collapsible.ts`'s `setupCollapsible`
 * primitive: a `ref<boolean>` instead of a mutated state object, driven by
 * template bindings (`:class="{ expanded }"` on the wrapper,
 * `:class="{ 'specorator-hidden': !expanded }"` on the content,
 * `:aria-expanded="expanded"`) instead of imperative DOM writes.
 */
export interface UseCollapsibleOptions {
  /** Initial expanded state (default: false). */
  initiallyExpanded?: boolean;
  /** Base label for aria-label (appends "click to expand/collapse"). Omit to
   *  leave aria-label unmanaged (e.g. a static aria-label set in the template). */
  baseAriaLabel?: string;
}

export interface UseCollapsibleResult {
  expanded: Ref<boolean>;
  toggle: () => void;
  onKeydown: (e: KeyboardEvent) => void;
  ariaLabel: ComputedRef<string | undefined>;
}

export function useCollapsible(options: UseCollapsibleOptions = {}): UseCollapsibleResult {
  const { initiallyExpanded = false, baseAriaLabel } = options;

  const expanded = ref(initiallyExpanded);

  function toggle(): void {
    expanded.value = !expanded.value;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }

  const ariaLabel = computed(() => {
    if (!baseAriaLabel) return undefined;
    const action = expanded.value ? 'click to collapse' : 'click to expand';
    return `${baseAriaLabel} - ${action}`;
  });

  return { expanded, toggle, onKeydown, ariaLabel };
}
