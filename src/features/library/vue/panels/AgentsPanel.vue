<script setup lang="ts">
import { Notice } from 'obsidian';
import { inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { startChatWithRosterAgent, syncRosterAgentsWithNotice } from '../../../agents/roster/rosterAgentActions';
import { rosterLibraryAccessors } from '../../../agents/roster/rosterLibraryAccessors';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { AgentDetailEditor } from '../../../agents/roster/view/AgentDetailEditor';
import AgentCard from '../components/AgentCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY, TAB_GUARD_KEY, VIEW_KEY } from '../libraryKeys';
import { useRosterStore } from '../stores/rosterStore';
import { useLibraryList } from '../useLibraryList';
import { useRowActionPending } from '../useRowActionPending';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('AgentsPanel mounted without PLUGIN_KEY');

const store = useRosterStore();
store.init(plugin);

const detailHost = ref<HTMLElement | null>(null);
const detailOpen = ref(false);

// Rows re-derive from the global store (source-based useLibraryList), so
// mutations in ANY leaf propagate to every mounted panel automatically.
const list = useLibraryList<RosterAgent>(() => store.agents, rosterLibraryAccessors);

// Busy gate for the async card actions (start chat / clone / delete):
// disables the row's buttons while the work runs and drops re-entrant fires
// (double-click = double clone). Detail-editor callbacks stay unwrapped —
// the gate is a card-row affordance.
const pending = useRowActionPending();

const tabGuard = inject(TAB_GUARD_KEY, null);

// The detail editor renders as a direct child of the library root (contentEl).
// While it is open, that root's bottom padding is zeroed so the editor's sticky
// footer sits flush. Drive it with an explicit state class rather than a
// `:has(> .specorator-roster-detail)` selector — CSS `:has` triggers broad
// style invalidation (see src/style/vue/library-host.css). `view` is absent in
// unit tests (no VIEW_KEY provider), so the toggle is a safe no-op there.
const view = inject(VIEW_KEY, null);
watch(detailOpen, (open) => {
  view?.contentEl.toggleClass('is-detail-open', open);
});

onMounted(() => void withErrorNotice(() => store.load(), t('agentRoster.actionFailed'), fail));

// Roster agents are managed through agentRosterStore, not loose vault notes, so
// a raw folder watch is the wrong seam. The store emits `roster:changed` on
// every save/delete, so an external writer — an Agent Board edit, a chat-view
// roster edit, provider sync, the preset installer from another leaf — signals
// through the event bus. Subscribe and reload so same-tab external edits land
// without a remount (same debounce shape as the vault-note panels).
const ROSTER_RELOAD_DEBOUNCE_MS = 300;
let rosterOff: (() => void) | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
const rosterPlugin = plugin;

onMounted(() => {
  rosterOff = rosterPlugin.events.on('roster:changed', () => {
    // Coalesce bursts (a multi-agent sync fires one event per file) into one
    // reload.
    if (reloadTimer !== null) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void withErrorNotice(() => store.load(), t('agentRoster.actionFailed'), fail);
    }, ROSTER_RELOAD_DEBOUNCE_MS);
  });
});

// Safety net: if the panel unmounts through any other path, never leave a
// stale guard blocking the tab strip.
onUnmounted(() => {
  if (tabGuard) tabGuard.value = null;
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  rosterOff?.();
  rosterOff = null;
  // Safety net: a non-close unmount path (panel replaced while the detail editor
  // is open) must not leave the state class on the shared library root.
  view?.contentEl.removeClass('is-detail-open');
});

function fail(error: unknown): void {
  plugin?.logger.scope('agents').error('roster action failed', error);
}

async function reload(): Promise<void> {
  await store.load();
}

async function openDetail(agent: RosterAgent, opts?: { isNew?: boolean }): Promise<void> {
  if (!plugin) return;
  detailOpen.value = true;
  await nextTick(); // detailHost mounts on the flag flip
  if (!detailHost.value) return;
  const editor = new AgentDetailEditor(plugin, {
    onBack: () => void closeDetail(),
    onStartChat: (a) => void withErrorNotice(() => startChat(a), t('agentRoster.actionFailed'), fail),
    onDeleted: (a) =>
      void withErrorNotice(async () => {
        if (await confirmedDelete(a)) await closeDetail();
      }, t('agentRoster.actionFailed'), fail),
    // Keep the shared Pinia store fresh on every detail save so OTHER mounted
    // Library leaves re-derive immediately (the editor persists directly to
    // plugin.agentRosterStore, not through useRosterStore).
    onSaved: () => void withErrorNotice(() => store.load(), t('agentRoster.actionFailed'), fail),
  });
  const renderDone = editor.render(detailHost.value, agent, opts);
  // Tab switches unmount this panel and would silently discard dirty edits —
  // register a guard that reuses the editor's own dirty state and the SAME
  // confirm strings its Back path uses (see AgentDetailEditor.handleBack).
  // Armed BEFORE awaiting render: the editor shows editable fields (and
  // initializes its dirty state) synchronously, before its skill-catalog
  // await resolves, so a slow vault read must not leave a guard-free window.
  // Arming pre-await also means unmount can never race a late registration
  // onto the view-owned guard ref after onUnmounted cleared it.
  if (tabGuard) {
    tabGuard.value = async () => {
      if (!editor.isDirty()) {
        await closeDetail();
        return true;
      }
      const ok = await confirm(plugin.app, t('agentRoster.discardConfirm'), t('agentRoster.discard'));
      if (ok) await closeDetail();
      return ok;
    };
  }
  await renderDone;
}

