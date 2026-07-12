<script setup lang="ts">
import { computed } from 'vue';

import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import { TOOL_TASK } from '../../../../../../core/tools/toolNames';
import type { SubagentInfo, ToolCallInfo } from '../../../../../../core/types';
import { useCollapsible } from '../collapsible';
import { useIconDiv } from './subagentIconDiv';
import SubagentToolItem from './SubagentToolItem.vue';
import {
  buildAsyncHeaderAriaLabel,
  buildAsyncRootClasses,
  buildAsyncStatusPill,
  buildSyncHeaderAriaLabel,
  buildSyncRootClasses,
  buildSyncStatusPill,
  getAsyncDisplayStatus,
  getAsyncStatusText,
  resolveSubagentResultText,
  resolveTaskSubagent,
  truncateDescription,
} from './subagentViewModel';

/**
 * Renders a STORED subagent block — sync (nested tools, inline result) and
 * async (background lifecycle: pending/running/completed/error/orphaned) —
 * reproducing `SubagentRenderer.ts`'s `renderStoredSubagent`/
 * `renderStoredAsyncSubagent` DOM contract.
 *
 * Two projection paths, matching the legacy renderer's two entry points:
 *  - Task path (`{ toolCall }`): projects the incoming `ToolCallInfo` through
 *    `subagentViewModel.resolveTaskSubagent` (mirrors
 *    `MessageSubagentRenderer.renderTaskSubagent`). Provider-agnostic — the
 *    Task projection never reads capabilities.
 *  - Provider-lifecycle path (`{ subagentInfo }`): renders a pre-built
 *    `SubagentInfo` the block-list orchestrator already consolidated from a
 *    CLI provider's spawn+wait/close tool set (mirrors
 *    `MessageSubagentRenderer.renderProviderLifecycleSubagent`). That
 *    consolidation needs the message's full `toolCalls`, so it happens in
 *    `blockListViewModel` (which has the message) and is handed in here.
 *
 * `providerId` is accepted for API parity; the projection logic below never
 * reads it (the Task projection is provider-agnostic, and the lifecycle
 * `SubagentInfo` is already resolved upstream).
 */
const props = defineProps<{
  toolCall?: ToolCallInfo;
  mode?: 'sync' | 'async';
  providerId: string;
  subagentInfo?: SubagentInfo;
}>();

const subagent = computed(() =>
  props.subagentInfo ?? resolveTaskSubagent(props.toolCall as ToolCallInfo, props.mode)
);
const isAsync = computed(() => subagent.value.mode === 'async');

const truncatedDescription = computed(() => truncateDescription(subagent.value.description));

const displayStatus = computed(() =>
  isAsync.value ? getAsyncDisplayStatus(subagent.value.asyncStatus) : subagent.value.status
);

const headerAriaLabel = computed(() =>
  isAsync.value
    ? buildAsyncHeaderAriaLabel(subagent.value.description, subagent.value.asyncStatus)
    : buildSyncHeaderAriaLabel(subagent.value.description, subagent.value.status)
);

const statusText = computed(() => (isAsync.value ? getAsyncStatusText(subagent.value.asyncStatus) : ''));

const statusPill = computed(() =>
  isAsync.value ? buildAsyncStatusPill(subagent.value.asyncStatus) : buildSyncStatusPill(subagent.value.status)
);

const rootClasses = computed(() =>
  isAsync.value ? buildAsyncRootClasses(displayStatus.value) : buildSyncRootClasses(subagent.value.status)
);

const promptText = computed(() => subagent.value.prompt || 'No prompt provided');

const resultInfo = computed(() => resolveSubagentResultText(displayStatus.value, subagent.value.result));

// Root header aria-label is intentionally NOT `useCollapsible`'s toggling
// `ariaLabel` — the legacy `setupCollapsible` call for the root header never
// receives a `baseAriaLabel`, so it stays fixed at "click to expand" even
// after the block is expanded (only `createSection`/tool-item headers pass
// `baseAriaLabel` and toggle their own aria-label text).
const { expanded, toggle, onKeydown } = useCollapsible();

const {
  expanded: promptExpanded,
  toggle: togglePrompt,
  onKeydown: onPromptKeydown,
  ariaLabel: promptAriaLabel,
} = useCollapsible({ baseAriaLabel: 'Prompt' });

const {
  expanded: resultExpanded,
  toggle: toggleResult,
  onKeydown: onResultKeydown,
  ariaLabel: resultAriaLabel,
} = useCollapsible({ baseAriaLabel: 'Result' });

const iconEl = useIconDiv(() => getToolIcon(TOOL_TASK));
const statusIconEl = useIconDiv(() => statusPill.value.icon);
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    class="specorator-subagent-list"
    :class="[rootClasses, { expanded }]"
    :data-subagent-id="!isAsync ? subagent.id : undefined"
    :data-async-subagent-id="isAsync ? subagent.id : undefined"
  >
    <div
      class="specorator-subagent-header"
      tabindex="0"
      role="button"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="headerAriaLabel"
      @click="toggle"
      @keydown="onKeydown"
    >
      <div
        ref="iconEl"
        class="specorator-subagent-icon"
        aria-hidden="true"
      />
      <div class="specorator-subagent-label">{{ truncatedDescription }}</div>
      <div
        v-if="isAsync"
        class="specorator-subagent-status-text"
      >{{ statusText }}</div>
      <div
        ref="statusIconEl"
        class="specorator-subagent-status"
        :class="statusPill.pillClass"
        :aria-label="statusPill.ariaLabel"
      />
    </div>
    <div
      class="specorator-subagent-content"
      :class="{ 'specorator-hidden': !expanded }"
    >
      <div
        class="specorator-subagent-section specorator-subagent-section-prompt"
        :class="{ expanded: promptExpanded }"
      >
        <div
          class="specorator-subagent-section-header"
          tabindex="0"
          role="button"
          :aria-expanded="promptExpanded ? 'true' : 'false'"
          :aria-label="promptAriaLabel"
          @click="togglePrompt"
          @keydown="onPromptKeydown"
        >
          <div class="specorator-subagent-section-title">Prompt</div>
        </div>
        <div
          class="specorator-subagent-section-body specorator-subagent-prompt-body"
          :class="{ 'specorator-hidden': !promptExpanded }"
        >
          <div class="specorator-subagent-prompt-text">{{ promptText }}</div>
        </div>
      </div>

      <div class="specorator-subagent-tools">
        <SubagentToolItem
          v-for="tc in subagent.toolCalls"
          :key="tc.id"
          :tool-call="tc"
        />
      </div>

      <div
        v-if="resultInfo"
        class="specorator-subagent-section specorator-subagent-section-result"
        :class="{ expanded: resultExpanded }"
      >
        <div
          class="specorator-subagent-section-header"
          tabindex="0"
          role="button"
          :aria-expanded="resultExpanded ? 'true' : 'false'"
          :aria-label="resultAriaLabel"
          @click="toggleResult"
          @keydown="onResultKeydown"
        >
          <div class="specorator-subagent-section-title">Result</div>
        </div>
        <div
          class="specorator-subagent-section-body specorator-subagent-result-body"
          :class="{ 'specorator-hidden': !resultExpanded }"
        >
          <div class="specorator-subagent-result-output">{{ resultInfo.text }}</div>
        </div>
      </div>
    </div>
  </div>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
