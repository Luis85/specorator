import { onBeforeUnmount, onMounted, ref } from 'vue';

export interface InlineChoiceListHandle {
  handleKeyDown: (event: KeyboardEvent) => void;
}

/**
 * Shared root lifecycle for the two plan-decision cards: focus/scroll on
 * mount, keyboard delegation, optional abort, and exactly-once resolution.
 */
export function useInlinePlanCard<Decision>(
  resolve: (decision: Decision | null) => void,
  signal?: AbortSignal,
) {
  const rootEl = ref<HTMLElement | null>(null);
  const choiceListRef = ref<InlineChoiceListHandle | null>(null);
  let resolved = false;

  function cleanupAbortListener(): void {
    signal?.removeEventListener('abort', onAbort);
  }

  function handleResolve(decision: Decision | null): void {
    if (resolved) return;
    resolved = true;
    cleanupAbortListener();
    resolve(decision);
  }

  function onAbort(): void {
    handleResolve(null);
  }

  function onRootKeyDown(event: KeyboardEvent): void {
    if (!resolved) {
      choiceListRef.value?.handleKeyDown(event);
    }
  }

  function focusRoot(): void {
    rootEl.value?.focus();
  }

  onMounted(() => {
    window.requestAnimationFrame(() => {
      rootEl.value?.focus();
      rootEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  onBeforeUnmount(() => {
    handleResolve(null);
  });

  return {
    choiceListRef,
    focusRoot,
    handleResolve,
    onRootKeyDown,
    rootEl,
  };
}
