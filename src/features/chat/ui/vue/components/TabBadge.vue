<script setup lang="ts">
import { computed, ref } from 'vue';

import type { TabBarItem } from '../../../tabs/types';
import { mountIcon } from '../mountIcon';

const props = defineProps<{ item: TabBarItem; isFirstWorkOrder: boolean; isTabStop: boolean }>();
const emit = defineEmits<{ click: [id: string]; close: [id: string]; roving: [event: KeyboardEvent, el: HTMLElement] }>();

// The badge's own root, so roving navigation can locate this badge in the live
// strip without the parent guessing which element fired.
const rootEl = ref<HTMLElement | null>(null);

const isWorkOrder = computed(() => props.item.kind === 'work-order');
const isAgent = computed(() => props.item.kind !== 'work-order' && props.item.isAgentBound === true);

const stateClass = computed(() => {
  const i = props.item;
  return {
    'specorator-tab-badge-active': i.isActive,
    'specorator-tab-badge-attention': i.needsAttention,
    'specorator-tab-badge-working': i.isStreaming,
    'specorator-tab-badge-idle': !i.isActive && !i.needsAttention && !i.isStreaming,
    'specorator-tab-badge--work-order': isWorkOrder.value,
    'specorator-tab-badge--agent': isAgent.value,
    'specorator-tab-badge--work-order-first': props.isFirstWorkOrder,
  };
});

const ariaLabel = computed(() => {
  const q: string[] = [];
  if (isWorkOrder.value) q.push('work order');
  if (isAgent.value) q.push('agent');
  if (props.item.isStreaming) q.push('working');
  return q.length ? `${props.item.title} (${q.join(', ')})` : props.item.title;
});

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('click', props.item.id); return; }
  if (props.item.canClose && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); emit('close', props.item.id); return; }
  if (rootEl.value) emit('roving', e, rootEl.value);
}
function onContextmenu(e: MouseEvent): void {
  if (!props.item.canClose) return;
  e.preventDefault();
  emit('close', props.item.id);
}
function wrenchHost(el: unknown): void { mountIcon(el, 'wrench'); }
function userHost(el: unknown): void { mountIcon(el, 'user'); }
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-tab-badge"
    :class="stateClass"
    role="tab"
    :tabindex="isTabStop ? 0 : -1"
    :aria-selected="item.isActive ? 'true' : 'false'"
    :aria-busy="item.isStreaming ? 'true' : undefined"
    :data-working="item.isStreaming ? 'true' : undefined"
    :data-provider="item.providerId"
    :data-kind="item.kind"
    :aria-label="ariaLabel"
    :aria-keyshortcuts="item.canClose ? 'Delete' : undefined"
    @click="emit('click', item.id)"
    @contextmenu="onContextmenu"
    @keydown="onKeydown"
  >
    <span
      v-if="isWorkOrder"
      :ref="wrenchHost"
      class="specorator-tab-badge-icon"
      aria-hidden="true"
    />
    <template v-else-if="isAgent">
      <span
        :ref="userHost"
        class="specorator-tab-badge-agent-icon"
        aria-hidden="true"
      />
      <span class="specorator-tab-badge-number">{{ item.index }}</span>
    </template>
    <template v-else>
      {{ item.index }}
    </template>
  </div>
</template>