async function closeDetail(): Promise<void> {
  // v-if destroys the host node on the flag flip — no manual cleanup needed.
  detailOpen.value = false;
  if (tabGuard) tabGuard.value = null;
  // Noticed, not bare: the onBack callback and tab-guard paths await this
  // directly, so a vault read failure must surface a Notice instead of an
  // unhandled rejection (or aborting an already-committed guard approval).
  await withErrorNotice(reload, t('agentRoster.actionFailed'), fail);
}

/** Card-action wrapper the template calls; mirrors the detail editor's path. */
function onStartChat(agent: RosterAgent): void {
  void pending.run(agent.id, () =>
    withErrorNotice(() => startChat(agent), t('agentRoster.actionFailed'), fail));
}

async function startChat(agent: RosterAgent): Promise<void> {
  if (!plugin) return;
  // Provider resolution + fresh-tab policy live in rosterAgentActions,
  // shared with the legacy AgentRosterView.
  await startChatWithRosterAgent(plugin, agent);
}

/**
 * Legacy deleteAgent parity: confirm -> remove -> Notice. Shared by the card
 * Delete button AND the detail editor's onDeleted so neither path is
 * destructive without confirmation. Returns whether the agent was deleted.
 */
async function confirmedDelete(agent: RosterAgent): Promise<boolean> {
  if (!plugin) return false;
  const ok = await confirm(
    plugin.app,
    t('agentRoster.deleteConfirm', { name: agent.name }),
    t('agentRoster.delete'),
  );
  if (!ok) return false;
  await store.remove(agent);
  new Notice(t('agentRoster.deleted', { name: agent.name }));
  return true;
}

/** Legacy cloneAgent parity: the user lands on the clone for review/editing. */
function onClone(agent: RosterAgent): void {
  void pending.run(agent.id, () =>
    withErrorNotice(async () => {
      const clone = await store.clone(agent);
      await openDetail(clone);
    }, t('agentRoster.actionFailed'), fail));
}

function onDelete(agent: RosterAgent): void {
  // async wrapper: withErrorNotice takes () => Promise<void>, so the
  // confirmedDelete boolean stays internal. The confirm lives INSIDE run():
  // busy-through-confirm prevents stacked confirms and delete-during-clone
  // races on the same row.
  void pending.run(agent.id, () =>
    withErrorNotice(async () => {
      await confirmedDelete(agent);
    }, t('agentRoster.actionFailed'), fail));
}

function onNewAgent(): void {
  void withErrorNotice(async () => {
    // In-memory draft, NOT pre-saved (parity with createAndEdit): abandoning
    // the editor leaves no orphan file.
    const draft = await store.draftNewAgent(t('agentRoster.newAgent'));
    await openDetail(draft, { isNew: true });
  }, t('agentRoster.actionFailed'), fail);
}

function onSync(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    await syncRosterAgentsWithNotice(plugin);
  }, t('agentRoster.actionFailed'), fail);
}

</script>

<template>
  <div v-show="!detailOpen">
    <div class="specorator-vue-panel-header">
      <h2>{{ t('agentRoster.title') }}</h2>
      <div class="specorator-vue-panel-actions">
        <button
          type="button"
          class="mod-cta"
          @click="onNewAgent"
        >
          {{ t('agentRoster.newAgent') }}
        </button>
        <button
          type="button"
          :title="t('agentRoster.syncProvidersHint')"
          @click="onSync"
        >
          {{ t('agentRoster.syncProviders') }}
        </button>
      </div>
    </div>
    <div class="specorator-vue-toolbar-slot">
      <LibraryToolbar
        v-if="store.agents.length > 0"
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
        v-if="store.loading && store.agents.length === 0"
        class="specorator-vue-panel-loading"
      >
        {{ t('common.loading') }}
      </div>
      <LibraryEmptyState
        v-else-if="store.agents.length === 0"
        icon="users"
        :message="t('agentRoster.emptyState')"
        :action-label="t('agentRoster.newAgent')"
        @action="onNewAgent"
      />
      <template v-else>
        <div
          v-if="list.rows.value.length === 0"
          class="specorator-vue-empty-text"
        >
          {{ t('library.noMatches') }}
        </div>
        <AgentCard
          v-for="agent in list.rows.value"
          :key="agent.id"
          :agent="agent"
          :busy="pending.isBusy(agent.id)"
          @activate="openDetail(agent)"
          @start-chat="onStartChat(agent)"
          @clone="onClone(agent)"
          @delete="onDelete(agent)"
        />
      </template>
    </div>
  </div>
  <div
    v-if="detailOpen"
    ref="detailHost"
    class="specorator-roster-detail"
  />
</template>

<style scoped>
/* Embedded legacy detail editor: neutralize its own padding — the island
   already pads contentEl. Plain scoped rule, NOT :deep(): the host is a
   root node of this multi-root component, so no ancestor carries our scope
   attribute. Root nodes DO get our data-v attribute, and
   .specorator-roster-detail[data-v-x] (0,2,0) beats agent-roster.css's
   single-class rule (0,1,0). */
.specorator-roster-detail {
  padding: 0;
}
</style>
