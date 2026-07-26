<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';

import { t } from '../../../../i18n/i18n';
import { withErrorNotice } from '../../../../shared/uiAction';
import { rosterLibraryAccessors } from '../../../agents/roster/rosterLibraryAccessors';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { useRosterStore } from '../../../library/vue/stores/rosterStore';
import { useLibraryList } from '../../../library/vue/useLibraryList';
import { activateMarketplace } from '../../../marketplace/activateMarketplace';
import { showAgentActionMenu } from './agentActionMenu';
import TeamRosterEmpty from './components/TeamRosterEmpty.vue';
import TeamRosterRow from './components/TeamRosterRow.vue';
import TeamRosterToolbar from './components/TeamRosterToolbar.vue';
import { CALLBACKS_KEY, PLUGIN_KEY } from './keys';
import { useTeamChatStore } from './stores/teamChatStore';
import { applyRecentSort, type TeamRosterSort,toLibrarySort } from './teamRosterSort';
import { useRosterKeyboard } from './useRosterKeyboard';

const ROSTER_RELOAD_DEBOUNCE_MS = 300;
/** Below this, a search field over a handful of rows is noise (design §1.1). */
const ROSTER_SEARCH_MIN_AGENTS = 6;

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('TeamRoster mounted without PLUGIN_KEY');

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('TeamRoster mounted without CALLBACKS_KEY');

// The engine resolves-or-opens the DM and projects the selection back through
// the store, so the row handler is a thin delegator (no optimistic store write).
// `callbacks?.` mirrors this file's `plugin?.` convention: a hoisted function
// declaration is typed before the `if (!callbacks) throw` guard narrows it.
function selectAgent(agentId: string): void {
  callbacks?.onSelectAgent(agentId);
}

// Empty-roster CTA: deep-link the Marketplace's Agents category so a first-time
// user with no team can get/create agents (mirrors the Library's "Browse
// Marketplace" link). `'agent'` is the real MarketplaceItemType the deep-link
// expects — the design doc's `'agents'` predates the singular category id.
function browseMarketplace(): void {
  if (plugin) void activateMarketplace(plugin, 'agent');
}

// Reuse the library roster store as the loader (vault I/O stays there); mirror
// its list into this leaf's read-model, which the DM surface reads. Instantiated
// in THIS leaf's Pinia, so it never shares state with a Library leaf.
const rosterStore = useRosterStore();
rosterStore.init(plugin);
const teamChatStore = useTeamChatStore();

// `immediate` seeds on mount and re-mirrors on every roster reload.
watch(() => rosterStore.agents, (agents) => teamChatStore.setAgents(agents), { immediate: true });

// Search/filter through the SAME engine the Library's AgentsPanel uses, so query
// semantics can't drift between the two surfaces. `recent` has no library
// equivalent, so the list engine sorts by name underneath and applyRecentSort
// re-orders on top (which also makes name the tiebreaker for threadless agents).
const sort = ref<TeamRosterSort>('recent');
const list = useLibraryList<RosterAgent>(() => teamChatStore.agents, rosterLibraryAccessors);
watch(sort, (next) => { list.sort.value = toLibrarySort(next); }, { immediate: true });

const rows = computed(() => (sort.value === 'recent'
  ? applyRecentSort(list.rows.value, teamChatStore.threads)
  : list.rows.value));

const showSearch = computed(() => teamChatStore.agents.length >= ROSTER_SEARCH_MIN_AGENTS);

// --- Roving tabindex (design §1.4) -------------------------------------------------
const listEl = ref<HTMLElement | null>(null);

function focusRowElement(index: number): void {
  const el = listEl.value?.querySelectorAll<HTMLElement>('[role="option"]')[index];
  el?.focus();
}

const keyboard = useRosterKeyboard(
  () => rows.value.length,
  (index) => {
    const agent = rows.value[index];
    if (agent) selectAgent(agent.id);
  },
  focusRowElement,
);

// Keep the roving focus on the SELECTED row whenever selection changes from
// elsewhere (a cross-leaf reveal, a restore, a rotation) so tabbing into the rail
// lands on the DM the pane is showing rather than wherever focus was left.
watch(() => teamChatStore.selectedAgentId, (agentId) => {
  const index = rows.value.findIndex((agent) => agent.id === agentId);
  if (index >= 0) keyboard.focusRow(index);
});

// --- Rail collapse (design §1.6) ----------------------------------------------------
const collapseLabel = computed(() =>
  t(teamChatStore.railIsCollapsed ? 'teamChat.railExpand' : 'teamChat.railCollapse'));

// The store holds the live value (the root reads it for the grid template); the host
// persists it per leaf. Width is passed through untouched so expanding restores the
// width the user dragged to rather than snapping back to the default.
function toggleCollapse(): void {
  // Derived from the EFFECTIVE state, not the stored preference. While a narrow leaf forces
  // the icon rail the button reads "Expand" — and inverting the PREFERENCE there (still
  // false) would persist `collapsed: true`, so widening the pane would leave the rail
  // collapsed: the opposite of the action the user just took.
  const collapsed = !teamChatStore.railIsCollapsed;
  teamChatStore.setRailCollapsed(collapsed);
  callbacks?.onRailGeometryChange({ collapsed, width: teamChatStore.railWidth });
}

