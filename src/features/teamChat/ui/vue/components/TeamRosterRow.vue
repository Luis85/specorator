<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { RosterAgent } from '../../../../agents/roster/rosterTypes';
import type { TeamChatPresence } from '../../../teamChatPresence';
import type { TeamChatThreadMeta } from '../../../teamChatThreadMeta';
import { formatAbsoluteActivity, formatRelativeActivity, toIsoTimestamp } from '../relativeTime';
import TeamRosterAvatar from '../TeamRosterAvatar.vue';
import PresenceDot from './PresenceDot.vue';

/**
 * One roster row: avatar, name, relative activity time, last-message preview, and a
 * single status dot. Extracted from `TeamRoster` because the row now carries enough
 * derivation (preview fallback chain, timestamp formatting, dot precedence) that
 * inlining it would bury the list's keyboard/selection logic.
 *
 * Purely presentational — every value arrives as a prop and every interaction is
 * emitted. The parent owns selection, roving focus, and the context menu, so this
 * component can be mounted in isolation by the tests.
 */
const AVATAR_SIZE = 32;

const props = defineProps<{
  agent: RosterAgent;
  /** The agent's DM projection, or undefined when it has no resolved/loaded thread. */
  thread: TeamChatThreadMeta | undefined;
  presence: TeamChatPresence;
  unread: boolean;
  selected: boolean;
  /** Roving tabindex: exactly one row in the list is tabbable (design §1.4). */
  tabbable: boolean;
  /** Icon-rail mode — hides text, moves the name into the accessible label. */
  collapsed: boolean;
}>();

const emit = defineEmits<{
  select: [];
  menu: [event: MouseEvent];
}>();

/**
 * Preview → description → em-dash. A DM you have talked to shows what was said last;
 * one you haven't shows what the agent is FOR, which is the more useful thing to read
 * before a first message. The em-dash keeps the row's second line from collapsing, so
 * row heights don't jitter as previews stream in.
 */
const subtitle = computed(() => props.thread?.preview || props.agent.description || '—');

const timestamp = computed(() => props.thread?.updatedAt ?? 0);
const relativeTime = computed(() => formatRelativeActivity(timestamp.value));
const absoluteTime = computed(() => formatAbsoluteActivity(timestamp.value));

/**
 * One dot, not three. `busy` outranks `unread` because a streaming agent is the more
 * urgent signal AND is about to change the unread state anyway; `idle` is the floor.
 */
const dotState = computed<TeamChatPresence | 'unread'>(() => {
  if (props.presence === 'busy') return 'busy';
  return props.unread ? 'unread' : 'idle';
});

// Collapsed rows have no visible text, so the accessible name has to carry the
// identity the sighted user reads off the row.
const accessibleLabel = computed(() =>
  props.collapsed ? props.agent.name : `${props.agent.name}. ${subtitle.value}`);
</script>

<template>
  <div
    class="specorator-team-roster-row"
    :class="{ 'is-selected': props.selected, 'is-collapsed': props.collapsed, 'is-unread': props.unread }"
    role="option"
    :tabindex="props.tabbable ? 0 : -1"
    :aria-selected="props.selected"
    :aria-label="accessibleLabel"
    :title="props.collapsed ? props.agent.name : undefined"
    @click="emit('select')"
    @contextmenu.prevent="emit('menu', $event)"
  >
    <span class="specorator-team-roster-row-avatar">
      <TeamRosterAvatar
        :agent="props.agent"
        :size="AVATAR_SIZE"
      />
      <!-- In the icon rail the dot rides the avatar, since there is no text column
           left to hold it — same placement the top bar uses. -->
      <PresenceDot
        v-if="props.collapsed"
        :state="dotState"
        class="specorator-team-roster-row-corner-dot"
      />
    </span>

    <template v-if="!props.collapsed">
      <div class="specorator-team-roster-meta">
        <div class="specorator-team-roster-line">
          <span class="specorator-team-roster-name">{{ props.agent.name }}</span>
          <time
            v-if="relativeTime"
            class="specorator-team-roster-time"
            :datetime="toIsoTimestamp(timestamp)"
            :title="absoluteTime"
          >{{ relativeTime }}</time>
        </div>
        <div class="specorator-team-roster-line">
          <span class="specorator-team-roster-desc">{{ subtitle }}</span>
          <PresenceDot :state="dotState" />
        </div>
      </div>
      <!-- Keyboard-reachable twin of the right-click menu. Revealed on row hover/focus
           so it doesn't clutter a 20-row rail, but it stays in the tab order under the
           row's own roving tabindex rather than being mouse-only. -->
      <button
        type="button"
        class="specorator-team-roster-row-menu"
        :aria-label="t('teamChat.rowActions')"
        :title="t('teamChat.rowActions')"
        :tabindex="props.tabbable ? 0 : -1"
        @click.stop="emit('menu', $event)"
      >
        ⋯
      </button>
    </template>
  </div>
</template>

<style scoped>
.specorator-team-roster-row {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
  padding: var(--sp-space-2xs);
  border-radius: var(--sp-radius-s);
  cursor: pointer;
  /* Fixed two-line height so rows don't jitter as previews arrive/lengthen. */
  min-height: 44px;
  transition: background-color 120ms ease;
}
.specorator-team-roster-row:hover {
  background: var(--sp-surface-hover);
}
.specorator-team-roster-row.is-selected {
  background: var(--sp-surface-raised);
  box-shadow: inset 2px 0 0 var(--sp-accent);
}
.specorator-team-roster-row:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: -2px;
}
.specorator-team-roster-row.is-collapsed {
  justify-content: center;
  gap: 0;
  padding: var(--sp-space-2xs) 0;
}

/* Avatar + its corner dot share a positioning context (collapsed mode only). */
.specorator-team-roster-row-avatar {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}
.specorator-team-roster-row-corner-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  /* Ring the dot in the rail's own background so it reads as a badge on top of the
     avatar rather than a smudge blending into the artwork underneath. */
  box-shadow: 0 0 0 2px var(--sp-surface);
}

.specorator-team-roster-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
/* Name/time and preview/dot are each a row: the text flexes and truncates while the
   trailing element keeps its intrinsic width. */
.specorator-team-roster-line {
  display: flex;
  align-items: center;
  gap: var(--sp-space-2xs);
  min-width: 0;
}
.specorator-team-roster-name {
  flex: 1 1 auto;
  font-weight: var(--sp-weight-medium);
  color: var(--sp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-roster-row.is-unread .specorator-team-roster-name {
  font-weight: var(--sp-weight-semibold);
}
.specorator-team-roster-time {
  flex: 0 0 auto;
  color: var(--sp-text-faint);
  font-size: var(--sp-font-smaller);
  font-variant-numeric: tabular-nums;
}
.specorator-team-roster-desc {
  flex: 1 1 auto;
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-roster-row.is-unread .specorator-team-roster-desc {
  color: var(--sp-text);
}

.specorator-team-roster-row-menu {
  flex: 0 0 auto;
  padding: 0 var(--sp-space-2xs);
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--sp-text-muted);
  cursor: pointer;
  line-height: 1;
  /* Hidden until the row is engaged, but never `display: none` — it must stay
     focusable and keep its width reserved so the row doesn't reflow on hover. */
  opacity: 0;
}
.specorator-team-roster-row:hover .specorator-team-roster-row-menu,
.specorator-team-roster-row:focus-within .specorator-team-roster-row-menu {
  opacity: 1;
}
.specorator-team-roster-row-menu:focus-visible {
  opacity: 1;
  outline: 2px solid var(--sp-border-focus);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .specorator-team-roster-row {
    transition: none;
  }
}
</style>
