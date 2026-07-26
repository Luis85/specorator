<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import { mountIcon } from '../../../chat/ui/vue/mountIcon';
import TeamChatTopBar from './components/TeamChatTopBar.vue';
import { CALLBACKS_KEY, CONTENT_HOST_KEY } from './keys';
import { useTeamChatStore } from './stores/teamChatStore';
import TeamRoster from './TeamRoster.vue';
import { useTeamChatEventRouting } from './useTeamChatEventRouting';

const store = useTeamChatStore();
const hostEl = ref<HTMLElement | null>(null);
const mountHost = inject(CONTENT_HOST_KEY);

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('TeamChatRoot mounted without CALLBACKS_KEY');
// Subscribe before the content-host onMounted below builds the engine, so a
// restore-time selection emit projects into the store.
useTeamChatEventRouting(callbacks.subscribe);

// Capture the opaque tab-content host synchronously on mount, before the engine
// needs it. Same "leave-me-alone host" contract as chat's TabContentHost: Vue
// owns this element but never its children — the tab engine createDiv's each
// DM's DOM into it. No v-for / reactive children here.
onMounted(() => {
  if (hostEl.value && mountHost) mountHost(hostEl.value);
});

// Decorative anchor for the no-DM-selected pane; reuses the view's own `users`
// identity (getIcon). Painted through mountIcon's nodeType guard so popout leaves
// stay safe, matching EditedFilesStrip.
function emptyIcon(el: HTMLElement | null): void {
  mountIcon(el, 'users');
}
</script>

<template>
  <div class="specorator-team-chat">
    <aside class="specorator-team-chat-roster">
      <TeamRoster />
    </aside>
    <section class="specorator-team-chat-main">
      <!-- Identity + edited-files header for the active DM's agent (self-hides
           until an agent is selected), pinned above the transcript/composer host. -->
      <TeamChatTopBar />
      <!-- Phase 4a shows the empty state over a childless host; 4b opens a DM
           into the host and hides this once an agent is selected. -->
      <div
        v-if="!store.selectedAgentId"
        class="specorator-team-chat-empty"
      >
        <span
          :ref="(el) => emptyIcon(el as HTMLElement | null)"
          class="specorator-team-chat-empty-icon"
          aria-hidden="true"
        />
        <p class="specorator-team-chat-empty-text">
          {{ t('teamChat.emptyState') }}
        </p>
      </div>
      <!-- Shares the sidebar's tab-content-container constraints (flex column +
           overflow:hidden + min-height:0) so a tall transcript scrolls INSIDE
           the host instead of pushing the composer past the visible pane. -->
      <div
        ref="hostEl"
        class="specorator-team-chat-content-host specorator-tab-content-container"
      />
    </section>
  </div>
</template>

<style scoped>
.specorator-team-chat {
  display: grid;
  grid-template-columns: minmax(200px, 260px) 1fr;
  height: 100%;
  min-height: 0;
}
.specorator-team-chat-roster {
  border-right: 1px solid var(--sp-border);
  overflow-y: auto;
  min-height: 0;
}
.specorator-team-chat-main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
/* .specorator-team-chat-content-host takes its flex-column / overflow:hidden /
   min-height:0 layout from the shared .specorator-tab-content-container class
   applied in the template (same host contract as the sidebar). The only scoped
   rule is inline padding: the transcript + composer render edge-to-edge (the
   sidebar relies on the leaf for gutters), so in this wide main-area pane the
   text input would otherwise sit flush against the roster border — inset it by
   the top bar's --sp-space-s so the whole chat column aligns off the roster. */
.specorator-team-chat-content-host {
  padding-inline: var(--sp-space-s);
}
/* The transcript is reused from the narrow sidebar; in this wide main-area pane
   long assistant messages would otherwise stretch edge-to-edge. Cap the transcript
   + composer to a comfortable reading measure (only bites on wide panes). Left-
   aligned to the same gutter as the top bar, so the chat column reads as one
   docked conversation rather than a stretched sidebar. */
.specorator-team-chat-content-host :deep(.specorator-messages-wrapper),
.specorator-team-chat-content-host :deep(.specorator-input-container) {
  width: 100%;
  max-width: 56rem;
}
/* view-content padding is zeroed (team-chat-host.css) so the roster border reaches
   the bottom; give the composer its own bottom margin so it isn't flush against the
   edge — a margin, not restored view padding. */
.specorator-team-chat-content-host :deep(.specorator-input-container) {
  margin-bottom: var(--sp-space-s);
}
.specorator-team-chat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-space-s);
  padding: var(--sp-space-l);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  text-align: center;
  pointer-events: none;
}
.specorator-team-chat-empty-icon {
  display: flex;
  color: var(--sp-text-faint);
}
.specorator-team-chat-empty-icon :deep(svg) {
  width: 40px;
  height: 40px;
}
.specorator-team-chat-empty-text {
  max-width: 32ch;
}
</style>
