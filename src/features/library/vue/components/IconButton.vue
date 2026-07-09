<script setup lang="ts">
import { setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';

// `pressed` defaults to undefined (NOT Vue's Boolean-cast false): an absent
// prop must leave the button a plain icon action with no aria-pressed, so the
// three-state (unset / off / on) survives to the template.
const props = withDefaults(
  defineProps<{
    icon: string;
    ariaLabel: string;
    /** A tri-state toggle: boolean renders aria-pressed + the is-on accent;
     *  undefined leaves the button a plain (non-toggle) icon action. */
    pressed?: boolean;
    disabled?: boolean;
    /** Fill the glyph in the on-state (e.g. a favorited star) rather than only
     *  recoloring the outline. */
    filled?: boolean;
  }>(),
  { pressed: undefined },
);

// The native MouseEvent rides along so a caller can keep `.stop` at the call
// site (`@activate.stop`): the emit is a custom event with no DOM identity of
// its own, so the modifier needs the real event to stopPropagation() on.
const emit = defineEmits<{ activate: [event: MouseEvent] }>();

// jsdom (and testing-library's fireEvent) dispatch clicks straight at a
// disabled button, unlike a real browser — guard so a disabled icon never
// emits.
function onClick(event: MouseEvent): void {
  if (props.disabled === true) return;
  emit('activate', event);
}

/** setIcon host (function ref — no template ref needed for a single glyph). */
function applyIcon(el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) setIcon(el, props.icon);
}
</script>

<template>
  <button
    :ref="applyIcon"
    type="button"
    class="specorator-vue-icon-btn"
    :class="{ 'is-on': pressed === true, 'is-filled': filled === true }"
    :aria-pressed="typeof pressed === 'boolean' ? (pressed ? 'true' : 'false') : undefined"
    :aria-label="ariaLabel"
    :disabled="disabled === true"
    @click="onClick"
  />
</template>

<style scoped>
/* Strip Obsidian's native button chrome so the glyph reads as an inline marker,
   not a CTA, while keeping a real icon-sized hit area with a hover affordance.
   Scoped (0,2,0) beats the host button baseline (0,1,1) by specificity. */
.specorator-vue-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-space-3xs);
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: var(--sp-radius-s);
  color: var(--sp-text-faint);
  cursor: pointer;
}

/* setIcon() renders the lucide <svg> imperatively — no data-v, reach via
   :deep(). */
.specorator-vue-icon-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.specorator-vue-icon-btn:hover {
  color: var(--sp-text);
  background: var(--sp-surface-hover);
}

.specorator-vue-icon-btn.is-on {
  color: var(--sp-accent);
}

/* Filled on-state: fill the outline glyph so the toggle reads at a glance. */
.specorator-vue-icon-btn.is-on.is-filled :deep(svg) {
  fill: currentColor;
}
</style>
