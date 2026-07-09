<script setup lang="ts">
import type { EventRef, TAbstractFile } from 'obsidian';
import { normalizePath, Notice, setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';
import { inject, onMounted, onUnmounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { QuickActionStorage } from '../../../quickActions/QuickActionStorage';
import { runQuickActionForFile } from '../../../quickActions/runQuickActionForFile';
import type { QuickAction } from '../../../quickActions/types';
import { QuickActionEditorModal } from '../../../quickActions/ui/QuickActionEditorModal';
import IconButton from '../components/IconButton.vue';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { quickActionLibraryAccessors } from '../quickActionLibraryAccessors';
import { useQuickActionStore } from '../stores/quickActionStore';
import { useLibraryList } from '../useLibraryList';
import { useRowActionPending } from '../useRowActionPending';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('QuickActionsPanel mounted without PLUGIN_KEY');

const store = useQuickActionStore();
store.init(plugin);

// Source-based: rows re-derive from the global store, so a mutation in ANY
// Library leaf updates every mounted panel (multi-leaf consistency).
const list = useLibraryList<QuickAction>(() => store.actions, quickActionLibraryAccessors);

// Busy gate for the async card actions: disables the row's buttons while
// vault I/O runs and drops re-entrant fires (double-click = double dispatch).
const pending = useRowActionPending();

onMounted(() => void withErrorNotice(() => store.load(), t('quickActions.library.actionFailed'), fail));

// External writers — QuickActionsModal and the capture-from-message flow —
// persist through their own QuickActionStorage, never through this store, so
// a mounted tab would show stale rows until remount. Quick actions live in a
// REGULAR vault folder (unlike the dot-folder skills Obsidian never indexes),
// so vault events DO fire for them: subscribe folder-scoped, exactly like
// QuickActionFavoritesCache.
const VAULT_RELOAD_DEBOUNCE_MS = 300;
const vaultRefs: EventRef[] = [];
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
// Straight-line alias: the setup-top throw guard doesn't narrow `plugin`
// inside function declarations for vue-tsc.
const vaultPlugin = plugin;

function resolvedFolder(): string {
  // Same live folder resolution as the store's storage wiring (default +
  // normalizePath) — the subscription and the loader must scan ONE folder.
  const raw = (vaultPlugin.settings.quickActionsFolder ?? 'Quick Actions').trim();
  return raw ? normalizePath(raw) : '';
}

function isUnderFolder(path: string): boolean {
  const folder = resolvedFolder();
  if (!folder) return false;
  return path === folder || path.startsWith(`${folder}/`);
}

function onVaultChange(file: TAbstractFile, oldPath?: string): void {
  const path = (file as { path?: string })?.path ?? '';
  const old = typeof oldPath === 'string' ? oldPath : '';
  if (!isUnderFolder(path) && !(old && isUnderFolder(old))) return;
  // Coalesce bursts (multi-file sync, folder renames) into one reload.
  if (reloadTimer !== null) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void store.load(); // load() captures failures into store.error, never throws
  }, VAULT_RELOAD_DEBOUNCE_MS);
}

onMounted(() => {
  vaultRefs.push(vaultPlugin.app.vault.on('create', onVaultChange));
  vaultRefs.push(vaultPlugin.app.vault.on('modify', onVaultChange));
  vaultRefs.push(vaultPlugin.app.vault.on('delete', onVaultChange));
  vaultRefs.push(vaultPlugin.app.vault.on('rename', onVaultChange));
});

onUnmounted(() => {
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  for (const ref of vaultRefs) vaultPlugin.app.vault.offref(ref);
  vaultRefs.length = 0;
});

function fail(error: unknown): void {
  plugin?.logger.scope('quickActions').error('quick action library action failed', error);
}

/** setIcon host for the per-card leading icon (function ref — the cards render
 * in a v-for, so a single onMounted ref can't cover them). */
function applyIcon(el: Element | ComponentPublicInstance | null, icon: string | undefined): void {
  if (el instanceof HTMLElement && icon) setIcon(el, icon);
}

function openEditor(existing: QuickAction | null): void {
  if (!plugin) return;
  // The modal only uses this handle for its Add-flow collision probe
  // (getFilePathForName + exists); persistence routes through store.save so
  // every mounted leaf reloads. Same wiring as openQuickActionsModal — the
  // tab and the modal must scan ONE folder.
  const modalStorage = new QuickActionStorage(
    plugin.storage.getAdapter(),
    () => plugin.settings.quickActionsFolder ?? 'Quick Actions',
  );
  new QuickActionEditorModal(
    plugin.app,
    existing,
    async (action) => {
      await store.save(action); // store reload propagates reactively
    },
    modalStorage,
  ).open();
}

function onRun(action: QuickAction): void {
  if (!plugin) return;
  const p = plugin;
  void pending.run(action.filePath, () =>
    withErrorNotice(() => runQuickActionForFile(p, null, action),
      t('quickActions.library.actionFailed'), fail));
}

function onDuplicate(action: QuickAction): void {
  void pending.run(action.filePath, () =>
    withErrorNotice(async () => {
      await store.duplicate(action);
    }, t('quickActions.library.actionFailed'), fail));
}

