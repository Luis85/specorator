<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import type { ConversationMeta } from '../../../../../core/types';
import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';
import { formatConversationDate } from './conversationHistoryFormat';

const HISTORY_RENDER_WINDOW_SIZE = 50;

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ConversationHistoryDropdown mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const open = ref(false);
const visibleCount = ref(HISTORY_RENDER_WINDOW_SIZE);
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const rootEl = ref<HTMLElement | null>(null);
const renameInputEl = ref<HTMLInputElement | null>(null);

const ordered = computed<ConversationMeta[]>(() => {
  const items = [...store.conversations.items];
  const currentId = store.conversations.currentConversationId;
  if (currentId) {
    const idx = items.findIndex((c) => c.id === currentId);
    if (idx >= HISTORY_RENDER_WINDOW_SIZE) {
      const [cur] = items.splice(idx, 1);
      items.unshift(cur);
    }
  }
  return items;
});
const visible = computed(() => ordered.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < ordered.value.length);

function isCurrent(id: string): boolean { return id === store.conversations.currentConversationId; }
function itemIcon(id: string) { return (el: unknown) => mountIcon(el, isCurrent(id) ? 'message-square-dot' : 'message-square'); }
function actionIcon(name: string) { return (el: unknown) => mountIcon(el, name); }
// Function ref (not a bare `ref="..."` string): a plain ref inside `v-for`
// auto-collects into an array in Vue 3, which would make `renameInputEl.value`
// an array instead of the single input element.
function renameInputRef(el: unknown): void {
  renameInputEl.value = (el as HTMLInputElement | null) ?? null;
}

// Arrow-function expressions (not hoisted `function` declarations) for every
// closure that reads `cb`: TS's narrowing of `cb` from the guard above only
// survives closures that can't be invoked before the narrowing runs, which
// excludes hoisted declarations (mirrors WorkOrderActivityDropdown.vue).
const toggleOpen = (): void => {
  open.value = !open.value;
  if (open.value) {
    visibleCount.value = HISTORY_RENDER_WINDOW_SIZE;
    cb.onOpenHistory();
  }
};
function close(): void { open.value = false; renamingId.value = null; }
function showMore(): void { visibleCount.value += HISTORY_RENDER_WINDOW_SIZE; }

function isNewTabModifierClick(e: MouseEvent): boolean {
  return !e.altKey && !e.shiftKey && (e.metaKey || e.ctrlKey);
}
// Parity with the deleted ConversationHistoryView: a header history row always
// opens the conversation in a (new-or-existing) tab via `onOpenConversationInNewTab`
// — plain, modifier, and middle clicks all target the same action (the modifier
// only suppresses the browser default), never replacing the active tab's
// conversation. The loaded current row has no action (its list of messages is
// already on screen); only an empty current row is re-openable.
function isRowActionable(conv: ConversationMeta): boolean {
  return !isCurrent(conv.id) || (conv.messageCount ?? 0) === 0;
}
const onRowClick = (conv: ConversationMeta, e: MouseEvent): void => {
  if (!isRowActionable(conv)) return;
  if (isNewTabModifierClick(e)) e.preventDefault();
  cb.onOpenConversationInNewTab(conv.id, true); close();
};
const onRowAux = (conv: ConversationMeta, e: MouseEvent): void => {
  if (e.button !== 1 || !isRowActionable(conv)) return;
  e.preventDefault(); e.stopPropagation();
  cb.onOpenConversationInNewTab(conv.id, true); close();
};
const onContextMenu = (conv: ConversationMeta, e: MouseEvent): void => {
  e.preventDefault(); e.stopPropagation();
  cb.onConversationContextMenu(conv.id, e, () => { void startRename(conv); }, () => close());
};

