<script setup lang="ts">
import { computed, ref } from 'vue';

import type { TabBarItem, TabId } from '../../../tabs/types';
import TabBadge from './TabBadge.vue';

const props = defineProps<{ items: TabBarItem[]; onTabClick: (id: TabId) => void; onTabClose: (id: TabId) => void }>();

const stripEl = ref<HTMLElement | null>(null);

// Roving tab stop: the active badge, else the first (parity with TabBar.update).
const rovingIndex = computed(() => Math.max(props.items.findIndex((i) => i.isActive), 0));

// First work-order badge after a chat group gets the extra-gap modifier.
const firstWorkOrderId = computed(() => {
  let sawChat = false;
  for (const i of props.items) {
    if (i.kind === 'work-order') { if (sawChat) return i.id; }
    else sawChat = true;
  }
  return null;
});

// currentEl is the badge that fired (emitted by TabBadge). Read the live badge
// set from the strip at keydown time so it never holds stale refs — same as
// TabBar.handleRovingKey.
function onRoving(e: KeyboardEvent, currentEl: HTMLElement): void {
  const badges = Array.from(stripEl.value?.querySelectorAll<HTMLElement>('.specorator-tab-badge') ?? []);
  const current = badges.indexOf(currentEl);
  if (current === -1 || badges.length === 0) return;
  let target: number;
  switch (e.key) {
    case 'ArrowRight': target = (current + 1) % badges.length; break;
    case 'ArrowLeft': target = (current - 1 + badges.length) % badges.length; break;
    case 'Home': target = 0; break;
    case 'End': target = badges.length - 1; break;
    default: return;
  }
  e.preventDefault();
  if (target === current) return;
  badges[current].setAttribute('tabindex', '-1');
  badges[target].setAttribute('tabindex', '0');
  badges[target].focus();
}
</script>

<template>
  <div
    ref="stripEl"
    class="specorator-tab-badges"
    role="tablist"
  >
    <TabBadge
      v-for="(item, i) in items"
      :key="item.id"
      :item="item"
      :is-first-work-order="item.id === firstWorkOrderId"
      :is-tab-stop="i === rovingIndex"
      @click="onTabClick"
      @close="onTabClose"
      @roving="onRoving"
    />
  </div>
</template>