// --- Per-row context menu (design §1.5) --------------------------------------------
// Shares its item set with the top bar's overflow menu, so the two can't drift about what
// a DM offers — see `showAgentActionMenu` for what is deliberately absent.
function openRowMenu(agent: RosterAgent, event: MouseEvent): void {
  showAgentActionMenu(event, {
    includeOpen: true,
    isBusy: teamChatStore.presence[agent.id] === 'busy',
    onOpen: () => selectAgent(agent.id),
    onEdit: () => callbacks?.onEditAgent(agent.id),
    onClose: () => callbacks?.onCloseDm(agent.id),
  });
}

onMounted(() => void withErrorNotice(() => rosterStore.load(), t('agentRoster.actionFailed'), fail));

// Roster agents are managed through agentRosterStore (not loose vault notes), so
// a folder watch is the wrong seam: the store emits `roster:changed` on every
// save/delete. Subscribe + debounce-reload so an external edit (Agent Board,
// chat-view roster edit, provider sync, marketplace install) refreshes this leaf
// without a remount. Same shape as AgentsPanel's subscription.
let rosterOff: (() => void) | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  rosterOff = plugin.events.on('roster:changed', () => {
    if (reloadTimer !== null) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void withErrorNotice(() => rosterStore.load(), t('agentRoster.actionFailed'), fail);
    }, ROSTER_RELOAD_DEBOUNCE_MS);
  });
});

onUnmounted(() => {
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  rosterOff?.();
  rosterOff = null;
});

function fail(error: unknown): void {
  // `plugin?` (not the narrowed const): a hoisted function declaration is typed
  // before the `if (!plugin) throw` guard narrows it (parity with AgentsPanel).
  plugin?.logger.scope('team-chat').error('roster load failed', error);
}
</script>

<template>
  <div
    class="specorator-team-roster"
    :class="{ 'is-collapsed': teamChatStore.railIsCollapsed }"
  >
    <!-- Header holds the collapse toggle in BOTH states; when collapsed the title drops
         and the toggle is all that remains, so the rail is never a one-way door. -->
    <div class="specorator-team-roster-header">
      <span
        v-if="!teamChatStore.railIsCollapsed"
        class="specorator-team-roster-title"
      >{{ t('teamChat.viewTitle') }}</span>
      <button
        type="button"
        class="specorator-team-roster-collapse"
        :aria-label="collapseLabel"
        :aria-expanded="!teamChatStore.railIsCollapsed"
        :title="collapseLabel"
        @click="toggleCollapse()"
      >
        {{ teamChatStore.railIsCollapsed ? '»' : '«' }}
      </button>
    </div>

    <TeamRosterToolbar
      v-if="!teamChatStore.railIsCollapsed && teamChatStore.agents.length > 0"
      v-model:query="list.query.value"
      v-model:sort="sort"
      :show-search="showSearch"
    />

    <!-- Both non-list states in one component, so this template keeps a single
         list-vs-empty branch. -->
    <TeamRosterEmpty
      v-if="rows.length === 0"
      :is-roster-empty="teamChatStore.agents.length === 0"
      :collapsed="teamChatStore.railIsCollapsed"
      @browse="browseMarketplace()"
    />
    <!-- listbox/option, not button rows: "pick one of N, the pane shows the pick" is
         what a listbox announces, and it is what makes the selected row read as
         selected. One tab stop; arrows move focus, Enter/Space opens (design §1.4). -->
    <div
      v-else
      ref="listEl"
      class="specorator-team-roster-list"
      role="listbox"
      :aria-label="t('teamChat.viewTitle')"
      @keydown="keyboard.onKeydown"
    >
      <TeamRosterRow
        v-for="(agent, index) in rows"
        :key="agent.id"
        :agent="agent"
        :thread="teamChatStore.threads[agent.id]"
        :presence="teamChatStore.presence[agent.id] ?? 'idle'"
        :unread="Boolean(teamChatStore.unread[agent.id])"
        :selected="teamChatStore.selectedAgentId === agent.id"
        :tabbable="keyboard.focusedIndex.value === index"
        :collapsed="teamChatStore.railIsCollapsed"
        @select="keyboard.focusRow(index); selectAgent(agent.id)"
        @menu="openRowMenu(agent, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.specorator-team-roster {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-s);
  min-height: 0;
}
.specorator-team-roster.is-collapsed {
  padding: var(--sp-space-s) var(--sp-space-2xs);
  align-items: stretch;
}
.specorator-team-roster-header {
  display: flex;
  align-items: center;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-2xs) var(--sp-space-2xs) var(--sp-space-xs);
}
.specorator-team-roster.is-collapsed .specorator-team-roster-header {
  justify-content: center;
  padding-inline: 0;
}
.specorator-team-roster-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: var(--sp-weight-semibold);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-smaller);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-roster-collapse {
  flex: 0 0 auto;
  padding: 0 var(--sp-space-2xs);
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--sp-text-muted);
  cursor: pointer;
  line-height: 1;
}
.specorator-team-roster-collapse:hover {
  color: var(--sp-text);
}
.specorator-team-roster-collapse:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: 2px;
}
.specorator-team-roster-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
}
</style>
