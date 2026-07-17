<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';

import { getToolIcon } from '../../../../../core/tools/toolIcons';
import { TOOL_TODO_WRITE } from '../../../../../core/tools/toolNames';
import { t } from '../../../../../i18n/i18n';
import type { PanelBashOutput } from '../../../state/BashOutputStore';
import { onActivationKey } from '../activationKeys';
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

const rootEl = ref<HTMLElement | null>(null);
const bashContentEl = ref<HTMLElement | null>(null);

// Parity with the deleted StatusPanel's scroll behavior: DATA updates pin the
// newest content into view (renderBashOutputs scrolled bashContentEl + the mount
// host; updateTodos scrolled the host), while expand/collapse toggles never
// scrolled (`scroll: false`). The projection fans BOTH slices with fresh array
// identities on every emit, so each watch guards on a real content change to
// keep that data-vs-toggle split exact.
function bashChanged(next: PanelBashOutput[], prev: PanelBashOutput[] | undefined): boolean {
  if (!prev || next.length !== prev.length) return true;
  return next.some((a, i) => {
    const b = prev[i];
    return a.id !== b.id || a.status !== b.status || a.output !== b.output || a.exitCode !== b.exitCode;
  });
}
function scrollHostToBottom(): void {
  const host = rootEl.value?.parentElement;
  if (host) host.scrollTop = host.scrollHeight;
}
watch(bash, async (next, prev) => {
  if (!bashChanged(next, prev)) return;
  await nextTick();
  const content = bashContentEl.value;
  if (content) content.scrollTop = content.scrollHeight;
  scrollHostToBottom();
});
watch(todos, async (next, prev) => {
  const changed = !prev || (next?.length ?? 0) !== (prev?.length ?? 0)
    || (next ?? []).some((a, i) => a.content !== prev?.[i]?.content || a.status !== prev?.[i]?.status);
  if (!changed) return;
  await nextTick();
  scrollHostToBottom();
});
// Stable top-level ref functions (not recreated per render) so Vue only mounts
// the static icon once rather than unbind/rebind on every patch.
function copyIconRef(el: unknown): void { mountIcon(el, 'copy'); }
function clearIconRef(el: unknown): void { mountIcon(el, 'trash'); }
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-status-panel"
  >
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
        @keydown="onActivationKey($event, () => (bashExpanded = !bashExpanded))"
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
          <!-- keydown.stop: without it Enter/Space on a focused action bubbles to
               the header's own keydown and toggles the panel (parity with the
               deleted appendActionButton's stopPropagation). -->
          <span
            :ref="copyIconRef"
            class="specorator-status-panel-bash-action specorator-status-panel-bash-action-copy"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.copyAriaLabel')"
            @click="cb.onCopyBashOutput()"
            @keydown.stop="onActivationKey($event, cb.onCopyBashOutput)"
          />
          <span
            :ref="clearIconRef"
            class="specorator-status-panel-bash-action specorator-status-panel-bash-action-clear"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.clearAriaLabel')"
            @click="cb.onClearBashOutputs()"
            @keydown.stop="onActivationKey($event, cb.onClearBashOutputs)"
          />
        </span>
      </div>
      <div
        ref="bashContentEl"
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
            @keydown="onActivationKey($event, () => toggleEntry(info.id))"
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
        @keydown="onActivationKey($event, () => (todoExpanded = !todoExpanded))"
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
