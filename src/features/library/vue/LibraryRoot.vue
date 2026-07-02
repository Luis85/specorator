<script setup lang="ts">
import { inject } from 'vue';

import { t } from '../../../i18n/i18n';
import type { LibraryTab } from '../viewType';
import { ACTIVE_TAB_KEY, VIEW_KEY } from './libraryKeys';
import AgentsPanel from './panels/AgentsPanel.vue';
import LoopsPanel from './panels/LoopsPanel.vue';
import SkillsPanel from './panels/SkillsPanel.vue';

const injected = inject(ACTIVE_TAB_KEY);
if (!injected) throw new Error('LibraryRoot.vue mounted without ACTIVE_TAB_KEY');
// Re-bind after the guard so the template binding's DECLARED type is already
// narrowed to Ref<LibraryTab> — vue-tsc checks templates against declared types.
const activeTab = injected;
const injectedView = inject(VIEW_KEY);
if (!injectedView) throw new Error('LibraryRoot.vue mounted without VIEW_KEY');
const view = injectedView;

const TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: 'agents', label: t('agentRoster.navLabel') },
  { id: 'skills', label: t('skillLibrary.navLabel') },
  { id: 'loops', label: t('loopLibrary.navLabel') },
];

function select(tab: LibraryTab): void {
  if (activeTab.value === tab) return;
  // Tab-switch policy (panel guard + pending latch) lives in ONE choke point:
  // LibraryView.setActiveTab. The check above is only a cheap same-tab skip.
  void view.setActiveTab(tab);
}
</script>

<template>
  <div
    class="specorator-library-nav"
    role="navigation"
    :aria-label="t('agentRoster.navAriaLabel')"
  >
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="specorator-library-nav-item"
      :class="{ 'is-active': activeTab === tab.id }"
      :aria-current="activeTab === tab.id ? 'page' : undefined"
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
  <LoopsPanel v-if="activeTab === 'loops'" />
  <SkillsPanel v-else-if="activeTab === 'skills'" />
  <AgentsPanel v-else />
</template>
