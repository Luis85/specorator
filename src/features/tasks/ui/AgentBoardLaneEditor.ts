import { markRaw } from 'vue';

import type SpecoratorPlugin from '../../../main';
import { LANE_EDITOR_PLUGIN_KEY } from './vue/laneEditorKeys';
import LaneEditorRoot from './vue/LaneEditorRoot.vue';
import { VueIsland } from './vue/vueIsland';

// Mounts the Agent Board lane editor Vue island into a Settings host. The render
// function keeps its `(container, plugin): void` signature so both Settings call
// sites (`registry/fields/agentBoard.ts` and `ui/AgentBoardSettingsSection.ts`)
// stay untouched.
//
// Lifecycle: neither Settings host offers a disposer we can return without
// changing this void signature — the registry field discards our return value
// and the legacy section renderer returns void. Both hosts tear this section
// down the same way: `SpecoratorSettingTab.display()` (and `hide()`) empties the
// container's ancestor, detaching our mount point from the document. We watch for
// that detach with a MutationObserver and unmount then, so `onUnmounted` hooks
// (Vue teardown) always run and no listeners leak. The observer callback fires
// asynchronously after `.empty()`, by which point a fresh `display()` has mounted
// its own island bound to a new container — each observer closes over its own
// container, so the stale one unmounts only itself.
export function renderAgentBoardLaneEditor(container: HTMLElement, plugin: SpecoratorPlugin): void {
  // Mount into a dedicated child, NOT `container` itself: Vue's `app.mount(el)`
  // clears the target (`el.textContent = ''`). The registry host passes a fresh
  // empty field element, but the legacy `AgentBoardSettingsSection` host passes
  // its shared container that already holds sibling settings + the "Board lanes"
  // heading — mounting into it would wipe them. A child isolates the clear
  // (parity with the imperative `container.createDiv(...)` which appended).
  // Resolve the container's own document (popout-safe) once — used for both the
  // mount child and the detach observer.
  const doc = container.ownerDocument;
  const mountEl = container.createDiv();
  const island = new VueIsland();
  island.mount(LaneEditorRoot, mountEl, (app) => {
    app.provide(LANE_EDITOR_PLUGIN_KEY, markRaw(plugin));
  });

  // The mount child rides inside `container`, so keying teardown on the
  // container's detach (not the child's) is correct — the child leaves with it.
  const observer = new MutationObserver(() => {
    if (container.isConnected) return;
    observer.disconnect();
    island.unmount();
  });
  observer.observe(doc.body, { childList: true, subtree: true });
}
