<script setup lang="ts">
import { Notice } from 'obsidian';
import { inject, onMounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { promptReason } from '../../../../shared/modals/PromptModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { librarySlug, uniqueChildDir } from '../../../../utils/libraryView';
import { runVaultSkill } from '../../../quickActions/skills/runVaultSkill';
import { isCloneableSkillPath, SKILLS_DIR, skillTemplate } from '../../../skills/skillCloning';
import { skillLibraryAccessors, type SkillLibraryRow } from '../../../skills/skillLibraryRows';
import { SkillEditorModal } from '../../../skills/view/SkillEditorModal';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { useSkillLibraryStore } from '../stores/skillLibraryStore';
import { useLibraryList } from '../useLibraryList';
import { useRowActionPending } from '../useRowActionPending';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('SkillsPanel mounted without PLUGIN_KEY');

const store = useSkillLibraryStore();
store.init(plugin);

// Source-based: rows re-derive from the global store, so a mutation in ANY
// Library leaf updates every mounted panel (multi-leaf consistency).
const list = useLibraryList<SkillLibraryRow>(
  () => store.rows,
  skillLibraryAccessors((id) => store.mtimeFor(id)),
);

// Busy gate for the async card actions: disables the row's buttons while
// vault I/O runs and drops re-entrant fires (double-click = double clone).
const pending = useRowActionPending();

onMounted(() => void withErrorNotice(() => store.load(), t('skillLibrary.actionFailed'), fail));

function fail(error: unknown): void {
  plugin?.logger.scope('skills').error('skill library action failed', error);
}

// reload() in this panel is just store.load() — rows re-derive reactively.
function reload(): Promise<void> {
  return store.load();
}

function openEditor(row: SkillLibraryRow): void {
  if (!plugin) return;
  new SkillEditorModal(plugin.app, plugin, row, () => void reload()).open();
}

function onPrompt(row: SkillLibraryRow): void {
  const entry = store.entryFor(row.id);
  if (entry && plugin) {
    void runVaultSkill(plugin, entry, null);
  } else {
    // Rows derive from entries, so this is unreachable unless the entry map
    // desyncs — surface it instead of leaving a dead button.
    new Notice(t('skillLibrary.actionFailed'));
    plugin?.logger.scope('skills').warn('skill prompt: no entry for row', row.id);
  }
}

function onClone(row: SkillLibraryRow): void {
  void pending.run(row.id, () => withErrorNotice(async () => {
    const path = await store.clone(row);
    if (!path) { new Notice(t('skillLibrary.readonlyNotice')); return; }
    new Notice(t('skillLibrary.created', { path }));
    // A skill's display name is its folder basename, so the clone is named after
    // its fresh `<slug>-copy` dir. Open the editor on that name (not the source
    // row's) so its fields match the file just written instead of the original.
    const cloneSlug = path.split('/').at(-2) ?? `${librarySlug(row.name)}-copy`;
    openEditor({
      id: `skill-${cloneSlug}`,
      name: cloneSlug,
      description: row.description,
      providerId: row.providerId,
      providerDisplayName: row.providerDisplayName,
      sourceFilePath: path,
      editable: true,
      tags: row.tags,
    });
  }, t('skillLibrary.actionFailed'), fail));
}

function onDelete(row: SkillLibraryRow): void {
  // The confirm lives INSIDE run(): busy-through-confirm prevents stacked
  // confirms and delete-during-clone races on the same row.
  void pending.run(row.id, () => withErrorNotice(async () => {
    if (!plugin) return;
    const ok = await confirm(plugin.app, t('skillLibrary.deleteConfirm', { name: row.name }), t('skillLibrary.delete'));
    if (!ok) return;
    const removed = await store.remove(row);
    // Unreachable through the gated button; kept for programmatic callers.
    if (!removed) { new Notice(t('skillLibrary.readonlyNotice')); return; }
    new Notice(t('skillLibrary.deleted', { name: row.name }));
  }, t('skillLibrary.actionFailed'), fail));
}

function onCreateSkill(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    const name = await promptReason(plugin.app, t('skillLibrary.namePrompt'));
    if (!name) return;
    const dir = await uniqueChildDir(plugin.vaultFileAdapter, SKILLS_DIR, librarySlug(name) || 'skill');
    const path = `${dir}/SKILL.md`;
    await plugin.vaultFileAdapter.write(path, skillTemplate(name));
    // `.claude/` is a dot-folder Obsidian's vault watcher ignores, so this direct
    // write bypasses the provider-catalog event seam. Invalidate the aggregator's
    // 'claude' bucket explicitly so the reload below re-fetches the new skill.
    plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    new Notice(t('skillLibrary.created', { path }));
    await reload();
    openEditor({
      id: `skill-${dir.split('/').pop() ?? ''}`,
      name,
      description: '',
      // New skills are created under `.claude/skills/` (SKILLS_DIR).
      providerId: 'claude',
      providerDisplayName: t('skillLibrary.providerVault'),
      sourceFilePath: path,
      editable: true,
    });
  }, t('skillLibrary.actionFailed'), fail);
}
</script>

