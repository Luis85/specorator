import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { cloneRosterAgent, draftRosterAgent } from '../../../agents/roster/rosterCapabilities';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';

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
      agents.value = list;
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
    await p.removeRosterAgentProjection(agent);
    await load();
  }

  return { agents, loading, init, load, save, clone, draftNewAgent, remove };
});
