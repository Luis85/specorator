<script setup lang="ts">
import { TFile, TFolder } from 'obsidian';
import { computed, inject } from 'vue';

import { DEFAULT_CHAT_PROVIDER_ID } from '../../../../../core/providers/types';
import type { ChatMessage } from '../../../../../core/types';
import { extractVaultMentions } from '../../../../../utils/vaultMentions';
import BlockList from './blocks/BlockList.vue';
import { resolveBlockListItems, shouldRenderToolCall } from './blocks/blockListViewModel';
import TextBlock from './blocks/TextBlock.vue';
import MessageActionBar from './cards/MessageActionBar.vue';
import MessageContextCard from './cards/MessageContextCard.vue';
import MessageImages from './cards/MessageImages.vue';
import { APP_KEY, CALLBACKS_KEY } from './transcriptKeys';
import { hasVisibleBlock, hasVisibleText } from './visibleContentHelpers';

/**
 * Reproduces `rendering/MessageRenderer.ts`'s message shell —
 * `renderStoredMessage` / `renderStoredUserMessage` /
 * `renderStoredAssistantMessage` / `createMessageShell` /
 * `renderInterruptMessage` / `appendInterruptIndicator` — as the assembly
 * layer over the leaf transcript components. Content-block dispatch itself
 * lives in `BlockList.vue`.
 *
 * Dispatch priority mirrors `renderStoredMessage` exactly: the bare-interrupt
 * check runs BEFORE the `isRebuiltContext` check, so an interrupted rebuilt-
 * context message (if one ever occurred) would still show the bare marker —
 * not render nothing.
 *
 * The assistant action bar is rendered by `BlockList` into the last text
 * block's `actions` slot (beside that block's copy button), reproducing the
 * legacy anchor-into-the-last-`.specorator-text-block` placement so the
 * thumbs/work-order buttons and the copy button form one hover row. The user
 * toolbar (fork/rewind/copy/actions) stays a message-level sibling below.
 */
const props = defineProps<{ msg: ChatMessage }>();

const app = inject(APP_KEY, undefined);
const callbacks = inject(CALLBACKS_KEY, undefined);

const providerId = computed(() => callbacks?.getProviderId() ?? DEFAULT_CHAT_PROVIDER_ID);

function isToolVisible(toolId: string): boolean {
  const toolCall = props.msg.toolCalls?.find((tc) => tc.id === toolId);
  return Boolean(toolCall && shouldRenderToolCall(toolCall, providerId.value));
}

const hasVisibleContent = computed(() => {
  const msg = props.msg;
  if (hasVisibleText(msg)) return true;
  if (hasVisibleBlock(msg.contentBlocks, isToolVisible)) return true;
  return Boolean(msg.toolCalls?.some((tc) => shouldRenderToolCall(tc, providerId.value)));
});

const isInterruptOnly = computed(
  () => !!props.msg.isInterrupt && (props.msg.role === 'user' || !hasVisibleContent.value)
);

// The assistant action bar normally renders inside the last text block (beside
// its copy button — one hover row). A tool-only / error-only response with no
// text item has no such host, so mount a message-level fallback in that case
// (mirrors the pre-slot placement) — else eligible actions (thumbs/work-order,
// gated on chatMessageText, which also reads `content`) would vanish.
const hasTextBlock = computed(() =>
  resolveBlockListItems(props.msg, providerId.value).some((item) => item.kind === 'text')
);

const textToShow = computed(() => props.msg.displayContent ?? props.msg.content);

const mentions = computed(() => {
  if (props.msg.isRebuiltContext || !props.msg.content) return { files: [], folders: [] };
  return extractVaultMentions(props.msg.content, (path) => {
    if (!app) return null;
    const entry = app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) return 'file';
    if (entry instanceof TFolder) return 'folder';
    return null;
  });
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <template v-if="isInterruptOnly">
    <div class="specorator-message specorator-message-assistant">
      <div
        class="specorator-message-content"
        dir="auto"
      >
        <div class="specorator-text-block"><span class="specorator-interrupted">Interrupted</span> <span class="specorator-interrupted-hint">· What should Specorator do instead?</span></div>
      </div>
    </div>
  </template>
  <template v-else-if="msg.isRebuiltContext" />
  <template v-else-if="msg.role === 'user'">
    <MessageImages
      v-if="msg.images && msg.images.length > 0"
      :images="msg.images"
    />
    <div
      v-if="textToShow"
      class="specorator-message specorator-message-user"
      :data-message-id="msg.id"
      data-role="user"
    >
      <div
        class="specorator-message-content"
        dir="auto"
      >
        <MessageContextCard
          :files="mentions.files"
          :folders="mentions.folders"
        />
        <TextBlock
          role="user"
          :content="textToShow"
        />
      </div>
      <MessageActionBar
        :msg="msg"
        role="user"
      />
    </div>
  </template>
  <template v-else-if="hasVisibleContent">
    <div
      class="specorator-message specorator-message-assistant"
      :data-message-id="msg.id"
      data-role="assistant"
    >
      <div
        class="specorator-message-content"
        dir="auto"
      >
        <BlockList :msg="msg" />
        <div
          v-if="msg.isInterrupt"
          class="specorator-text-block"
        ><span class="specorator-interrupted">Interrupted</span> <span class="specorator-interrupted-hint">· What should Specorator do instead?</span></div>
        <MessageActionBar
          v-if="!hasTextBlock"
          :msg="msg"
          role="assistant"
        />
      </div>
    </div>
  </template>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
