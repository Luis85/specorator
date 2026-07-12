<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY, PLUGIN_KEY } from './chatShellKeys';
import ChatEmptyState from './components/ChatEmptyState.vue';
import ChatHeader from './components/ChatHeader.vue';
import TabContentHost from './components/TabContentHost.vue';
import { useChatShellStore } from './stores/chatShellStore';
import { useChatShellEventRouting } from './useChatShellEventRouting';

// The chat shell island: the imperative outer frame SpecoratorView used to
// assemble (container + header + tab-content host + empty state), mounted by
// SpecoratorView.mountChatShell. The engine (TabManager + per-tab DOM) stays
// imperative and mounts into TabContentHost's element via CONTENT_HOST_KEY.
const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('ChatShellRoot mounted without PLUGIN_KEY');
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatShellRoot mounted without CALLBACKS_KEY');

const store = useChatShellStore();

// Owns the view→store snapshot routing for this leaf (its own onMounted/
// onUnmounted). The view pushes a fully-projected snapshot on every change.
useChatShellEventRouting(cb.subscribe);

// Mirrors SpecoratorView.updateLayoutForPosition: 'header' mode toggles the
// container modifier class the header/history/input CSS keys off.
const headerMode = computed(() => store.header.tabBarPosition === 'header');

// data-provider drives the brand-color CSS vars (variables.css), replacing the
// old syncProviderBrandColor dataset write. Omitted (undefined) until an active
// provider is projected so the attribute is absent rather than empty.
const dataProvider = computed(() => store.header.activeProviderId ?? undefined);

// The configure-first placeholder shows when there is no chat tab — which is
// exactly the no-enabled-provider state, since an enabled provider always keeps
// at least one chat tab alive (restoreOrCreateTabs / closeTab's blank-home
// fallback). Mirrors SpecoratorView.renderEmptyState's show/hide.
const showEmptyState = computed(() => store.tabs.length === 0);
</script>

<template>
  <div
    class="specorator-container"
    :class="{ 'specorator-container--header-mode': headerMode }"
    :data-provider="dataProvider"
  >
    <ChatHeader />
    <TabContentHost />
    <ChatEmptyState v-if="showEmptyState" />
  </div>
</template>
