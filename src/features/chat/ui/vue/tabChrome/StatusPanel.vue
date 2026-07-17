<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { getToolIcon } from '../../../../../core/tools/toolIcons';
import { TOOL_TODO_WRITE } from '../../../../../core/tools/toolNames';
import { t } from '../../../../../i18n/i18n';
import { mountIcon } from '../mountIcon';
import TodoListView from '../transcript/blocks/TodoListView.vue';
import IconSpan from '../transcript/IconSpan.vue';
import { useTabChromeStore } from './stores/tabChromeStore';
import { CALLBACKS_KEY } from './tabChromeKeys';

// Native StatusPanel (replaces the imperative StatusPanel.ts). Todos + bang-bash
// output list; collapse/per-entry-expand are VIEW-LOCAL refs (no engine coupling);
// copy + clear are callbacks. Emits the legacy .specorator-status-panel-* classes.
//
// IconSpan only forwards `icon`/`css-class`/`aria-hidden` — it does not forward
// interactive attrs (`role`/`tabindex`/`aria-label`/`@click`/`@keydown`). The copy
// and clear action buttons need those, so they render as plain interactive spans
// mounted via `mountIcon` directly instead of `IconSpan`.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('StatusPanel mounted without CALLBACKS_KEY');
const store = useTabChromeStore();

const todos = computed(() => store.todos);
const hasTodos = computed(() => (todos.value?.length ?? 0) > 0);
const completedCount = computed(() => todos.value?.filter((x) => x.status === 'completed').length ?? 0);
const totalCount = computed(() => todos.value?.length ?? 0);
const currentTask = computed(() => todos.value?.find((x) => x.status === 'in_progress') ?? null);
const allComplete = computed(() => totalCount.value > 0 && completedCount.value === totalCount.value);
const todoExpanded = ref(false);

const bash = computed(() => store.bashOutputs);
const hasBash = computed(() => bash.value.length > 0);
const bashExpanded = ref(true);
const entryExpanded = ref<Record<string, boolean>>({});
const latestBash = computed(() => bash.value.at(-1) ?? null);

function truncate(s: string, max = 60): string { return s.length <= max ? s : s.slice(0, max) + '...'; }
function isEntryExpanded(id: string): boolean { return entryExpanded.value[id] ?? true; }
function toggleEntry(id: string): void { entryExpanded.value = { ...entryExpanded.value, [id]: !isEntryExpanded(id) }; }
function onKey(e: KeyboardEvent, fn: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
}
// Stable top-level ref functions (not recreated per render) so Vue only mounts
// the static icon once rather than unbind/rebind on every patch.
function copyIconRef(el: unknown): void { mountIcon(el, 'copy'); }
function clearIconRef(el: unknown): void { mountIcon(el, 'trash'); }
</script>

<template>
  <div class="specorator-status-panel">
    <div
      class="specorator-status-panel-bash"
      :class="{ 'specorator-hidden': !hasBash }"
    >
      <div
        class="specorator-tool-header specorator-status-panel-bash-header"
        tabindex="0"
        role="button"
        :aria-expanded="bashExpanded ? 'true' : 'false'"
        @click="bashExpanded = !bashExpanded"
        @keydown="onKey($event, () => (bashExpanded = !bashExpanded))"
      >
        <IconSpan
          icon="terminal"
          css-class="specorator-tool-icon"
          :aria-hidden="true"
        />
        <span class="specorator-tool-label">{{ bashExpanded ? t('chat.bangBash.commandPanel') : (latestBash ? truncate(latestBash.command) : t('chat.bangBash.commandPanel')) }}</span>
        <span
          class="specorator-status-panel-bash-actions"
          @click.stop
        >
          <span
            :ref="copyIconRef"
            class="specorator-status-panel-bash-action specorator-status-panel-bash-action-copy"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.copyAriaLabel')"
            @click="cb.onCopyBashOutput()"
            @keydown="onKey($event, cb.onCopyBashOutput)"
          />
          <span
            :ref="clearIconRef"
            class="specorator-status-panel-bash-action specorator-status-panel-bash-action-clear"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.clearAriaLabel')"
            @click="cb.onClearBashOutputs()"
            @keydown="onKey($event, cb.onClearBashOutputs)"
          />
        </span>
      </div>
      <div
        class="specorator-status-panel-bash-content"
        :class="{ 'specorator-hidden': !bashExpanded }"
      >
        <div
          v-for="info in bash"
          :key="info.id"
          class="specorator-tool-call specorator-status-panel-bash-entry"
        >
          <div
            class="specorator-tool-header"
            tabindex="0"
            role="button"
            :aria-expanded="isEntryExpanded(info.id) ? 'true' : 'false'"
            @click="toggleEntry(info.id)"
            @keydown="onKey($event, () => toggleEntry(info.id))"
          >
            <IconSpan
              icon="dollar-sign"
              css-class="specorator-tool-icon"
              :aria-hidden="true"
            />
            <span class="specorator-tool-label">{{ t('chat.bangBash.commandLabel', { command: truncate(info.command) }) }}</span>
            <IconSpan
              v-if="info.status === 'completed'"
              icon="check"
              :css-class="`specorator-tool-status status-${info.status}`"
            />
            <IconSpan
              v-else-if="info.status === 'error'"
              icon="x"
              :css-class="`specorator-tool-status status-${info.status}`"
            />
            <span
              v-else
              :class="`specorator-tool-status status-${info.status}`"
            />
          </div>
          <div
            class="specorator-tool-content"
            :class="{ 'specorator-hidden': !isEntryExpanded(info.id) }"
          >
            <div class="specorator-tool-result-row">
              <span class="specorator-tool-result-text">{{ info.status === 'running' && !info.output ? t('chat.bangBash.running') : info.output }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="specorator-status-panel-todos"
      :class="{ 'specorator-hidden': !hasTodos }"
    >
      <div
        class="specorator-status-panel-header"
        tabindex="0"
        role="button"
        :aria-expanded="todoExpanded ? 'true' : 'false'"
        :aria-label="`${todoExpanded ? 'Collapse' : 'Expand'} task list - ${completedCount} of ${totalCount} completed`"
        @click="todoExpanded = !todoExpanded"
        @keydown="onKey($event, () => (todoExpanded = !todoExpanded))"
      >
        <IconSpan
          :icon="getToolIcon(TOOL_TODO_WRITE)"
          css-class="specorator-status-panel-icon"
        />
        <span class="specorator-status-panel-label">Tasks ({{ completedCount }}/{{ totalCount }})</span>
        <IconSpan
          v-if="!todoExpanded && allComplete"
          icon="check"
          css-class="specorator-status-panel-status status-completed"
        />
        <span
          v-if="!todoExpanded && currentTask"
          class="specorator-status-panel-current"
        >{{ currentTask.activeForm }}</span>
      </div>
      <div
        class="specorator-status-panel-content specorator-todo-list-container"
        :class="{ 'specorator-hidden': !todoExpanded }"
      >
        <TodoListView :todos="todos ?? undefined" />
      </div>
    </div>
  </div>
</template>
