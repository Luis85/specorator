<script setup lang="ts">
import { normalizePath, Notice } from 'obsidian';
import { inject, onMounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { launchLoopPrompt } from '../../../quickActions/launchLoopPrompt';
import { loopLibraryAccessors } from '../../../tasks/loops/loopLibraryAccessors';
import type { LoopDefinition } from '../../../tasks/loops/loopTypes';
import { LoopEditorModal } from '../../../tasks/ui/LoopEditorModal';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { useLoopLibraryStore } from '../stores/loopLibraryStore';
import { useFolderVaultRefresh } from '../useFolderVaultRefresh';
import { useLibraryList } from '../useLibraryList';
import { useRowActionPending } from '../useRowActionPending';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('LoopsPanel mounted without PLUGIN_KEY');

const store = useLoopLibraryStore();
store.init(plugin);

// Source-based: rows re-derive from the global store, so a mutation in ANY
// Library leaf updates every mounted panel (multi-leaf consistency).
const list = useLibraryList<LoopDefinition>(() => store.loops, loopLibraryAccessors);

// Busy gate for the async card actions: disables the row's buttons while
// vault I/O runs and drops re-entrant fires (double-click = double clone).
const pending = useRowActionPending();

onMounted(() => void withErrorNotice(() => store.load(), t('loopLibrary.actionFailed'), fail));

function fail(error: unknown): void {
  plugin?.logger.scope('tasks').error('loop library action failed', error);
}

// Loops are regular vault notes, so an external writer — a note dropped in the
// loop folder, an edit made outside the app, the preset installer running from
// another leaf — persists without touching this store. Vault events DO fire
// for them (unlike the dot-folder skills Obsidian never indexes), so subscribe
// folder-scoped and reload, mirroring QuickActionsPanel.
useFolderVaultRefresh({
  vault: plugin.app.vault,
  // Same live folder resolution as the store (default + normalizePath) — the
  // subscription and the loader must scan ONE folder.
  resolveFolder: () => {
    const raw = (plugin.settings.agentBoardLoopFolder || 'Agent Board/loops').trim();
    return raw ? normalizePath(raw) : '';
  },
  // The loop store's load() re-throws (no onError in useGuardedLoad), unlike
  // the quick-action store which captures into store.error. Route the
  // refresh reload through the same withErrorNotice the mounted load uses so
  // a transient vault-list rejection surfaces as a Notice, not an unhandled
  // promise rejection.
  reload: () => void withErrorNotice(() => store.load(), t('loopLibrary.actionFailed'), fail),
});

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
  void pending.run(loop.path, () =>
    withErrorNotice(() => store.clone(loop), t('loopLibrary.actionFailed'), fail));
}

function onDelete(loop: LoopDefinition): void {
  // The confirm lives INSIDE run(): busy-through-confirm prevents stacked
  // confirms and delete-during-clone races on the same row.
  void pending.run(loop.path, () =>
    withErrorNotice(async () => {
      if (!plugin) return;
      const ok = await confirm(plugin.app, t('loopLibrary.deleteConfirm', { name: loop.name }), t('loopLibrary.delete'));
      if (!ok) return;
      await store.remove(loop);
      new Notice(t('loopLibrary.deleted', { name: loop.name }));
    }, t('loopLibrary.actionFailed'), fail));
}
</script>

<template>
  <div class="specorator-vue-panel-header">
    <h2>{{ t('loopLibrary.title') }}</h2>
    <div class="specorator-vue-panel-actions">
      <button
        type="button"
        class="mod-cta"
        @click="openEditor(null)"
      >
        {{ t('loopLibrary.newLoop') }}
      </button>
    </div>
  </div>
  <div class="specorator-vue-toolbar-slot">
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
  <div class="specorator-vue-panel-list">
    <div
      v-if="store.loading && store.loops.length === 0"
      class="specorator-vue-panel-loading"
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
        class="specorator-vue-empty-text"
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
        :busy="pending.isBusy(loop.path)"
        @activate="openEditor(loop)"
      >
        <div
          v-if="loop.description"
          class="specorator-vue-card-desc"
        >
          {{ loop.description }}
        </div>
        <div
          v-if="loop.useWhen"
          class="specorator-vue-card-desc"
        >
          {{ t('loopLibrary.useWhenLabel') }} {{ loop.useWhen }}
        </div>
        <template #actions>
          <button
            type="button"
            class="mod-cta"
            :disabled="pending.isBusy(loop.path)"
            :aria-busy="pending.isBusy(loop.path) ? 'true' : undefined"
            @click="onPrompt(loop)"
          >
            {{ t('loopLibrary.prompt') }}
          </button>
          <button
            type="button"
            class="specorator-vue-card-icon"
            :aria-label="t('library.duplicate')"
            :title="t('library.duplicate')"
            :disabled="pending.isBusy(loop.path)"
            :aria-busy="pending.isBusy(loop.path) ? 'true' : undefined"
            @click="onClone(loop)"
          >
            ⧉
          </button>
          <button
            type="button"
            class="specorator-vue-card-delete"
            :disabled="pending.isBusy(loop.path)"
            :aria-busy="pending.isBusy(loop.path) ? 'true' : undefined"
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
