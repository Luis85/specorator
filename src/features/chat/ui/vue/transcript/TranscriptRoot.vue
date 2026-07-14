<script setup lang="ts">
import { inject, nextTick, onMounted, ref, watch } from 'vue';

import { scrollMessagesToBottom } from '../../../rendering/scrollToBottom';
import LoadEarlierControl from './LoadEarlierControl.vue';
import MessageList from './MessageList.vue';
import { useTranscriptStore } from './stores/transcriptStore';
import StreamingIndicator from './StreamingIndicator.vue';
import { CALLBACKS_KEY, SCROLL_HOST_KEY } from './transcriptKeys';
import { useTranscriptEventRouting } from './useTranscriptEventRouting';
import WelcomeBanner from './WelcomeBanner.vue';
import { RENDER_WINDOW_SIZE, windowStartIndex } from './windowedRenderSetup';

/**
 * The transcript island root. Reproduces `MessageRenderer.renderMessages`'s
 * windowed-render orchestration (`setupWindowedRender` + the trailing-window
 * loop + `loadEarlierMessages`' scroll-anchor preservation) as a Vue tree over
 * the reactive `transcriptStore`, and hands its scroll container out through
 * `SCROLL_HOST_KEY` so `scrollMessagesToBottom` / auto-scroll / the vim-nav
 * keyboard handler (which all operate on `dom.messagesEl`) keep targeting the
 * real scrollable element once this island is wired in (Task 18).
 *
 * `StreamingIndicator` (Task 12) mounts below `MessageList` as a pure
 * read-model over `store.activeStream` — no timer/debounce logic here; that
 * stays engine-side until Task 17 wires it.
 */
const store = useTranscriptStore();
const callbacks = inject(CALLBACKS_KEY, undefined);
if (callbacks) {
  useTranscriptEventRouting(callbacks.subscribe);
}

// Opaque-ish scroll host: Vue owns this element and its (reactive) children,
// unlike TabContentHost's fully-opaque host, but the engine still needs a
// direct handle for scrollTop reads/writes and NavigationController's keyboard
// scan. `nodeType === 1` (not `instanceof HTMLElement`) so a popout window's
// own HTMLElement constructor doesn't fail the guard — see `mountIcon.ts`.
const scrollEl = ref<HTMLElement | null>(null);
const mountScrollHost = inject(SCROLL_HOST_KEY, undefined);
onMounted(() => {
  if (scrollEl.value && scrollEl.value.nodeType === 1 && mountScrollHost) {
    mountScrollHost(scrollEl.value);
  }
  if (store.messages.length > 0) {
    void requestHistoryScroll();
  }
});

let historyScrollPending = false;

async function requestHistoryScroll(): Promise<void> {
  historyScrollPending = true;
  await nextTick();
  finishHistoryScrollIfReady();
}

function finishHistoryScrollIfReady(): void {
  const el = scrollEl.value;
  if (
    !historyScrollPending
    || !el
    || el.querySelector('[data-specorator-markdown-pending="true"]')
  ) {
    return;
  }
  scrollMessagesToBottom(el);
  historyScrollPending = false;
}

function onMarkdownRendered(): void {
  if (historyScrollPending) {
    void nextTick().then(finishHistoryScrollIfReady);
  }
}

// Trailing render window, mirroring `renderMessages`. The projection pushes a
// FRESH `store.messages` array on EVERY emit (`ChatState.messages` is a copying
// getter), so this watch fires on every streaming chunk / indicator tick — not
// only on conversation switch. Resetting to the trailing window on each of
// those would snap a "Load earlier" window the user grew mid-stream back down,
// hiding the older messages they just loaded. So reset ONLY on a genuine
// conversation-identity change — a load / switch / truncate / rewind — detected
// by the first message's id changing, the list shrinking, or the first load
// into an empty transcript. On a plain append (streaming growth or a newly sent
// message) the window `[start, end]` already includes the new tail, so keep
// `renderWindowStart` put; only clamp defensively.
const renderWindowStart = ref(windowStartIndex(store.messages.length));
watch(
  () => [store.conversationId, store.projectionRevision] as const,
  ([nextId, nextRevision], [prevId, prevRevision]) => {
    const isConversationReset =
      nextId !== prevId
      || nextRevision !== prevRevision;
    if (!isConversationReset) return;
    renderWindowStart.value = windowStartIndex(store.messages.length);
    if (store.messages.length > 0) {
      void requestHistoryScroll();
    }
  },
);
watch(
  () => store.messages,
  (next, prev) => {
    // An in-place truncation of the SAME conversation (rewind) shrinks the list
    // without touching conversationId or projectionRevision, so the reset watch
    // above never fires. Clamping alone would leave `renderWindowStart` parked
    // past the new tail (e.g. 90 → a 20-message list) and `MessageList` would
    // slice away the whole transcript. Recompute the trailing window on a shrink
    // so the surviving messages render; a plain append keeps the window put.
    if (prev && next.length < prev.length) {
      renderWindowStart.value = windowStartIndex(next.length);
      if (next.length > 0) {
        void requestHistoryScroll();
      }
      return;
    }
    renderWindowStart.value = Math.min(Math.max(renderWindowStart.value, 0), next.length);
  },
);

watch(
  () => store.loadingText,
  async (next, previous) => {
    if (previous === null || next !== null || store.messages.length === 0) return;
    await requestHistoryScroll();
  },
);

/**
 * Grows the window by one chunk and preserves the scroll anchor exactly like
 * `loadEarlierMessages`: capture pre-insert scrollHeight/scrollTop, let Vue
 * mount the earlier chunk above, then restore `scrollTop` by the height delta
 * once the DOM has actually grown (`nextTick`).
 */
async function onLoadEarlier(): Promise<void> {
  const newStart = Math.max(0, renderWindowStart.value - RENDER_WINDOW_SIZE);
  const el = scrollEl.value;
  if (!el) {
    renderWindowStart.value = newStart;
    return;
  }

  const prevScrollHeight = el.scrollHeight;
  const prevScrollTop = el.scrollTop;
  renderWindowStart.value = newStart;
  await nextTick();
  el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
}
</script>

<template>
  <div
    ref="scrollEl"
    class="specorator-messages"
    @specorator-markdown-rendered="onMarkdownRendered"
  >
    <WelcomeBanner
      :greeting="store.greeting"
      :hydration-error="store.hydrationError"
    />
    <LoadEarlierControl
      v-if="renderWindowStart > 0"
      @load-earlier="onLoadEarlier"
    />
    <MessageList
      :messages="store.messages"
      :render-window-start="renderWindowStart"
    />
    <StreamingIndicator />
    <div
      v-if="store.loadingText !== null"
      class="specorator-loading specorator-loading--overlay"
    >
      <div class="specorator-loading-spinner" />
      <div class="specorator-loading-text">
        {{ store.loadingText }}
      </div>
    </div>
  </div>
</template>
