<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { formatRelativeTime } from '../../../../../utils/date';
import { resolvePersona } from '../../../../agents/personaRegistry';
import { DEFAULT_LANE_TITLES } from '../../../config/boardConfigTypes';
import { parseAcceptanceProgress } from '../../../model/acceptanceProgress';
import type { TaskSpec } from '../../../model/taskTypes';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import { ATTENTION_STATUSES, LIVE_STATUSES, priorityBars, statusDotClass } from '../statusDot';
import { useAgentBoardStore } from '../stores/agentBoardStore';
import AgentAvatar from './AgentAvatar.vue';
import CardActionCluster from './CardActionCluster.vue';
import CardReplySurface from './CardReplySurface.vue';
import LiveStrip from './LiveStrip.vue';

// One work-order card: title row + status dot + meta + footer + live strip +
// per-status action cluster + reply surface + skip chip.
const props = defineProps<{ task: TaskSpec }>();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('WorkOrderCard mounted without CALLBACKS_KEY');
const cb = callbacks;

const store = useAgentBoardStore();

// The live pause overlay only ENRICHES the reply prompt (event-sourced question /
// approval action + risk). It does NOT gate the surface — CardReplySurface falls
// back to the note's `pause_reason` when this is null, so a reloaded paused card
// stays answerable.
const pause = computed(() => store.pauseState.get(props.task.frontmatter.id) ?? null);

// Queue skip chip: the reactive store overlay (mirrors the runner's non-reactive
// skip map via task:queue-skipped / clears), null when the card is not skipped
// (parity: renderSkipChipFor). Reading the store — rather than a task-only callback
// computed — is what makes an in-session skip paint and an ack un-paint without a
// note change (the note is unchanged, so load()'s mergeById keeps the task ref).
const skipReason = computed(() => store.skipReasons.get(props.task.frontmatter.id) ?? null);

function ackSkip(): void {
  // Clear the reactive overlay immediately (the chip vanishes) AND the runner's
  // own shared skip map via the callback, so the queue doesn't instantly re-skip.
  store.clearSkip(props.task.frontmatter.id);
  cb.onAckSkip?.(props.task);
}

// A "workflow work-order": it either declares a successor (chain_* config) or sits
// in a chain (chained_to/chained_from). Frontmatter carries these as loosely-typed
// extension keys, so read through a Record cast (parity with the coordinator/board).
const isChained = computed(() => {
  // Spread into a fresh Record — TaskFrontmatter has no index signature, so a direct
  // `as Record<string, unknown>` cast trips TS2352 (idiom shared with chainFrontmatter).
  const fm: Record<string, unknown> = { ...props.task.frontmatter };
  return Boolean(fm.chain_template || fm.chain_title || fm.chain_objective || fm.chained_to || fm.chained_from);
});

const status = computed(() => props.task.frontmatter.status);
const live = computed(() => LIVE_STATUSES.has(status.value));
const statusLabel = computed(() => DEFAULT_LANE_TITLES[status.value]);
const statusDotCls = computed(() => statusDotClass(status.value));

// Parity with renderCard's `showReply`: the reply surface + hidden footer are
// driven by STATUS alone (needs_input / needs_approval), NOT by the presence of a
// live pause overlay — so a reloaded paused card is still answerable.
const showReply = computed(() => ATTENTION_STATUSES.has(status.value));

// Accessible name for the focusable card: title + the same status label the
// dot's tooltip shows, so keyboard/SR users hear both without entering the card.
const cardAriaLabel = computed(() =>
  t('tasks.board.card.ariaLabel', { title: props.task.frontmatter.title, status: statusLabel.value }),
);

// Keyboard access for the card itself, gated to when the CARD is the focused
// element — inner controls (action cluster, reply field) keep their own key
// semantics and bubble here with target ≠ currentTarget. That guard covers the
// context-menu keys too: ContextMenu / Shift+F10 inside a nested input must
// keep the control's native menu, not be captured for the card menu.
// Enter/Space open the detail modal; ContextMenu / Shift+F10 open the
// right-click menu positioned on the card's rect (the menu API takes a
// MouseEvent for placement).
function onCardKeydown(event: KeyboardEvent): void {
  const card = event.currentTarget as HTMLElement;
  if (event.target !== card) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    cb.onOpenDetail(props.task);
    return;
  }
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    cb.onContextMenu(
      props.task,
      new MouseEvent('contextmenu', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }),
    );
  }
}

// Settled-card age stamp ("3h ago") off frontmatter.updated. Live cards skip it
// (the live strip already shows elapsed). Reads the store's MINUTE clock, not
// nowMs — so the 1s tick keeps re-rendering only live strips, and settled cards
// refresh their age once per minute.
const updatedAgo = computed(() =>
  live.value ? undefined : formatRelativeTime(props.task.frontmatter.updated, store.nowMinuteMs),
);

// Absolute local timestamp for the age stamp's tooltip.
const updatedTitle = computed(() => {
  const ms = Date.parse(props.task.frontmatter.updated);
  return Number.isNaN(ms) ? props.task.frontmatter.updated : new Date(ms).toLocaleString();
});

