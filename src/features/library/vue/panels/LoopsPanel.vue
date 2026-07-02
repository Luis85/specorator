<script setup lang="ts">
import { Notice } from 'obsidian';
import { inject, onMounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { launchLoopPrompt } from '../../../quickActions/launchLoopPrompt';
import { installPresetLoopsWithNotice } from '../../../tasks/loops/installPresetLoops';
import { loopLibraryAccessors } from '../../../tasks/loops/loopLibraryAccessors';
import type { LoopDefinition } from '../../../tasks/loops/loopTypes';
import { LoopEditorModal } from '../../../tasks/ui/LoopEditorModal';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { useLoopLibraryStore } from '../stores/loopLibraryStore';
import { useLibraryList } from '../useLibraryList';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('LoopsPanel mounted without PLUGIN_KEY');

const store = useLoopLibraryStore();
store.init(plugin);

// Source-based: rows re-derive from the global store, so a mutation in ANY
// Library leaf updates every mounted panel (multi-leaf consistency).
const list = useLibraryList<LoopDefinition>(() => store.loops, loopLibraryAccessors);

onMounted(() => void withErrorNotice(() => store.load(), t('loopLibrary.actionFailed'), fail));

function fail(error: unknown): void {
  plugin?.logger.scope('tasks').error('loop library action failed', error);
}

function openEditor(existing: LoopDefinition | null): void {
  if (!plugin) return;
  new LoopEditorModal(plugin.app, existing, async (payload) => {
    await store.save(payload, payload.originalPath); // store reload propagates reactively
  }).open();
}

function onPrompt(loop: LoopDefinition): void {
  if (plugin) launchLoopPrompt(plugin, loop);
}

function onClone(loop: LoopDefinition): void {
  void withErrorNotice(() => store.clone(loop), t('loopLibrary.actionFailed'), fail);
}

function onDelete(loop: LoopDefinition): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    const ok = await confirm(plugin.app, t('loopLibrary.deleteConfirm', { name: loop.name }), t('loopLibrary.delete'));
    if (!ok) return;
    await store.remove(loop);
    new Notice(t('loopLibrary.deleted', { name: loop.name }));
  }, t('loopLibrary.actionFailed'), fail);
}

function onInstallStarters(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    await installPresetLoopsWithNotice(plugin);
    await store.load();
  }, t('loopLibrary.actionFailed'), fail);
}
</script>

<template>
  <div class="specorator-library-header">
    <h2>{{ t('loopLibrary.title') }}</h2>
    <div class="specorator-library-header-actions">
      <button
        type="button"
        class="mod-cta"
        @click="openEditor(null)"
      >
        {{ t('loopLibrary.newLoop') }}
      </button>
      <button
        type="button"
        @click="onInstallStarters"
      >
        {{ t('loopLibrary.installStarter') }}
      </button>
    </div>
  </div>
  <div class="specorator-library-toolbar-slot">
    <LibraryToolbar
      v-if="store.loops.length > 0"
      :query="list.query.value"
      :sort="list.sort.value"
      :tags="list.allTags.value"
      :active-filters="list.activeFilters.value"
      @update:query="list.query.value = $event"
      @update:sort="list.sort.value = $event"
      @toggle-filter="list.toggleFilter($event)"
      @clear-filters="list.clearFilters()"
    />
  </div>
  <div class="specorator-library-list">
    <div
      v-if="store.loading"
      class="specorator-library-loading"
    >
      {{ t('common.loading') }}
    </div>
    <LibraryEmptyState
      v-else-if="store.loops.length === 0"
      icon="repeat"
      :message="t('loopLibrary.empty')"
      :action-label="t('loopLibrary.newLoop')"
      @action="openEditor(null)"
    />
    <template v-else>
      <div
        v-if="list.rows.value.length === 0"
        class="specorator-library-empty-text"
      >
        {{ t('library.noMatches') }}
      </div>
      <!-- eslint-disable vue/attribute-hyphenation -- vue-tsc only resolves the
        REQUIRED ariaLabel prop in camelCase (hyphenated aria-* is typed as a
        native attribute), so lint:fix must not flip it back to aria-label. -->
      <LibraryCard
        v-for="loop in list.rows.value"
        :key="loop.path"
        :name="loop.name"
        :ariaLabel="loop.name"
        :tags="loop.tags ?? []"
        @activate="openEditor(loop)"
      >
        <div
          v-if="loop.description"
          class="specorator-library-card-desc"
        >
          {{ loop.description }}
        </div>
        <div
          v-if="loop.useWhen"
          class="specorator-library-card-desc"
        >
          {{ t('loopLibrary.useWhenLabel') }} {{ loop.useWhen }}
        </div>
        <template #actions>
          <button
            type="button"
            class="mod-cta"
            @click="onPrompt(loop)"
          >
            {{ t('loopLibrary.prompt') }}
          </button>
          <button
            type="button"
            class="specorator-library-card-icon"
            :aria-label="t('library.duplicate')"
            :title="t('library.duplicate')"
            @click="onClone(loop)"
          >
            ⧉
          </button>
          <button
            type="button"
            class="specorator-library-card-delete"
            @click="onDelete(loop)"
          >
            {{ t('loopLibrary.delete') }}
          </button>
        </template>
      </LibraryCard>
      <!-- eslint-enable vue/attribute-hyphenation -->
    </template>
  </div>
</template>
