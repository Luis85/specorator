<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';
import { useChatShellStore } from '../stores/chatShellStore';
import BoundAgentChip from './BoundAgentChip.vue';
import ChatLogo from './ChatLogo.vue';
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

// Mirrors SpecoratorView.updateNavRowLocation: 'header' mode keeps badges +
// actions in the header chrome; 'input' mode teleports both into the active
// tab's navRowEl, re-targeting reactively when the active tab changes.
const headerMode = computed(() => store.header.tabBarPosition === 'header');
const navRowTarget = computed(() => (headerMode.value ? null : cb.resolveNavRowEl(store.activeTabId)));
// A null target (no active tab yet) falls back to in-place rendering instead
// of Teleport erroring on a missing target.
const teleportDisabled = computed(() => headerMode.value || navRowTarget.value == null);
</script>

<template>
  <div class="specorator-header">
    <div class="specorator-header-title-row">
      <div class="specorator-title-slot">
        <ChatLogo
          :provider-id="store.header.logoProviderId"
          :visible="store.header.logoVisible"
        />
        <ChatTitle :title="store.header.title" />
        <Teleport
          :to="navRowTarget"
          :disabled="teleportDisabled"
        >
          <TabStrip
            v-show="store.header.tabBarVisible"
            :items="store.tabs"
            :on-tab-click="cb.onTabClick"
            :on-tab-close="cb.onTabClose"
          />
        </Teleport>
      </div>
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
      <div class="specorator-header-actions specorator-header-actions-slot">
        <div ref="gitActionHost" />
        <Teleport
          :to="navRowTarget"
          :disabled="teleportDisabled"
        >
          <HeaderActions />
        </Teleport>
      </div>
    </div>
  </div>
</template>