const engineText = computed(
  () => `${props.task.frontmatter.provider ?? '—'} / ${props.task.frontmatter.model ?? '—'}`,
);
const priority = computed(() => priorityBars(props.task.frontmatter.priority));

const progress = computed(() => parseAcceptanceProgress(props.task.sections.acceptanceCriteria));
const progressComplete = computed(() => progress.value.done >= progress.value.total);
const progressLabel = computed(() => `${progress.value.done}/${progress.value.total}`);
const fillWidth = computed(() =>
  progress.value.total > 0 ? `${(progress.value.done / progress.value.total) * 100}%` : '0%',
);

// The persona resolves through the callback's resolver when the board supplies
// one (roster-backed), else the built-in Standard resolver — parity with
// renderFooter's `(callbacks.resolvePersona ?? resolvePersona)(agent)`. The
// resolver reads the view's non-reactive roster cache, so depend on the store's
// roster version too: a `roster:changed` bump re-resolves the avatar/name even
// though mergeById kept this card's (unchanged) task ref.
const persona = computed(() => {
  void store.rosterVersion;
  return (cb.resolvePersona ?? resolvePersona)(props.task.frontmatter.agent);
});
</script>

<template>
  <div
    class="specorator-agent-board-card"
    :class="[`specorator-agent-board-card--${status}`, { 'specorator-agent-board-card--live-actions': live }]"
    role="listitem"
    tabindex="0"
    :aria-label="cardAriaLabel"
    :data-task-id="props.task.frontmatter.id"
    @click="cb.onOpenDetail(props.task)"
    @keydown="onCardKeydown"
    @contextmenu.prevent="cb.onContextMenu(props.task, $event)"
  >
    <div class="specorator-agent-board-card-title-row">
      <span
        :class="statusDotCls"
        :aria-label="statusLabel"
        :title="statusLabel"
      />
      <div class="specorator-agent-board-card-title">
        {{ props.task.frontmatter.title }}
      </div>
      <span
        v-if="isChained"
        :ref="(el) => mountLucide(el, 'link')"
        class="specorator-agent-board-card-chain"
        :title="t('tasks.board.card.chainedBadge')"
        :aria-label="t('tasks.board.card.chainedBadge')"
      />
    </div>

    <CardActionCluster
      :task="props.task"
      :status="status"
    />

    <div class="specorator-agent-board-card-meta">
      <span class="specorator-agent-board-card-meta-engine">{{ engineText }}</span>
      <span
        v-if="updatedAgo"
        class="specorator-agent-board-card-meta-age"
        :title="updatedTitle"
      >{{ t('tasks.board.card.updatedAgo', { ago: updatedAgo }) }}</span>
      <span
        class="specorator-agent-board-card-priority"
        :class="`specorator-agent-board-card-priority--${priority.modifier}`"
      >
        <span
          class="specorator-agent-board-card-priority-bars"
          aria-hidden="true"
        >
          <span
            v-for="(barFilled, index) in priority.filled"
            :key="index"
            class="specorator-agent-board-card-priority-bar"
            :class="{ 'is-filled': barFilled }"
          />
        </span>
        <span class="specorator-agent-board-card-priority-label">{{ props.task.frontmatter.priority }}</span>
      </span>
    </div>

    <!-- Footer is hidden (not destroyed) while the reply surface shows, so a
      resumed card recovers its progress + assignee seam. -->
    <div
      class="specorator-agent-board-card-footer"
      :class="{ 'is-hidden': showReply }"
    >
      <div
        v-if="progress.total > 0"
        class="specorator-agent-board-card-progress"
        :class="{ 'is-complete': progressComplete }"
        :title="progressLabel"
      >
        <span class="specorator-agent-board-card-progress-track">
          <span
            class="specorator-agent-board-card-progress-fill"
            :style="{ width: fillWidth }"
          />
        </span>
        <span class="specorator-agent-board-card-progress-count">{{ progressLabel }}</span>
      </div>
      <span
        v-else
        class="specorator-agent-board-card-footer-spacer"
      />
      <AgentAvatar
        :persona="persona"
        :size="20"
        host-class="specorator-agent-board-card-assignee"
      />
    </div>

    <LiveStrip
      v-if="live"
      :task="props.task"
    />

    <!-- Key on status so a direct needs_input↔needs_approval flip remounts the
      surface and re-seeds its reply field (no stale typed text carried across a
      branch change). An in-place prompt change (same status, new pause overlay)
      keeps the key stable, so the prompt re-derives without a remount. -->
    <CardReplySurface
      v-if="showReply"
      :key="status"
      :task="props.task"
      :pause="pause"
    />

    <div
      v-if="skipReason"
      class="specorator-agent-board-card-skip-host"
    >
      <!-- A real button (keyboard + focus ring for free); the × glyph signals
        the click-to-dismiss affordance the old static-looking div hid. -->
      <button
        type="button"
        class="specorator-agent-board-card-skip-chip"
        :title="t('tasks.board.queueSkippedDismiss')"
        @click.stop="ackSkip"
      >
        <span>{{ t('tasks.board.queueSkipped', { reason: skipReason }) }}</span>
        <span
          class="specorator-agent-board-card-skip-chip-x"
          aria-hidden="true"
        >×</span>
      </button>
    </div>
  </div>
</template>
