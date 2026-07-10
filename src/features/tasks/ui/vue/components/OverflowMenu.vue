<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec } from '../../../model/taskTypes';
import type { AgentBoardRenderCallbacks, CardAction } from '../../agentBoardCardActions';
import { mountLucide } from '../mountLucide';

// Parity target: portalPopover.ts (PortalPopover), reimplemented as a Vue
// <Teleport>. Same leak-safe contract: a body-portaled node positioned
// `fixed`-from-rect that flips up near the viewport bottom, closing on
// outside-mousedown / scroll / resize / Escape — every listener torn down
// together (once), the trigger refocused. The node itself is Vue-owned: the
// parent unmounts us (v-if) to remove it, so teardown only sheds listeners.
const props = defineProps<{
  trigger: HTMLElement | null;
  menu: CardAction[];
  task: TaskSpec;
  callbacks: AgentBoardRenderCallbacks | null;
}>();

// Self-close paths ask the parent to unmount us; the parent owns the open flag.
const emit = defineEmits<{ close: [] }>();

// Positioning constants — mirror portalPopover.ts exactly.
const ITEM_HEIGHT = 34;
const MENU_PADDING = 8;
const MENU_MIN_WIDTH = 180;
const OFFSET = 4;
const VIEWPORT_MARGIN = 8;

interface MenuRow {
  label: string;
  icon: string;
  danger: boolean;
  run: () => void;
}

// Resolved lazily (this component mounts only when the menu opens), so the
// `available` guards re-evaluate against current state — parity with
// PortalPopover's `items: () => menu.filter(...)`.
const rows = computed<MenuRow[]>(() =>
  props.menu
    .filter((action) => !action.available || (props.callbacks != null && action.available(props.callbacks, props.task)))
    .map((action) => ({
      label: t(action.labelKey),
      icon: action.icon,
      danger: action.danger ?? false,
      run: () => {
        if (props.callbacks) action.run(props.callbacks, props.task);
      },
    })),
);

// Portal onto the trigger's OWN document body (popout-safe — never the global
// `document`); fall back only when there is no trigger to anchor to.
const targetBody = computed(() => props.trigger?.ownerDocument.body ?? document.body);

const menuEl = ref<HTMLElement | null>(null);
const droppedUp = ref(false);
const top = ref(0);
const left = ref(0);

function position(): void {
  const trigger = props.trigger;
  const el = menuEl.value;
  if (!trigger || !el) return;
  const rect = trigger.getBoundingClientRect();
  // The trigger's own window so a popout pane flips/clamps against its viewport.
  const win = trigger.ownerDocument.defaultView ?? window;
  const viewportHeight = win.innerHeight;
  const viewportWidth = win.innerWidth;
  const estimatedHeight = rows.value.length * ITEM_HEIGHT + MENU_PADDING;
  const dropUp = rect.bottom + estimatedHeight + OFFSET > viewportHeight && rect.top - estimatedHeight > 0;
  droppedUp.value = dropUp;
  top.value = dropUp ? rect.top - estimatedHeight - OFFSET : rect.bottom + OFFSET;
  // Right-align under the trigger, clamped into the viewport.
  left.value = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.right - MENU_MIN_WIDTH, viewportWidth - MENU_MIN_WIDTH - VIEWPORT_MARGIN),
  );
}

// --- teardown: remove every listener exactly once, refocus the trigger -------
let torn = false;
const cleanups: Array<() => void> = [];

function teardown(): void {
  if (torn) return;
  torn = true;
  for (const cleanup of cleanups.splice(0)) cleanup();
  // Return focus to the trigger so keyboard users are not stranded (skip when
  // the trigger has left the DOM — e.g. the whole card unmounted).
  if (props.trigger?.isConnected) props.trigger.focus();
}

/** Any self-close path: shed listeners, then ask the parent to unmount us. */
function requestClose(): void {
  teardown();
  emit('close');
}

function onPointerDown(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (props.trigger?.contains(target) || menuEl.value?.contains(target)) return;
  requestClose();
}
function onReflow(): void {
  requestClose();
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    requestClose();
  }
}

function onItemClick(row: MenuRow): void {
  // Close first (parity): requestClose() sheds listeners synchronously and asks
  // the parent to unmount us, so the action runs against a torn-down menu (the
  // teleported node itself is removed on the next Vue flush, when v-if unmounts).
  requestClose();
  row.run();
}

function stop(event: Event): void {
  event.stopPropagation();
}

onMounted(() => {
  const trigger = props.trigger;
  if (!trigger) {
    // No anchor to position against — close immediately rather than orphan a node.
    requestClose();
    return;
  }
  position();
  const ownerDoc = trigger.ownerDocument;
  const win = ownerDoc.defaultView ?? window;
  // mousedown (capture) so a drag-start outside also dismisses; scroll (capture)
  // catches scrolling inside any ancestor (e.g. the lane); resize reflows-closed.
  ownerDoc.addEventListener('mousedown', onPointerDown, true);
  win.addEventListener('scroll', onReflow, true);
  win.addEventListener('resize', onReflow);
  cleanups.push(
    () => ownerDoc.removeEventListener('mousedown', onPointerDown, true),
    () => win.removeEventListener('scroll', onReflow, true),
    () => win.removeEventListener('resize', onReflow),
  );
  menuEl.value?.focus();
});

// A force-close (another card's menu opening) and a card unmount both unmount
// us; run the same teardown exactly once so no listener leaks.
onBeforeUnmount(teardown);
</script>

<template>
  <Teleport :to="targetBody">
    <div
      ref="menuEl"
      class="specorator-agent-board-card-menu"
      :class="{ 'specorator-agent-board-card-menu--up': droppedUp }"
      role="menu"
      tabindex="-1"
      :style="{ top: `${top}px`, left: `${left}px` }"
      @click="stop"
      @mousedown="stop"
      @keydown="onKeyDown"
    >
      <button
        v-for="(row, index) in rows"
        :key="index"
        type="button"
        class="specorator-agent-board-card-menu-item"
        :class="{ 'specorator-agent-board-card-menu-item--danger': row.danger }"
        role="menuitem"
        @click="onItemClick(row)"
      >
        <span
          :ref="(el) => mountLucide(el, row.icon)"
          class="specorator-agent-board-card-menu-item-icon"
          aria-hidden="true"
        />
        <span>{{ row.label }}</span>
      </button>
    </div>
  </Teleport>
</template>
