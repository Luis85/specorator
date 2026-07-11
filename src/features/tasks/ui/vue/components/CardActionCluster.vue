<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject, onBeforeUnmount, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec, TaskStatus } from '../../../model/taskTypes';
import { CARD_ACTIONS, type CardAction, type CardActionModel, FALLBACK_CARD_ACTIONS } from '../../cardActions';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import { LIVE_STATUSES } from '../statusDot';
import { useOpenMenu } from '../useOpenMenu';
import OverflowMenu from './OverflowMenu.vue';

// The per-card action cluster: per-status primary button + optional secondary +
// ⋯ overflow menu, driven by the CARD_ACTIONS spec table. There is NO
// busy/disabled state in this layer: actions gate ONLY on their `available`
// predicate and on `primary: null`.
const props = defineProps<{ task: TaskSpec; status: TaskStatus }>();

// Late-bound callbacks: inject the one stable object the view provides at mount
// and invoke its methods at CLICK time (mirrors the imperative getCallbacks()
// escape, so a click resolves against current board state, not a render snapshot).
const callbacks = inject(CALLBACKS_KEY) ?? null;

// Any status the spec table does not tabulate falls back to an Open-note-only
// menu, so every card stays actionable.
const model = computed<CardActionModel>(() => CARD_ACTIONS[props.status] ?? FALLBACK_CARD_ACTIONS);
// Live cards (running / needs_input / needs_approval) keep the cluster on-screen.
const persistent = computed(() => LIVE_STATUSES.has(props.status));

const primary = computed(() => model.value.primary);
const primaryVariant = computed(() => primary.value?.variant ?? 'cta');
const primaryIcon = computed(() => primary.value?.icon ?? '');

// The secondary button honors its `available` guard at RENDER time (parity: a
// deleted conversation hides "Go to conversation" rather than dead-rendering a
// button; the cluster re-renders as state changes, re-evaluating the guard).
const secondary = computed<CardAction | null>(() => {
  const action = model.value.secondary;
  if (!action) return null;
  if (action.available && !(callbacks != null && action.available(callbacks, props.task))) return null;
  return action;
});
const secondaryIcon = computed(() => secondary.value?.icon ?? '');

// Computed (not a setup-time const) so a locale switch re-resolves the ⋯
// aria-label, matching the reactive `{{ t(...) }}` labels below.
const moreLabel = computed(() => t('tasks.board.cardAction.moreActions'));

function runAction(action: CardAction): void {
  if (callbacks) action.run(callbacks, props.task);
}

function mountMore(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'more-horizontal');
}

// --- ⋯ overflow menu open state ----------------------------------------------
const clusterEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const { open: claimMenu, release: releaseMenu } = useOpenMenu();

// The is-menu-open class lives on the CARD (parity: keeps the hover cluster
// visible while the body-portaled menu is open), reached the same way the
// imperative layer does — cluster.closest('.specorator-agent-board-card').
function cardEl(): HTMLElement | null {
  return clusterEl.value?.closest('.specorator-agent-board-card') ?? null;
}

function closeMenu(): void {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  cardEl()?.classList.remove('is-menu-open');
  releaseMenu(closeMenu);
}

function openMenu(): void {
  // Only one card menu is open at a time — close any other before opening ours.
  claimMenu(closeMenu);
  menuOpen.value = true;
  cardEl()?.classList.add('is-menu-open');
}

function toggleMenu(): void {
  if (menuOpen.value) closeMenu();
  else openMenu();
}

// A card removed mid-open must release the board-wide slot (and drop the class).
onBeforeUnmount(closeMenu);
</script>

<template>
  <div
    ref="clusterEl"
    class="specorator-agent-board-card-actions"
    :class="{ 'specorator-agent-board-card-actions--persistent': persistent }"
    @click.stop
  >
    <button
      v-if="primary"
      type="button"
      class="specorator-agent-board-card-action-primary"
      :class="`specorator-agent-board-card-action-primary--${primaryVariant}`"
      @click.stop="runAction(primary)"
    >
      <span
        :ref="(el) => mountLucide(el, primaryIcon)"
        class="specorator-agent-board-card-action-icon"
        aria-hidden="true"
      />
      <span class="specorator-agent-board-card-action-label">{{ t(primary.labelKey) }}</span>
    </button>

    <button
      v-if="secondary"
      type="button"
      class="specorator-agent-board-card-action-secondary"
      @click.stop="runAction(secondary)"
    >
      <span
        :ref="(el) => mountLucide(el, secondaryIcon)"
        class="specorator-agent-board-card-action-icon"
        aria-hidden="true"
      />
      <span class="specorator-agent-board-card-action-label">{{ t(secondary.labelKey) }}</span>
    </button>

    <button
      ref="triggerEl"
      type="button"
      class="specorator-agent-board-card-action-more"
      :aria-label="moreLabel"
      aria-haspopup="menu"
      @click.stop="toggleMenu"
    >
      <span
        :ref="mountMore"
        class="specorator-agent-board-card-action-icon"
        aria-hidden="true"
      />
    </button>

    <OverflowMenu
      v-if="menuOpen"
      :trigger="triggerEl"
      :menu="model.menu"
      :task="props.task"
      :callbacks="callbacks"
      @close="closeMenu"
    />
  </div>
</template>
