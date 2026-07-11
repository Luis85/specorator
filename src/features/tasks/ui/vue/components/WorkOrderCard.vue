<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { resolvePersona } from '../../../../agents/personaRegistry';
import { DEFAULT_LANE_TITLES } from '../../../config/boardConfigTypes';
import { parseAcceptanceProgress } from '../../../model/acceptanceProgress';
import type { TaskSpec } from '../../../model/taskTypes';
import { CALLBACKS_KEY } from '../boardKeys';
import { LIVE_STATUSES, priorityBars, statusDotClass } from '../statusDot';
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

const status = computed(() => props.task.frontmatter.status);
const live = computed(() => LIVE_STATUSES.has(status.value));
const statusLabel = computed(() => DEFAULT_LANE_TITLES[status.value]);
const statusDotCls = computed(() => statusDotClass(status.value));

// Parity with renderCard's `showReply`: the reply surface + hidden footer are
// driven by STATUS alone (needs_input / needs_approval), NOT by the presence of a
// live pause overlay — so a reloaded paused card is still answerable.
const showReply = computed(() => status.value === 'needs_input' || status.value === 'needs_approval');

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
// renderFooter's `(callbacks.resolvePersona ?? resolvePersona)(agent)`.
const persona = computed(() => (cb.resolvePersona ?? resolvePersona)(props.task.frontmatter.agent));
</script>

<template>
  <div
    class="specorator-agent-board-card"
    :class="[`specorator-agent-board-card--${status}`, { 'specorator-agent-board-card--live-actions': live }]"
    @click="cb.onOpenDetail(props.task)"
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
    </div>

    <CardActionCluster
      :task="props.task"
      :status="status"
    />

    <div class="specorator-agent-board-card-meta">
      <span class="specorator-agent-board-card-meta-engine">{{ engineText }}</span>
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
      <div
        class="specorator-agent-board-card-skip-chip"
        @click.stop="ackSkip"
      >
        {{ t('tasks.board.queueSkipped', { reason: skipReason }) }}
      </div>
    </div>
  </div>
</template>