async function startRename(conv: ConversationMeta): Promise<void> {
  renamingId.value = conv.id;
  renameValue.value = conv.title;
  await nextTick();
  // Parity with the deleted view's showRenameInput: focus + select so the user
  // can start typing immediately, and so Enter's blur() actually fires (blur()
  // is a no-op unless the element is the current activeElement).
  renameInputEl.value?.focus();
  renameInputEl.value?.select();
}
const commitRename = (conv: ConversationMeta): void => {
  if (renamingId.value !== conv.id) return; // Escape already cancelled
  const next = renameValue.value.trim() || conv.title;
  cb.onRenameConversation(conv.id, next);
  renamingId.value = null;
};
function onRenameKeydown(e: KeyboardEvent, conv: ConversationMeta): void {
  // Commit directly rather than relying on the follow-on native blur event
  // (blur() is a no-op unless the input is the document's activeElement, which
  // isn't guaranteed in every embedding). A real blur — e.g. clicking another
  // row — still commits via @blur below.
  if (e.key === 'Enter' && !e.isComposing) { commitRename(conv); (e.target as HTMLInputElement).blur(); }
  else if (e.key === 'Escape' && !e.isComposing) { renamingId.value = null; }
}
function onHeaderKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
}

function onDocClick(e: MouseEvent): void {
  if (!open.value) return;
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close();
}
// Scope to the component's ownerDocument so click-away still fires in Obsidian
// popout windows; capture it on mount so removal targets the same document.
let listenerDoc: Document = document;
onMounted(() => {
  listenerDoc = rootEl.value?.ownerDocument ?? document;
  listenerDoc.addEventListener('click', onDocClick);
});
onBeforeUnmount(() => listenerDoc.removeEventListener('click', onDocClick));
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-history-container"
  >
    <div
      :ref="actionIcon('history')"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      aria-label="Chat history"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      @click.stop="toggleOpen()"
      @keydown="onHeaderKeydown($event)"
    />
    <div
      class="specorator-history-menu"
      :class="{ visible: open }"
    >
      <div class="specorator-history-header">
        <span>Conversations</span>
      </div>
      <div class="specorator-history-list">
        <div
          v-if="ordered.length === 0"
          class="specorator-history-empty"
        >
          No conversations
        </div>
        <div
          v-for="conv in visible"
          :key="conv.id"
          class="specorator-history-item"
          :class="{ active: isCurrent(conv.id) }"
          @contextmenu="onContextMenu(conv, $event)"
        >
          <div
            :ref="itemIcon(conv.id)"
            class="specorator-history-item-icon"
          />
          <div
            class="specorator-history-item-content"
            @click.stop="onRowClick(conv, $event)"
            @auxclick="onRowAux(conv, $event)"
          >
            <input
              v-if="renamingId === conv.id"
              :ref="renameInputRef"
              v-model="renameValue"
              class="specorator-rename-input"
              type="text"
              @blur="commitRename(conv)"
              @keydown="onRenameKeydown($event, conv)"
            >
            <div
              v-else
              class="specorator-history-item-title"
              :title="conv.title"
            >
              {{ conv.title }}
            </div>
            <div class="specorator-history-item-date">
              {{ isCurrent(conv.id) ? 'Current session' : formatConversationDate(conv.lastResponseAt ?? conv.createdAt) }}
            </div>
          </div>
          <div class="specorator-history-item-actions">
            <span
              v-if="conv.titleGenerationStatus === 'pending'"
              :ref="actionIcon('loader-2')"
              class="specorator-action-btn specorator-action-loading"
              aria-label="Generating title..."
            />
            <button
              v-else-if="conv.titleGenerationStatus === 'failed'"
              :ref="actionIcon('refresh-cw')"
              class="specorator-action-btn"
              aria-label="Regenerate title"
              @click.stop="cb.onRegenerateConversationTitle(conv.id)"
            />
            <button
              :ref="actionIcon('pencil')"
              class="specorator-action-btn"
              aria-label="Rename"
              @click.stop="startRename(conv)"
            />
            <button
              :ref="actionIcon('trash-2')"
              class="specorator-action-btn specorator-delete-btn"
              aria-label="Delete"
              @click.stop="cb.onDeleteConversation(conv.id)"
            />
          </div>
        </div>
        <div
          v-if="hasMore"
          class="specorator-history-show-more"
        >
          <button
            type="button"
            class="specorator-history-show-more-btn"
            @click.stop="showMore()"
          >
            {{ t('chat.history.showMore') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
