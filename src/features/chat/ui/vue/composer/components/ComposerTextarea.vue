<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { INPUT_EL_KEY } from '../composerKeys';
import MentionDropdown from '../dropdowns/MentionDropdown.vue';
import ResumeSessionDropdown from '../dropdowns/ResumeSessionDropdown.vue';
import SlashCommandDropdown from '../dropdowns/SlashCommandDropdown.vue';

// Vue RENDERS the element but the engine OWNS its behavior. We register the raw
// node once and NEVER bind v-model, NEVER re-render it, and bind NO reactive
// attributes: `.value`, height, caret, IME composition, `disabled`, AND the
// `placeholder` are all opaque engine-owned state after mount. `InputController`
// writes `.value`; `autoResizeTextarea` runs on input; `SelectionController` /
// `ChatDropController` attach listeners here; `TriggerInputMode` sets
// `inputEl.placeholder` directly for `#`/`!` modes and restores the default on
// exit. A v-model or reactive `:disabled`/`:placeholder` would fight the engine
// (IME/caret/placeholder) — the static attributes below are the initial values
// only; the engine mutates the live properties. This is the entire cutover risk,
// contained to "Vue touches this node exactly once (to register it)".
// `nodeType === 1` (not `instanceof HTMLElement`) keeps a popout window's own
// constructor from failing the guard — see mountIcon.ts.
const el = ref<HTMLTextAreaElement | null>(null);
const register = inject(INPUT_EL_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <textarea
    ref="el"
    class="specorator-input"
    dir="auto"
    rows="3"
    placeholder="How can i help you today?"
  />
  <!-- Caret-anchored dropdown overlays. Each renders only when
       `store.dropdown.kind` matches; keyboard navigation still flows through
       `tabInputWiring` → the detectors → the coordinator (NO listeners here).
       The textarea above stays engine-owned — these are ADDED siblings only. -->
  <SlashCommandDropdown />
  <MentionDropdown />
  <ResumeSessionDropdown />
</template>