<template>
  <div class="specorator-vue-panel-header">
    <h2>{{ t('skillLibrary.title') }}</h2>
    <div class="specorator-vue-panel-actions">
      <button
        type="button"
        class="mod-cta"
        @click="onCreateSkill"
      >
        {{ t('skillLibrary.newSkill') }}
      </button>
    </div>
  </div>
  <div class="specorator-vue-toolbar-slot">
    <LibraryToolbar
      v-if="store.rows.length > 0"
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
      v-if="store.loading"
      class="specorator-vue-panel-loading"
    >
      {{ t('common.loading') }}
    </div>
    <LibraryEmptyState
      v-else-if="store.rows.length === 0"
      icon="book-open"
      :message="t('skillLibrary.empty')"
      :action-label="t('skillLibrary.newSkill')"
      @action="onCreateSkill"
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
        v-for="row in list.rows.value"
        :key="row.id"
        :name="row.name"
        :ariaLabel="row.name"
        :tags="row.tags ?? []"
        :busy="pending.isBusy(row.id)"
        @activate="openEditor(row)"
      >
        <template #name-chips>
          <span class="specorator-vue-chip specorator-vue-chip-muted">{{ row.providerDisplayName }}</span>
          <span
            v-if="!row.editable"
            class="specorator-vue-chip specorator-vue-chip-outline"
          >{{ t('skillLibrary.readOnlyNote') }}</span>
        </template>
        <div class="specorator-vue-card-desc">
          {{ row.description }}
        </div>
        <template #actions>
          <button
            type="button"
            class="mod-cta"
            :disabled="pending.isBusy(row.id)"
            :aria-busy="pending.isBusy(row.id) ? 'true' : undefined"
            @click="onPrompt(row)"
          >
            {{ t('skillLibrary.prompt') }}
          </button>
          <button
            v-if="isCloneableSkillPath(row.sourceFilePath)"
            type="button"
            class="specorator-vue-card-icon"
            :aria-label="t('library.duplicate')"
            :title="t('library.duplicate')"
            :disabled="pending.isBusy(row.id)"
            :aria-busy="pending.isBusy(row.id) ? 'true' : undefined"
            @click="onClone(row)"
          >
            ⧉
          </button>
          <!-- Delete shares the clone writability gate: only vault-rooted
            skill folders the adapter can touch are deletable. -->
          <button
            v-if="isCloneableSkillPath(row.sourceFilePath)"
            type="button"
            class="specorator-vue-card-delete"
            :disabled="pending.isBusy(row.id)"
            :aria-busy="pending.isBusy(row.id) ? 'true' : undefined"
            @click="onDelete(row)"
          >
            {{ t('skillLibrary.delete') }}
          </button>
        </template>
      </LibraryCard>
      <!-- eslint-enable vue/attribute-hyphenation -->
    </template>
  </div>
</template>
