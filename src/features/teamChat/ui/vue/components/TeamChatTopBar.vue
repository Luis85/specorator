<script setup lang="ts">
import { computed, inject } from 'vue';

import { ProviderRegistry } from '../../../../../core/providers/ProviderRegistry';
import { t } from '../../../../../i18n/i18n';
import { showAgentActionMenu } from '../agentActionMenu';
import { CALLBACKS_KEY } from '../keys';
import { useTeamChatStore } from '../stores/teamChatStore';
import TeamRosterAvatar from '../TeamRosterAvatar.vue';
import { useActiveAgent } from '../useActiveAgent';
import EditedFilesStrip from './EditedFilesStrip.vue';
import PresenceDot from './PresenceDot.vue';

// Identity header for the active DM: the bound agent's avatar (carrying its live
// presence as a corner dot) + name + a one-line voice summary (the `voice` directive
// `formatBoundAgentPersona` injects), the model + provider the DM runs on, the files
// that agent has created/edited this thread, and an overflow menu. The active agent
// resolves from the store's `agents` + `selectedAgentId` (no dedicated slice needed);
// the files come from the view's per-tab `editedFiles` projection. Self-hides until a
// DM is active (or its agent has left the roster), so the empty-state pane below is
// never double-chromed.
const AVATAR_SIZE = 28;

const store = useTeamChatStore();
const callbacks = inject(CALLBACKS_KEY);

const activeAgent = useActiveAgent();

// Prefer the explicit voice directive; fall back to the routing description so a
// voice-less agent still gets a one-line subtitle rather than a bare name.
const voiceLine = computed(() =>
  activeAgent.value?.voice?.trim() || activeAgent.value?.description?.trim() || '');

// Reuses PresenceDot so the roster and the top bar can never disagree about what
// "busy" looks like. Unread is meaningless here (you are looking at this DM), so the
// bar only ever shows busy/idle.
const presence = computed(() =>
  (store.selectedAgentId ? store.presence[store.selectedAgentId] : undefined) ?? 'idle');

// The active DM's bound provider, resolved to its display name (Claude / Codex /
// OpenCode / Cursor Agent) so that when an agent's provider is unavailable or its CLI
// fails, the user can see which backend the DM runs on. Gate on the registry rather
// than catch a throw: an id with no registration (a since-disabled provider, or a test
// double) falls back to the raw id — the guarded-lookup shape MarketplaceRoot uses.
const providerLabel = computed(() => {
  const id = store.activeProviderId;
  if (!id) return '';
  return ProviderRegistry.getRegisteredProviderIds().includes(id)
    ? ProviderRegistry.getProviderDisplayName(id)
    : id;
});

// Projected through the same resolution the composer's model selector reads, so the two
// can't name different models for one DM. Empty (chip hidden) rather than a placeholder
// when the provider hasn't resolved a model yet.
const modelLabel = computed(() => store.activeModelId ?? '');

function openEditedFile(path: string): void {
  callbacks?.onOpenEditedFile(path);
}

// Shares its item set with the roster row's context menu — see `showAgentActionMenu` for
// what a DM deliberately does NOT offer (fork / new session / clear).
function openMenu(event: MouseEvent): void {
  const agent = activeAgent.value;
  if (!agent) return;
  showAgentActionMenu(event, {
    isBusy: presence.value === 'busy',
    onEdit: () => callbacks?.onEditAgent(agent.id),
    onClose: () => callbacks?.onCloseDm(agent.id),
  });
}
</script>

<template>
  <div
    v-if="activeAgent"
    class="specorator-team-chat-top-bar"
  >
    <span class="specorator-team-chat-top-bar-avatar">
      <TeamRosterAvatar
        :agent="activeAgent"
        :size="AVATAR_SIZE"
      />
      <PresenceDot
        :state="presence"
        class="specorator-team-chat-top-bar-dot"
      />
    </span>
    <div class="specorator-team-chat-top-bar-identity">
      <div class="specorator-team-chat-top-bar-name">
        {{ activeAgent.name }}
      </div>
      <div
        v-if="voiceLine"
        class="specorator-team-chat-top-bar-voice"
        :title="voiceLine"
      >
        {{ voiceLine }}
      </div>
    </div>
    <span
      v-if="modelLabel"
      class="specorator-team-chat-top-bar-chip specorator-team-chat-top-bar-model"
      :title="modelLabel"
    >{{ modelLabel }}</span>
    <span
      v-if="providerLabel"
      class="specorator-team-chat-top-bar-chip specorator-team-chat-top-bar-provider"
      :title="providerLabel"
    >{{ providerLabel }}</span>
    <EditedFilesStrip
      :entries="store.editedFiles"
      :on-open="openEditedFile"
    />
    <button
      type="button"
      class="specorator-team-chat-top-bar-menu"
      :aria-label="t('teamChat.topBarActions')"
      :title="t('teamChat.topBarActions')"
      @click="openMenu($event)"
    >
      ⋯
    </button>
  </div>
</template>

<style scoped>
.specorator-team-chat-top-bar {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
  flex-shrink: 0;
  padding: var(--sp-space-xs) var(--sp-space-s);
  border-bottom: 1px solid var(--sp-border);
}

/* Presence rides the avatar as a corner badge — the standard DM-client placement,
   and it keeps the identity block a single visual unit. */
.specorator-team-chat-top-bar-avatar {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}
.specorator-team-chat-top-bar-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  box-shadow: 0 0 0 2px var(--sp-surface);
}

.specorator-team-chat-top-bar-identity {
  flex: 1 1 auto;
  min-width: 0;
}
.specorator-team-chat-top-bar-name {
  font-weight: var(--sp-weight-semibold);
  color: var(--sp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-chat-top-bar-voice {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The active DM's model + backend, as small neutral chips; theme-aware through the
   tokens. The model chip truncates (ids get long); the provider chip never does. */
.specorator-team-chat-top-bar-chip {
  flex-shrink: 0;
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-smaller);
  line-height: var(--sp-line-tight);
  white-space: nowrap;
}
.specorator-team-chat-top-bar-model {
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.specorator-team-chat-top-bar-menu {
  flex: 0 0 auto;
  padding: 0 var(--sp-space-2xs);
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--sp-text-muted);
  cursor: pointer;
  line-height: 1;
}
.specorator-team-chat-top-bar-menu:hover {
  color: var(--sp-text);
}
.specorator-team-chat-top-bar-menu:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: 2px;
}

/* The shared strip's popover opens upward (composer context); in the top bar it
   would clip above the pane, so flip it to open downward here. */
.specorator-team-chat-top-bar :deep(.specorator-edited-files-menu) {
  top: calc(100% + 6px);
  bottom: auto;
}

/* Progressive shedding on a narrow pane (design §4.3): the voice line goes first
   (the name still identifies the agent), then the model chip, then the provider
   chip — identity and the overflow menu are never dropped. */
@container (max-width: 560px) {
  .specorator-team-chat-top-bar-voice {
    display: none;
  }
}
@container (max-width: 460px) {
  .specorator-team-chat-top-bar-model {
    display: none;
  }
}
@container (max-width: 380px) {
  .specorator-team-chat-top-bar-provider {
    display: none;
  }
}
</style>
