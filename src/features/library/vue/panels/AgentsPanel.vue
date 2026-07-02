<script setup lang="ts">
import { Notice } from 'obsidian';
import { inject, nextTick, onMounted, onUnmounted, ref } from 'vue';

import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { installPresetAgentsWithNotice, startChatWithRosterAgent, syncRosterAgentsWithNotice } from '../../../agents/roster/rosterAgentActions';
import { rosterLibraryAccessors, rosterRoleLabel } from '../../../agents/roster/rosterLibraryAccessors';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { AgentDetailEditor } from '../../../agents/roster/view/AgentDetailEditor';
import AvatarSlot from '../components/AvatarSlot.vue';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY, TAB_GUARD_KEY } from '../libraryKeys';
import { useRosterStore } from '../stores/rosterStore';
import { useLibraryList } from '../useLibraryList';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('AgentsPanel mounted without PLUGIN_KEY');

const store = useRosterStore();
store.init(plugin);

const CARD_AVATAR_SIZE = 36;
const detailHost = ref<HTMLElement | null>(null);
const detailOpen = ref(false);

// Rows re-derive from the global store (source-based useLibraryList), so
// mutations in ANY leaf propagate to every mounted panel automatically.
const list = useLibraryList<RosterAgent>(() => store.agents, rosterLibraryAccessors);

const tabGuard = inject(TAB_GUARD_KEY, null);

onMounted(() => void withErrorNotice(() => store.load(), t('agentRoster.actionFailed'), fail));

// Safety net: if the panel unmounts through any other path, never leave a
// stale guard blocking the tab strip.
onUnmounted(() => {
  if (tabGuard) tabGuard.value = null;
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
  await editor.render(detailHost.value, agent, opts);
  // Tab switches unmount this panel and would silently discard dirty edits —
  // register a guard that reuses the editor's own dirty state and the SAME
  // confirm strings its Back path uses (see AgentDetailEditor.handleBack).
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
  void withErrorNotice(() => startChat(agent), t('agentRoster.actionFailed'), fail);
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
  void withErrorNotice(async () => {
    const clone = await store.clone(agent);
    await openDetail(clone);
  }, t('agentRoster.actionFailed'), fail);
}

function onDelete(agent: RosterAgent): void {
  // async wrapper: withErrorNotice takes () => Promise<void>, so the
  // confirmedDelete boolean stays internal.
  void withErrorNotice(async () => {
    await confirmedDelete(agent);
  }, t('agentRoster.actionFailed'), fail);
}

function onNewAgent(): void {
  void withErrorNotice(async () => {
    // In-memory draft, NOT pre-saved (parity with createAndEdit): abandoning
    // the editor leaves no orphan file.
    const draft = await store.draftNewAgent(t('agentRoster.newAgent'));
    await openDetail(draft, { isNew: true });
  }, t('agentRoster.actionFailed'), fail);
}

function onInstallStarters(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    await installPresetAgentsWithNotice(plugin);
    await reload();
  }, t('agentRoster.actionFailed'), fail);
}

function onSync(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    await syncRosterAgentsWithNotice(plugin);
  }, t('agentRoster.actionFailed'), fail);
}

function modelLabel(agent: RosterAgent): string {
  const selection = agent.modelSelection;
  if (!selection || !plugin) return '';
  const options = ProviderRegistry.getChatUIConfig(selection.providerId)
    .getModelOptions(asSettingsBag(plugin.settings));
  return options.find((o) => o.value === selection.modelId)?.label ?? selection.modelId;
}

/** Legacy parity: an agent with no chips renders no (empty) caps row at all. */
function hasCaps(agent: RosterAgent): boolean {
  // `!= null` (not `!== undefined`): a raw `"modelSelection": null` in roster
  // JSON must not open the caps row while the chip's truthiness check skips it.
  return (
    agent.roles.length > 0 ||
    (agent.tags ?? []).length > 0 ||
    agent.modelSelection != null ||
    agent.skills.length > 0
  );
}
</script>

<template>
  <div v-show="!detailOpen">
    <div class="specorator-library-header">
      <h2>{{ t('agentRoster.title') }}</h2>
      <div class="specorator-library-header-actions">
        <button
          type="button"
          class="mod-cta"
          @click="onNewAgent"
        >
          {{ t('agentRoster.newAgent') }}
        </button>
        <button
          type="button"
          @click="onInstallStarters"
        >
          {{ t('agentRoster.installStarter') }}
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
    <div class="specorator-library-toolbar-slot">
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
    <div class="specorator-library-list">
      <div
        v-if="store.loading"
        class="specorator-library-loading"
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
          class="specorator-library-empty-text"
        >
          {{ t('library.noMatches') }}
        </div>
        <!-- eslint-disable vue/attribute-hyphenation -- vue-tsc only resolves the
          REQUIRED ariaLabel prop in camelCase (hyphenated aria-* is typed as a
          native attribute), so lint:fix must not flip it back to aria-label. -->
        <LibraryCard
          v-for="agent in list.rows.value"
          :key="agent.id"
          class="specorator-roster-card"
          :name="agent.name"
          :ariaLabel="agent.name"
          @activate="openDetail(agent)"
        >
          <template #leading>
            <AvatarSlot
              :agent="agent"
              :size="CARD_AVATAR_SIZE"
            />
          </template>
          <div class="specorator-roster-card-desc">
            {{ agent.description || '—' }}
          </div>
          <div
            v-if="hasCaps(agent)"
            class="specorator-library-card-caps"
          >
            <span
              v-for="role in agent.roles"
              :key="role"
              class="specorator-roster-chip specorator-roster-chip-role"
            >
              {{ rosterRoleLabel(role) }}
            </span>
            <span
              v-for="tag in agent.tags ?? []"
              :key="tag"
              class="specorator-library-chip"
            >{{ tag }}</span>
            <span
              v-if="agent.modelSelection"
              class="specorator-roster-chip specorator-roster-chip-model"
            >
              {{ modelLabel(agent) }}
            </span>
            <span
              v-if="agent.skills.length > 0"
              class="specorator-roster-chip"
            >
              {{ t('agentRoster.capsSummary', { skills: String(agent.skills.length) }) }}
            </span>
          </div>
          <template #actions>
            <button
              type="button"
              class="mod-cta"
              @click="onStartChat(agent)"
            >
              {{ t('agentRoster.startChatShort') }}
            </button>
            <button
              type="button"
              class="specorator-library-card-icon"
              :aria-label="t('library.duplicate')"
              :title="t('library.duplicate')"
              @click="onClone(agent)"
            >
              ⧉
            </button>
            <button
              type="button"
              class="specorator-library-card-delete"
              @click="onDelete(agent)"
            >
              {{ t('agentRoster.delete') }}
            </button>
          </template>
        </LibraryCard>
        <!-- eslint-enable vue/attribute-hyphenation -->
      </template>
    </div>
  </div>
  <div
    v-if="detailOpen"
    ref="detailHost"
    class="specorator-roster-detail"
  />
</template>
