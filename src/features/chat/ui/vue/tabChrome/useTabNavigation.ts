import { inject, onScopeDispose, type Ref, ref, watch } from 'vue';

import { cancelScheduledAnimationFrame, scheduleAnimationFrame, type ScheduledAnimationFrame } from '../../../../../utils/animationFrame';
import { SCROLL_HOST_KEY } from './tabChromeKeys';

/**
 * Imperative scroll geometry for the NavOverlay, bound to the transcript scroll
 * host (received as a reactive ref via SCROLL_HOST_KEY; pushed post-transcript-mount
 * by MountedTabChrome.setScrollHost). Reproduces the deleted NavigationSidebar:
 * rAF-debounced overflow → `visible`; top/bottom smooth scrollTo; prev/next
 * offsetTop scan of `.specorator-message-user`; rebind on the host swap. Popout-safe
 * (`nodeType === 1`, never instanceof HTMLElement).
 */
export function useTabNavigation(): {
  visible: Ref<boolean>;
  scrollTop: () => void;
  scrollBottom: () => void;
  scrollPrev: () => void;
  scrollNext: () => void;
} {
  const scrollHost = inject(SCROLL_HOST_KEY, ref<HTMLElement | null>(null));
  const visible = ref(false);
  let pendingFrame: ScheduledAnimationFrame | null = null;
  let bound: HTMLElement | null = null;
  const onScroll = (): void => scheduleVisibility();
  let resizeObserver: ResizeObserver | null = null;

  function applyVisibility(): void {
    const el = scrollHost.value;
    if (!el || el.nodeType !== 1) { visible.value = false; return; }
    visible.value = el.scrollHeight > el.clientHeight + 50;
  }
  function scheduleVisibility(): void {
    if (pendingFrame !== null) return;
    const view = scrollHost.value?.ownerDocument.defaultView ?? null;
    pendingFrame = scheduleAnimationFrame(() => { pendingFrame = null; applyVisibility(); }, view);
  }

  function bind(el: HTMLElement | null): void {
    if (bound) { bound.removeEventListener('scroll', onScroll); resizeObserver?.disconnect(); resizeObserver = null; }
    bound = el && el.nodeType === 1 ? el : null;
    if (bound) {
      bound.addEventListener('scroll', onScroll, { passive: true });
      const view = bound.ownerDocument.defaultView;
      if (view && 'ResizeObserver' in view) {
        resizeObserver = new view.ResizeObserver(() => scheduleVisibility());
        resizeObserver.observe(bound);
      }
    }
    applyVisibility();
  }

  watch(scrollHost, (el) => bind(el), { immediate: true });

  function scrollTop(): void { scrollHost.value?.scrollTo({ top: 0, behavior: 'smooth' }); }
  function scrollBottom(): void { const el = scrollHost.value; el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }

  function scan(direction: 'prev' | 'next'): void {
    const el = scrollHost.value;
    if (!el) return;
    const messages = Array.from(el.querySelectorAll<HTMLElement>('.specorator-message-user'));
    if (messages.length === 0) return;
    const scrollTopPos = el.scrollTop;
    const threshold = 30;
    if (direction === 'prev') {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].offsetTop < scrollTopPos - threshold) { el.scrollTo({ top: messages[i].offsetTop - 10, behavior: 'smooth' }); return; }
      }
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].offsetTop > scrollTopPos + threshold) { el.scrollTo({ top: messages[i].offsetTop - 10, behavior: 'smooth' }); return; }
      }
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }

  onScopeDispose(() => {
    if (pendingFrame !== null) cancelScheduledAnimationFrame(pendingFrame);
    if (bound) bound.removeEventListener('scroll', onScroll);
    resizeObserver?.disconnect();
  });

  return { visible, scrollTop, scrollBottom, scrollPrev: () => scan('prev'), scrollNext: () => scan('next') };
}
