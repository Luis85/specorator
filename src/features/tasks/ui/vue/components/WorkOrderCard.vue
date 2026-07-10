<script setup lang="ts">
import { computed, inject } from 'vue';

import { resolvePersona } from '../../../../agents/personaRegistry';
import { DEFAULT_LANE_TITLES } from '../../../config/boardConfigTypes';
import { parseAcceptanceProgress } from '../../../model/acceptanceProgress';
import type { TaskSpec } from '../../../model/taskTypes';
import { CALLBACKS_KEY } from '../boardKeys';
import { LIVE_STATUSES, priorityBars, statusDotClass } from '../statusDot';
import AgentAvatar from './AgentAvatar.vue';
import CardActionCluster from './CardActionCluster.vue';
import LiveStrip from './LiveStrip.vue';

// Parity target: AgentBoardRenderer.renderCard (+ renderMetaRow / renderFooter /
// applyStatusDot). The per-status action cluster is live (Task 4); the reply
// surface + skip chip (Task 4b) remain marked placeholders.
const props = defineProps<{ task: TaskSpec }>();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('WorkOrderCard mounted without CALLBACKS_KEY');
const cb = callbacks;

const status = computed(() => props.task.frontmatter.status);
const live = computed(() => LIVE_STATUSES.has(status.value));
const statusLabel = computed(() => DEFAULT_LANE_TITLES[status.value]);
const statusDotCls = computed(() => statusDotClass(status.value));

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

    <!-- Footer stays visible this task: the reply surface that hides it (is-hidden)
      lands in Task 4. -->
    <div class="specorator-agent-board-card-footer">
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

    <!-- Task 4: reply surface — .specorator-agent-board-card-reply (needs the pause-state store overlay). -->

    <!-- Task 4: skip chip — .specorator-agent-board-card-skip-host (couples to callbacks.getSkipReason). -->
  </div>
</template>
