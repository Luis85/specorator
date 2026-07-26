<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import TeamChatEmptyPane from './components/TeamChatEmptyPane.vue';
import TeamChatStarters from './components/TeamChatStarters.vue';
import TeamChatTopBar from './components/TeamChatTopBar.vue';
import TeamRailSeparator from './components/TeamRailSeparator.vue';
import { CALLBACKS_KEY, CONTENT_HOST_KEY } from './keys';
import { COLLAPSED_RAIL_WIDTH, useTeamChatStore } from './stores/teamChatStore';
import TeamRoster from './TeamRoster.vue';
import { useTeamChatEventRouting } from './useTeamChatEventRouting';

/** Below this leaf width the rail auto-collapses regardless of the stored preference,
 *  which is left untouched so widening restores it (design §4.3). */
const NARROW_LEAF_PX = 720;

const store = useTeamChatStore();
const hostEl = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const mountHost = inject(CONTENT_HOST_KEY);

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('TeamChatRoot mounted without CALLBACKS_KEY');
// Subscribe before the content-host onMounted below builds the engine, so a
// restore-time selection emit projects into the store.
useTeamChatEventRouting(callbacks.subscribe);

// Seed the rail geometry from the leaf's persisted state ONCE. Read through a plain
// getter rather than the snapshot: geometry is written by the island and read by the
// host, so routing it through the per-frame snapshot would churn it and fight the
// separator's own drag state.
const geometry = callbacks.getRailGeometry();
store.setRailCollapsed(geometry.collapsed);
store.setRailWidth(geometry.width);

/**
 * Auto-collapse on a narrow leaf WITHOUT writing the preference: the narrow flag is layout
 * state, `store.railCollapsed` is the user's choice, and `railIsCollapsed` is the OR of the
 * two. Widening therefore restores exactly what the user last chose, and a toggle made
 * while narrow still persists for when the pane grows again.
 *
 * It lives in the STORE, not a local ref: this component sizes the grid track from it while
 * `TeamRoster` decides what to render, and when those two disagreed a narrow leaf rendered
 * expanded rows clipped inside a 56px track.
 */
const collapsed = computed(() => store.railIsCollapsed);

// Grid track for the rail. Collapsed is a fixed icon rail; expanded uses the stored
// width, so the transcript keeps every pixel the rail isn't using.
const railTrack = computed(() => (collapsed.value ? `${COLLAPSED_RAIL_WIDTH}px` : `${store.railWidth}px`));

function onResize(width: number): void {
  store.setRailWidth(width);
  callbacks?.onRailGeometryChange({ collapsed: store.railCollapsed, width: store.railWidth });
}

/**
 * Re-runs the DM-switch fade on the CONTENT HOST without re-creating it. The host is the
 * element the tab engine captured on mount and mounts every DM's DOM into, so it must
 * keep its identity for the life of the leaf — which rules out the usual `:key`-bump or
 * `<Transition>` approach. Removing the class, forcing a reflow, and re-adding it is what
 * restarts a CSS animation on a persistent node.
 */
function replayDmTransition(): void {
  const el = hostEl.value;
  if (!el) return;
  el.removeClass('is-dm-entering');
  void el.offsetWidth; // forced reflow: without it the re-add is coalesced and no animation runs
  el.addClass('is-dm-entering');
}

watch(() => store.selectedAgentId, (agentId) => {
  if (agentId) replayDmTransition();
});

// ResizeObserver on the leaf, not a media query: the pane is a workspace split, so its
// width is independent of the window's (a narrow split in a maximized window must still
// collapse). Guarded because the shared test-lane DOM polyfill has no ResizeObserver.
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (hostEl.value && mountHost) mountHost(hostEl.value);
  const el = rootEl.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    // `width > 0` is not defensive noise: an unmeasured or hidden leaf (a deferred
    // workspace leaf, a background tab, jsdom) reports 0, and treating that as "narrow"
    // would collapse the rail on every restore and un-hide. Zero means "no measurement
    // yet", so hold the current state until a real one arrives.
    store.setRailNarrow(width > 0 && width < NARROW_LEAF_PX);
  });
  observer.observe(el);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-team-chat"
    :class="{ 'is-rail-collapsed': collapsed }"
    :style="{ '--sp-team-rail-width': railTrack }"
  >
    <aside
      class="specorator-team-chat-roster"
      :class="{ 'is-collapsed': collapsed }"
    >
      <TeamRoster />
    </aside>
    <!-- Resize is meaningless on the icon rail (its width is fixed), so the handle is
         absent rather than inert while collapsed. -->
    <TeamRailSeparator
      v-if="!collapsed"
      :width="store.railWidth"
      @resize="onResize"
    />
    <section class="specorator-team-chat-main">
      <!-- Identity + presence + model/provider + edited-files header for the active DM's
           agent (self-hides until an agent is selected), pinned above the transcript. -->
      <TeamChatTopBar />
      <!-- Greeting + conversation starters for an open-but-empty DM; in normal flow, so
           it simply occupies the gap an empty transcript leaves. -->
      <TeamChatStarters />
      <!-- No DM selected: icon, guidance, and agent quick-picks over a childless host. -->
      <TeamChatEmptyPane v-if="!store.selectedAgentId" />
      <!-- Shares the sidebar's tab-content-container constraints (flex column +
           overflow:hidden + min-height:0) so a tall transcript scrolls INSIDE
           the host instead of pushing the composer past the visible pane.
           NO `:key` and no `v-for`: the engine captured this exact element on mount
           and createDiv's each DM's DOM into it, so re-creating it would strand the
           tab engine on a detached node. The DM-switch transition is re-triggered
           imperatively instead (see `replayDmTransition`). -->
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
  /* rail | separator | pane. The separator straddles the border with a negative
     inline margin, so it costs no visual gutter. */
  grid-template-columns: var(--sp-team-rail-width) auto 1fr;
  height: 100%;
  min-height: 0;
}
.specorator-team-chat.is-rail-collapsed {
  grid-template-columns: var(--sp-team-rail-width) 1fr;
}
.specorator-team-chat-roster {
  border-right: 1px solid var(--sp-border);
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.specorator-team-chat-main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  /* Declares the query container the top bar's progressive shedding measures against.
     Safe here because this is a `1fr` grid item — its inline size is set by the grid,
     never by its contents, so inline-size containment changes no layout. Measuring the
     PANE (not the window) is what makes the bar shed correctly in a narrow split. */
  container-type: inline-size;
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
/* Switching DMs swaps the host's contents in place; a short fade makes the change
   legible instead of a teleport. Applied as a class the script re-adds per switch
   (the host element itself must never be re-created). */
.specorator-team-chat-content-host.is-dm-entering {
  animation: specorator-team-chat-dm-enter 120ms ease-out;
}
@keyframes specorator-team-chat-dm-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
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

@media (prefers-reduced-motion: reduce) {
  .specorator-team-chat-content-host.is-dm-entering {
    animation: none;
  }
}
</style>
