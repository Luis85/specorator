import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { LoopNoteStore } from '../../../tasks/loops/LoopNoteStore';
import type { LoopDefinition, SaveLoopInput } from '../../../tasks/loops/loopTypes';
import { mergeById } from '../mergeById';

/**
 * Reactive projection of the loop notes. I/O stays in LoopNoteStore; actions
 * orchestrate and commit into refs (spec § Pinia topology). `init` wires the
 * plugin once per pinia lifetime — stores are module-global, the plugin
 * reference is not reactive state.
 */
export const useLoopLibraryStore = defineStore('library-loops', () => {
  const loops = shallowRef<LoopDefinition[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;
  let noteStore = new LoopNoteStore();
  let loadToken = 0;

  function init(p: SpecoratorPlugin, store?: LoopNoteStore): void {
    plugin = p;
    if (store) noteStore = store;
  }

  function folder(): string {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    return plugin.settings.agentBoardLoopFolder || 'Agent Board/loops';
  }

  async function load(): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    // Request-token guard: a slow load that STARTED before a mutation must not
    // resolve AFTER the mutation's reload and overwrite fresher data (two
    // leaves open, or the mount load overlapping save/clone/remove). The
    // `loading` flag also commits behind the token check so a stale load can't
    // clear it while a newer one is still in flight.
    const token = ++loadToken;
    loading.value = true;
    try {
      const { loops: list } = await noteStore.list(plugin.app.vault, folder());
      if (token !== loadToken) return; // superseded by a newer load — drop stale result
      // Merge by identity (loop path is the stable key) so untouched loop cards
      // keep their previous reference — no repaint on a mutation reload.
      loops.value = mergeById(loops.value, list, (l) => l.path);
    } finally {
      if (token === loadToken) loading.value = false;
    }
  }

  async function save(input: SaveLoopInput, originalPath?: string): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    await noteStore.save(plugin.app.vault, folder(), input, originalPath);
    await load();
  }

  async function remove(loop: LoopDefinition): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    await noteStore.delete(plugin.app, loop.path);
    await load();
  }

  /** Port of LoopLibraryView.cloneLoop: probe "<name> copy[ n]" until free. */
  async function clone(loop: LoopDefinition): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    const vault = plugin.app.vault;
    let cloneName = `${loop.name} copy`;
    for (let n = 2; vault.getAbstractFileByPath(noteStore.getFilePathForName(folder(), cloneName)); n += 1) {
      cloneName = `${loop.name} copy ${n}`;
    }
    await noteStore.save(vault, folder(), { ...loop, name: cloneName });
    await load();
  }

  return { loops, loading, init, load, save, remove, clone };
});
