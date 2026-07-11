<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';
import { useChatShellStore } from '../stores/chatShellStore';
import BoundAgentChip from './BoundAgentChip.vue';
import ChatTitle from './ChatTitle.vue';
import HeaderActions from './HeaderActions.vue';
import TabStrip from './TabStrip.vue';

const store = useChatShellStore();
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatHeader mounted without CALLBACKS_KEY');

const gitActionHost = ref<HTMLElement | null>(null);
onMounted(() => {
  if (gitActionHost.value) cb.mountGitActionHost(gitActionHost.value);
});
</script>

<template>
  <div class="specorator-header">
    <div class="specorator-header-title-row">
      <ChatTitle :title="store.header.title" />
      <HeaderActions />
    </div>
    <div
      class="specorator-header-meta-row"
      :class="{ 'specorator-hidden': !store.header.metaRowVisible }"
    >
      <div class="specorator-bound-agent-chip-slot">
        <BoundAgentChip
          v-if="store.header.boundAgent"
          :agent="store.header.boundAgent"
        />
      </div>
      <div
        ref="gitActionHost"
        class="specorator-header-actions specorator-header-actions-slot"
      />
    </div>
    <TabStrip
      v-show="store.header.tabBarVisible"
      :items="store.tabs"
      :on-tab-click="cb.onTabClick"
      :on-tab-close="cb.onTabClose"
    />
  </div>
</template>
