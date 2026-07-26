<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { MAX_RAIL_WIDTH, MIN_RAIL_WIDTH } from '../stores/teamChatStore';

/**
 * Drag handle between the roster rail and the DM pane (design §1.6).
 *
 * `role="separator"` with `aria-valuenow/min/max` plus ArrowLeft/ArrowRight keyboard
 * resizing — a mouse-only splitter would put the rail's width out of reach for anyone
 * navigating by keyboard, and a bare `div` with a mousedown handler announces as nothing.
 *
 * Pointer events (not mouse) so a touch/pen drag works, with `setPointerCapture` so a
 * fast drag that outruns the 6px handle keeps tracking instead of dropping mid-gesture.
 */
const KEYBOARD_STEP_PX = 16;

const props = defineProps<{ width: number }>();
const emit = defineEmits<{ resize: [width: number] }>();

const dragging = ref(false);
const handleEl = ref<HTMLElement | null>(null);
// Captured at gesture start: resolving width from the pointer's absolute X would make
// the rail jump to the cursor on mousedown rather than move by the drag delta.
let startX = 0;
let startWidth = 0;

function clamp(width: number): number {
  return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(width)));
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true;
  startX = event.clientX;
  startWidth = props.width;
  handleEl.value?.setPointerCapture(event.pointerId);
  event.preventDefault(); // suppress the text-selection drag the gesture would otherwise start
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  emit('resize', clamp(startWidth + (event.clientX - startX)));
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  // releasePointerCapture throws if the capture was already lost (element detached
  // mid-drag, or the browser released it) — the gesture is over either way.
  try {
    handleEl.value?.releasePointerCapture(event.pointerId);
  } catch {
    // already released; nothing to clean up
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    emit('resize', clamp(props.width - KEYBOARD_STEP_PX));
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    emit('resize', clamp(props.width + KEYBOARD_STEP_PX));
  }
}

// A drag in flight when the leaf closes would otherwise leave `dragging` true on a
// detached element; reset so no stray pointermove can fire against it.
onBeforeUnmount(() => { dragging.value = false; });
</script>

<template>
  <div
    ref="handleEl"
    class="specorator-team-rail-separator"
    :class="{ 'is-dragging': dragging }"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="t('teamChat.railResize')"
    :aria-valuenow="props.width"
    :aria-valuemin="MIN_RAIL_WIDTH"
    :aria-valuemax="MAX_RAIL_WIDTH"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.specorator-team-rail-separator {
  /* Narrow visually, but a comfortable grab target via the padding-free hit area
     plus the cursor affordance; the rail's own border supplies the visible line. */
  flex: 0 0 auto;
  width: 6px;
  margin-inline: -3px; /* straddle the border rather than adding a 6px gutter */
  cursor: col-resize;
  background: transparent;
  transition: background-color 120ms ease;
  /* Above the panes so the grab area isn't swallowed by the roster's scroll box. */
  position: relative;
  z-index: 1;
}
.specorator-team-rail-separator:hover,
.specorator-team-rail-separator.is-dragging {
  background: var(--sp-accent);
}
.specorator-team-rail-separator:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: -1px;
}

@media (prefers-reduced-motion: reduce) {
  .specorator-team-rail-separator {
    transition: none;
  }
}
</style>