function onDelete(action: QuickAction): void {
  // The confirm lives INSIDE run(): busy-through-confirm prevents stacked
  // confirms and duplicate-during-delete races on the same row.
  void pending.run(action.filePath, () =>
    withErrorNotice(async () => {
      if (!plugin) return;
      const ok = await confirm(
        plugin.app,
        t('quickActions.library.deleteConfirm', { name: action.name }),
        t('quickActions.library.delete'),
      );
      if (!ok) return;
      await store.remove(action);
      new Notice(t('quickActions.library.deleted', { name: action.name }));
    }, t('quickActions.library.actionFailed'), fail));
}

function onToggleFavorite(action: QuickAction): void {
  void pending.run(action.filePath, () =>
    withErrorNotice(async () => {
      const wasFavorite = action.favorite === true;
      await store.toggleFavorite(action);
      // The store silently no-ops at the five-favorite cap (no write, no
      // reload). It returns nothing today, so detect "nothing happened" from
      // the row's favorite state after the reload and tell the user.
      const after = store.actions.find((a) => a.filePath === action.filePath);
      if (!wasFavorite && after?.favorite !== true) {
        new Notice(t('quickActions.library.favoriteLimit'));
      }
    }, t('quickActions.library.actionFailed'), fail));
}
</script>

<template>
  <div class="specorator-vue-panel-header">
    <h2>{{ t('quickActions.library.title') }}</h2>
    <div class="specorator-vue-panel-actions">
      <!-- Saving with a blank folder would land a vault-root file loadAll()
        never scans, so creation is gated on configuration (mirrors the
        modal's hasConfiguredFolder guard). -->
      <button
        type="button"
        class="mod-cta"
        :disabled="!store.folderConfigured"
        @click="openEditor(null)"
      >
        {{ t('quickActions.library.newAction') }}
      </button>
    </div>
  </div>
  <div class="specorator-vue-toolbar-slot">
    <LibraryToolbar
      v-if="store.actions.length > 0"
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
      v-if="store.loading && store.actions.length === 0"
      class="specorator-vue-panel-loading"
    >
      {{ t('common.loading') }}
    </div>
    <div
      v-else-if="store.error"
      class="specorator-vue-empty-text"
    >
      {{ store.error }}
    </div>
    <!-- Configuration nudge, not an invitation: without a folder the New CTA
      could only fail, so this variant renders no action. -->
    <LibraryEmptyState
      v-else-if="!store.folderConfigured"
      icon="zap"
      :message="t('quickActions.library.folderNotConfigured')"
    />
    <LibraryEmptyState
      v-else-if="store.actions.length === 0"
      icon="zap"
      :message="t('quickActions.modal.emptyLead')"
      :action-label="t('quickActions.library.newAction')"
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
        v-for="action in list.rows.value"
        :key="action.filePath"
        :name="action.name"
        :ariaLabel="action.name"
        :tags="action.tags ?? []"
        :busy="pending.isBusy(action.filePath)"
        @activate="openEditor(action)"
      >
        <template
          v-if="action.icon"
          #leading
        >
          <div
            :ref="(el) => applyIcon(el, action.icon)"
            class="specorator-vue-card-icon specorator-vue-qa-icon"
          />
        </template>
        <template #name-chips>
          <!-- .stop: the star sits inside the card's activate surface (the
            name-chips slot has no @click.stop wrapper), so a toggle must not
            also open the editor — IconButton emits the native event so .stop
            lands here at the call site. -->
          <IconButton
            icon="star"
            :ariaLabel="t('quickActions.library.favoriteAria')"
            :title="t('quickActions.library.favoriteAria')"
            :pressed="action.favorite === true"
            filled
            :disabled="pending.isBusy(action.filePath)"
            @activate.stop="onToggleFavorite(action)"
          />
        </template>
        <div
          v-if="action.description"
          class="specorator-vue-card-desc"
        >
          {{ action.description }}
        </div>
        <template #actions>
          <button
            type="button"
            class="mod-cta"
            :disabled="pending.isBusy(action.filePath)"
            :aria-busy="pending.isBusy(action.filePath) ? 'true' : undefined"
            @click="onRun(action)"
          >
            {{ t('quickActions.library.run') }}
          </button>
          <button
            type="button"
            :disabled="pending.isBusy(action.filePath)"
            :aria-busy="pending.isBusy(action.filePath) ? 'true' : undefined"
            @click="openEditor(action)"
          >
            {{ t('quickActions.library.edit') }}
          </button>
          <button
            type="button"
            class="specorator-vue-card-icon"
            :aria-label="t('quickActions.library.duplicate')"
            :title="t('quickActions.library.duplicate')"
            :disabled="pending.isBusy(action.filePath)"
            :aria-busy="pending.isBusy(action.filePath) ? 'true' : undefined"
            @click="onDuplicate(action)"
          >
            ⧉
          </button>
          <button
            type="button"
            class="specorator-vue-card-delete"
            :disabled="pending.isBusy(action.filePath)"
            :aria-busy="pending.isBusy(action.filePath) ? 'true' : undefined"
            @click="onDelete(action)"
          >
            {{ t('quickActions.library.delete') }}
          </button>
        </template>
      </LibraryCard>
      <!-- eslint-enable vue/attribute-hyphenation -->
    </template>
  </div>
</template>

<style scoped>
.specorator-vue-qa-icon {
  color: var(--sp-text-muted);
}

/* setIcon() creates the <svg> imperatively — it carries no data-v attribute,
   so it MUST be reached via :deep() from its scoped host. */
.specorator-vue-qa-icon :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
