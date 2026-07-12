<script setup lang="ts">
import { computed } from 'vue';

import type { TodoItem } from '../../../../../../core/tools/todo';
import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import {
  TOOL_ASK_USER_QUESTION,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_LS,
  TOOL_READ,
  TOOL_TODO_WRITE,
  TOOL_WEB_SEARCH,
  TOOL_WRITE,
} from '../../../../../../core/tools/toolNames';
import type { ToolCallInfo } from '../../../../../../core/types';
import { getInputText, getToolLabel } from '../../../../rendering/toolLabel';
import { useCollapsible } from '../collapsible';
import IconSpan from '../IconSpan.vue';
import { useFileLink } from '../useFileLink';
import AskQuestionResult from './AskQuestionResult.vue';
import TodoListView from './TodoListView.vue';
import ToolContentLines from './ToolContentLines.vue';
import { useToolNameSummary } from './toolNameSummary';
import WebSearchView from './WebSearchView.vue';

/**
 * Reproduces `rendering/ToolCallRenderer.ts`'s `renderStoredToolCall` DOM
 * contract for a STORED (non-streaming) tool call — collapsed by default,
 * dispatching to the specialized body components. `toolName`/`toolSummary`
 * come from the shared `useToolNameSummary` composable (also used by
 * `SubagentToolItem.vue`), which wraps `getToolName`/`getToolSummary` —
 * pure, exported functions from `ToolCallRenderer.ts`; only that file's
 * DOM-writing exports are ported rather than reused.
 *
 * `initiallyExpanded` is always `false` here, matching
 * `renderStoredToolCall`'s hardcoded `{ initiallyExpanded: false }` — the
 * legacy function does NOT read `toolCall.isExpanded` for the stored path
 * (only the live `renderToolCall` path resets that field to `false`).
 *
 * `data-tool-id` is stamped here even though `renderStoredToolCall` itself
 * never sets it (only the live `renderToolCall` variant does, via
 * `toolCallElements`) — a deliberate forward-looking addition for the
 * future block-list orchestration (Task 10) to key off of, not part of the
 * characterized legacy contract.
 *
 * The `.specorator-tool-summary` link decoration reproduces
 * `decorateToolSummaryPath`: only Read/Write/Edit (`input.file_path`) and LS
 * (`input.path`, when not `.`) resolve via the shared `useFileLink` composable
 * (same `resolveOpenableVaultPath` resolver `decorateVaultFileLink` uses,
 * shared with `ToolContentLines.vue` and `WriteEditView.vue`) — the raw
 * tool-input path is resolved, not the displayed filename-only summary text.
 */
const props = defineProps<{ toolCall: ToolCallInfo }>();

const { resolve: resolveLink } = useFileLink();

const STATUS_ICONS: Record<string, string> = { completed: 'check', error: 'x', blocked: 'shield-off' };

const isBash = computed(() => props.toolCall.name === TOOL_BASH);
const isTodoWrite = computed(() => props.toolCall.name === TOOL_TODO_WRITE);
const isAskUserQuestion = computed(() => props.toolCall.name === TOOL_ASK_USER_QUESTION);
const isWebSearch = computed(() => props.toolCall.name === TOOL_WEB_SEARCH);

const { toolName, toolSummary } = useToolNameSummary(() => props.toolCall);

const summaryLinkPath = computed<string | null>(() => {
  const { name, input } = props.toolCall;
  if (name === TOOL_READ || name === TOOL_WRITE || name === TOOL_EDIT) {
    return resolveLink(getInputText(input, 'file_path'));
  }
  if (name === TOOL_LS) {
    const path = getInputText(input, 'path', '.');
    return path !== '.' ? resolveLink(path) : null;
  }
  return null;
});

function getTodos(): TodoItem[] | undefined {
  const todos = props.toolCall.input.todos;
  return Array.isArray(todos) ? (todos as TodoItem[]) : undefined;
}

const currentTaskText = computed(() => {
  if (!isTodoWrite.value) return '';
  const current = getTodos()?.find(todo => todo.status === 'in_progress');
  return current ? current.activeForm : '';
});

const todoAllCompleted = computed(() => {
  const todos = getTodos();
  return !!todos && todos.length > 0 && todos.every(todo => todo.status === 'completed');
});

interface StatusInfo {
  cls: string;
  ariaLabel: string;
  icon: string | null;
}

const statusInfo = computed<StatusInfo>(() => {
  if (isTodoWrite.value) {
    const complete = todoAllCompleted.value;
    return {
      cls: complete ? 'status-completed' : 'status-running',
      ariaLabel: complete ? 'Status: completed' : 'Status: in progress',
      icon: complete ? 'check' : null,
    };
  }
  const status = props.toolCall.status;
  return {
    cls: `status-${status}`,
    ariaLabel: `Status: ${status}`,
    icon: STATUS_ICONS[status] ?? null,
  };
});

const { expanded, toggle, onKeydown, ariaLabel } = useCollapsible({
  baseAriaLabel: getToolLabel(props.toolCall.name, props.toolCall.input),
});
</script>

<template>
  <div
    class="specorator-tool-call"
    :class="{ 'specorator-tool-call-bash': isBash, expanded }"
    :data-tool-id="toolCall.id"
  >
    <div
      class="specorator-tool-header"
      tabindex="0"
      role="button"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown="onKeydown"
    >
      <IconSpan
        :icon="getToolIcon(toolCall.name)"
        css-class="specorator-tool-icon"
        :aria-hidden="true"
      />
      <span class="specorator-tool-name">{{ toolName }}</span>
      <span
        class="specorator-tool-summary"
        :class="{ 'specorator-file-link': !!summaryLinkPath }"
        :role="summaryLinkPath ? 'link' : undefined"
        :data-href="summaryLinkPath || null"
      >{{ toolSummary }}</span>
      <span
        v-if="isTodoWrite"
        class="specorator-tool-current"
        :class="{ 'specorator-hidden': expanded }"
      >{{ currentTaskText }}</span>
      <IconSpan
        :icon="statusInfo.icon"
        css-class="specorator-tool-status"
        :class="[statusInfo.cls, { 'specorator-hidden': isTodoWrite && expanded }]"
        :aria-label="statusInfo.ariaLabel"
      />
    </div>
    <div
      class="specorator-tool-content"
      :class="{
        'specorator-hidden': !expanded,
        'specorator-tool-content-todo': isTodoWrite,
        'specorator-todo-panel-content': isTodoWrite,
        'specorator-todo-list-container': isTodoWrite,
        'specorator-tool-content-ask': isAskUserQuestion,
      }"
    >
      <TodoListView
        v-if="isTodoWrite"
        :todos="getTodos()"
      />
      <AskQuestionResult
        v-else-if="isAskUserQuestion"
        :tool-call="toolCall"
      />
      <WebSearchView
        v-else-if="isWebSearch"
        :input="toolCall.input"
        :result="toolCall.result"
      />
      <ToolContentLines
        v-else
        :name="toolCall.name"
        :input="toolCall.input"
        :result="toolCall.result"
      />
    </div>
  </div>
</template>
