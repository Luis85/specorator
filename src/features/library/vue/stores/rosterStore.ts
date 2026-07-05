import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { cloneRosterAgent, draftRosterAgent } from '../../../agents/roster/rosterCapabilities';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { mergeById } from '../mergeById';

export const useRosterStore = defineStore('library-agents', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;
  let loadToken = 0;

  function init(p: SpecoratorPlugin): void {
    plugin = p;
  }

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('rosterStore used before init()');
    return plugin;
  }

  async function load(): Promise<void> {
    const p = requirePlugin();
    // Request-token guard: a slow load that STARTED before a mutation must not
    // resolve AFTER the mutation's reload and overwrite fresher data (two
    // leaves open, or the mount load overlapping clone/save/remove). The
    // `loading` flag also commits behind the token check so a stale load can't
    // clear it while a newer one is still in flight.
    const token = ++loadToken;
    loading.value = true;
    try {
      const list = await p.agentRosterStore.list();
      if (token !== loadToken) return; // superseded by a newer load — drop stale result
      // Merge by identity so untouched rows keep their previous object reference
      // (no child avatar/icon repaint on a mutation reload — see mergeById).
      agents.value = mergeById(agents.value, list, (a) => a.id);
    } finally {
      if (token === loadToken) loading.value = false;
    }
  }

  async function save(agent: RosterAgent): Promise<void> {
    await requirePlugin().agentRosterStore.save(agent);
    await load();
  }

  /** Legacy cloneAgent parity (name probe + id dedupe), returning the clone. */
  async function clone(agent: RosterAgent): Promise<RosterAgent> {
    const p = requirePlugin();
    const existing = await p.agentRosterStore.list();
    const cloned = cloneRosterAgent(agent, existing, Date.now());
    await p.agentRosterStore.save(cloned);
    await load();
    return cloned;
  }

  /** Legacy createAndEdit parity: an in-memory draft (NOT pre-saved). */
  async function draftNewAgent(newAgentLabel: string): Promise<RosterAgent> {
    const p = requirePlugin();
    const existing = await p.agentRosterStore.list();
    return draftRosterAgent(newAgentLabel, existing, Date.now());
  }

  async function remove(agent: RosterAgent): Promise<void> {
    const p = requirePlugin();
    await p.agentRosterStore.delete(agent.id);
    // The roster file is now gone — the delete has succeeded. Provider-projection
    // cleanup is explicitly best-effort (it isolates per-file failures itself),
    // so a throw from it must NOT reject remove(): that would both present a
    // succeeded delete as a failure AND skip the reload below, leaving the
    // deleted agent's card lingering in every mounted leaf — the "delete did
    // nothing" phantom. Surface it as a warning and carry on to reload.
    try {
      await p.removeRosterAgentProjection(agent);
    } catch (error) {
      p.logger.scope('agents').warn('roster projection cleanup failed after delete', error);
    }
    await load();
  }

  return { agents, loading, init, load, save, clone, draftNewAgent, remove };
});
