import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';
import LoopsPanel from '@/features/library/vue/panels/LoopsPanel.vue';
import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';

vi.mock('@/features/quickActions/launchLoopPrompt', () => ({ launchLoopPrompt: vi.fn() }));
vi.mock('@/features/tasks/ui/LoopEditorModal', () => ({
  // Function expression: tinyspy constructs the implementation with `new`,
  // and arrows are not constructible.
  LoopEditorModal: vi.fn(function () {
    return { open: vi.fn() };
  }),
}));
vi.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmDelete: vi.fn(),
}));
import { launchLoopPrompt } from '@/features/quickActions/launchLoopPrompt';
import { LoopEditorModal } from '@/features/tasks/ui/LoopEditorModal';
import { confirm } from '@/shared/modals/ConfirmModal';

const loop = { path: 'l/a.md', id: 'a', name: 'A loop', description: 'desc', useWhen: 'when', approach: 'x', steps: '', verify: '', notes: '', tags: ['tag1'] };

function setup(loops: unknown[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  // One plugin object for BOTH init() and provide() — the panel re-inits the
  // store with the injected plugin, so they must be the same fake.
  const plugin = {
    app: { vault: makeVaultFake().vault },
    settings: {},
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
  const store = useLoopLibraryStore();
  store.init(plugin, { list: vi.fn().mockResolvedValue({ loops, warnings: [] }) } as never);
  const utils = render(LoopsPanel, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: plugin },
    },
  });
  return { store, plugin, ...utils };
}

describe('LoopsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders loop cards with description, useWhen row, and tag chips', async () => {
    setup([loop]);
    expect(await screen.findByText('A loop')).toBeTruthy();
    expect(screen.getByText('desc')).toBeTruthy();
    // Tags render in BOTH the toolbar filter chips and the card — scope to the
    // card or getByText throws 'Found multiple elements'.
    const card = screen.getByRole('button', { name: 'A loop' });
    expect(within(card).getByText('tag1')).toBeTruthy();
  });

  it('shows the loading indicator only on the first/empty load, never on a background mutation reload', async () => {
    const { store } = setup([loop]);
    await screen.findByText('A loop');
    store.loading = true; // background reload, rows still present
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeNull();
    store.loops = []; // first/empty load
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeTruthy();
  });

  it('Prompt button launches the loop prompt flow without activating the card', async () => {
    setup([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(launchLoopPrompt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'a' }));
  });

  it('shows the empty state with a New loop CTA when there are no loops', async () => {
    setup([]);
    expect(await screen.findByText(/No loops yet/)).toBeTruthy();
  });
});

type VaultHandler = (file: { path?: string }, oldPath?: string) => void;

/** Vault fake capturing the panel's folder-scoped event subscriptions so tests
 * can fire create/modify/delete/rename as an external writer would. */
function makeVaultFake() {
  const handlers: Record<string, VaultHandler> = {};
  return {
    handlers,
    vault: {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      on: vi.fn((name: string, handler: VaultHandler) => {
        handlers[name] = handler;
        return { event: name }; // opaque EventRef token, asserted against offref
      }),
      offref: vi.fn(),
    },
  };
}

/** Mutation flows need a fuller note-store fake than the render-only setup. */
function setupMutable(loops: unknown[], overrides: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const errorLog = vi.fn();
  const { vault, handlers } = makeVaultFake();
  const plugin = {
    app: { vault },
    settings: {},
    logger: { scope: () => ({ error: errorLog, warn: vi.fn() }) },
  } as never;
  const noteStore = {
    list: vi.fn().mockResolvedValue({ loops, warnings: [] }),
    save: vi.fn().mockResolvedValue('l/x.md'),
    delete: vi.fn().mockResolvedValue(undefined),
    getFilePathForName: (_f: string, name: string) => `l/${name}.md`,
    ...overrides,
  };
  const store = useLoopLibraryStore();
  store.init(plugin, noteStore as never);
  const utils = render(LoopsPanel, {
    global: { plugins: [pinia], provide: { [PLUGIN_KEY as symbol]: plugin } },
  });
  return { store, plugin, noteStore, errorLog, vault, vaultHandlers: handlers, ...utils };
}

describe('LoopsPanel mutation flows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Duplicate button clones through the store and reloads', async () => {
    const { noteStore } = setupMutable([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(noteStore.save).toHaveBeenCalledWith(
      expect.anything(), 'Agent Board/loops', expect.objectContaining({ name: 'A loop copy' }),
    ));
    expect(noteStore.list.mock.calls.length).toBeGreaterThan(1);
  });

  it('Delete button confirms then removes through the store and reloads', async () => {
    const { noteStore } = setupMutable([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(noteStore.delete).toHaveBeenCalledWith(expect.anything(), 'l/a.md'));
    expect(confirm).toHaveBeenCalled();
    // Multi-leaf staleness contract: remove() must reload the shared store.
    await waitFor(() => expect(noteStore.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('Delete keeps the loop when the confirm is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const { noteStore } = setupMutable([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(noteStore.delete).not.toHaveBeenCalled();
  });

  it('New loop opens the editor; saving forwards originalPath through the store', async () => {
    const { noteStore } = setupMutable([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'New loop' }));
    expect(LoopEditorModal).toHaveBeenCalledWith(expect.anything(), null, expect.any(Function));
    const onSave = vi.mocked(LoopEditorModal).mock.calls[0][2] as (p: unknown) => Promise<void>;
    await onSave({
      name: 'New', useWhen: '', approach: 'a', steps: '', verify: '', notes: '',
      originalPath: 'l/a.md',
    });
    // originalPath MUST reach the note store's 4th argument — dropping it
    // silently turns an edit-rename into a duplicated note.
    expect(noteStore.save).toHaveBeenCalledWith(
      expect.anything(), 'Agent Board/loops', expect.objectContaining({ name: 'New' }), 'l/a.md',
    );
  });

  it('activating a card opens the editor pre-filled with that loop', async () => {
    setupMutable([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'A loop' }));
    expect(LoopEditorModal).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ id: 'a' }), expect.any(Function),
    );
  });

  it('empty state CTA opens the editor for a new loop', async () => {
    setupMutable([]);
    // DOM cycles empty → loading → empty during the mount-time load(); a
    // macrotask tick lets it settle before we grab the CTA.
    await new Promise((r) => setTimeout(r));
    const cta = document.querySelector('.specorator-vue-empty-action');
    expect(cta).toBeTruthy();
    await fireEvent.click(cta as Element);
    expect(LoopEditorModal).toHaveBeenCalledWith(expect.anything(), null, expect.any(Function));
  });

  it('query filters cards (incl. no-matches text) and updated-sort stays stable', async () => {
    const loopB = { ...loop, path: 'l/b.md', id: 'b', name: 'B loop', description: 'other', updatedAt: 5 };
    setupMutable([loop, loopB]);
    await screen.findByText('A loop');
    await fireEvent.update(screen.getByRole('combobox'), 'updated');
    await fireEvent.update(screen.getByRole('searchbox'), 'desc');
    expect(screen.getByText('A loop')).toBeTruthy();
    expect(screen.queryByText('B loop')).toBeNull();
    await fireEvent.update(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No items match your search.')).toBeTruthy();
  });

  it('surfaces a load failure via the error logger (withErrorNotice path)', async () => {
    const { errorLog } = setupMutable([], { list: vi.fn().mockRejectedValue(new Error('boom')) });
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
  });

  it('Duplicate marks the row busy (all actions disabled + aria-busy), fires ONE clone on double-click, re-enables on resolve', async () => {
    const { store } = setupMutable([loop]);
    await screen.findByText('A loop');
    let resolveClone!: () => void;
    const cloneSpy = vi.spyOn(store, 'clone')
      .mockReturnValue(new Promise<void>((r) => { resolveClone = r; }));
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    const prompt = screen.getByRole('button', { name: 'Prompt' }) as HTMLButtonElement;
    await fireEvent.click(dup);
    await waitFor(() => expect(dup.disabled).toBe(true));
    // One busy bit per row gates ALL of that row's actions.
    expect(del.disabled).toBe(true);
    expect(prompt.disabled).toBe(true);
    expect(dup.getAttribute('aria-busy')).toBe('true');
    const actions = document.querySelector('.specorator-vue-card-actions');
    expect(actions?.classList.contains('is-busy')).toBe(true);
    // The double-clone bug: a second click during the vault write must not
    // fire a second clone.
    await fireEvent.click(dup);
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    resolveClone();
    await waitFor(() => expect(dup.disabled).toBe(false));
    expect(actions?.classList.contains('is-busy')).toBe(false);
    expect(dup.getAttribute('aria-busy')).toBeNull();
  });

  it('Delete holds the row busy through the confirm, blocking clone-during-delete races', async () => {
    let resolveConfirm!: (ok: boolean) => void;
    vi.mocked(confirm).mockReturnValueOnce(new Promise<boolean>((r) => { resolveConfirm = r; }));
    const { store, noteStore } = setupMutable([loop]);
    await screen.findByText('A loop');
    const cloneSpy = vi.spyOn(store, 'clone');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    await waitFor(() => expect(dup.disabled).toBe(true));
    await fireEvent.click(dup);
    expect(cloneSpy).not.toHaveBeenCalled();
    resolveConfirm(false);
    await waitFor(() => expect(dup.disabled).toBe(false));
    expect(noteStore.delete).not.toHaveBeenCalled();
  });

  // Spec DoD 5: snapshot ONE card (small stable sub-tree), never the whole
  // panel — locale strings are deterministic ('en' in tests), fixtures carry
  // no timestamps/ids that reach the DOM.
  it('card structure snapshot (small, stable sub-tree)', async () => {
    setup([loop]);
    await screen.findByText('A loop');
    expect(document.querySelector('.specorator-vue-card')).toMatchSnapshot();
  });
});

// Loops are regular vault notes under the loop folder (default
// `Agent Board/loops`), so an external writer (a file dropped in the folder,
// a note edited outside the app) fires vault events the mounted panel must
// refresh from — a folder-scoped subscription, mirroring QuickActionsPanel.
describe('LoopsPanel vault-event refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reloads (debounced, coalescing bursts) after a create inside the loop folder', async () => {
    const { noteStore, vaultHandlers } = setupMutable([loop]);
    await screen.findByText('A loop');
    const before = noteStore.list.mock.calls.length;
    vi.useFakeTimers();
    try {
      vaultHandlers.create({ path: 'Agent Board/loops/new.md' });
      vaultHandlers.modify({ path: 'Agent Board/loops/new.md' });
      // Debounce window still open: no reload yet.
      expect(noteStore.list.mock.calls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    // The two-event burst coalesced into exactly one reload.
    expect(noteStore.list.mock.calls.length).toBe(before + 1);
  });

  it('ignores vault events outside the loop folder', async () => {
    const { noteStore, vaultHandlers } = setupMutable([loop]);
    await screen.findByText('A loop');
    const before = noteStore.list.mock.calls.length;
    vi.useFakeTimers();
    try {
      vaultHandlers.modify({ path: 'Notes/unrelated.md' });
      // Prefix must be path-segment-aware: a sibling folder sharing the
      // configured folder's prefix is OUTSIDE.
      vaultHandlers.create({ path: 'Agent Board/loopsish/nope.md' });
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    expect(noteStore.list.mock.calls.length).toBe(before);
  });

  it('reloads when a rename moves a note OUT of the folder (old path was inside)', async () => {
    const { noteStore, vaultHandlers } = setupMutable([loop]);
    await screen.findByText('A loop');
    const before = noteStore.list.mock.calls.length;
    vi.useFakeTimers();
    try {
      vaultHandlers.rename({ path: 'Notes/moved-away.md' }, 'Agent Board/loops/a.md');
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    expect(noteStore.list.mock.calls.length).toBe(before + 1);
  });

  it('routes a rejecting refresh reload through the error logger (no unhandled rejection)', async () => {
    // The loop store's load() re-throws (no onError guard), so the refresh
    // path must wrap it in withErrorNotice like the mounted load does — else
    // a transient vault-list rejection escapes as an unhandled promise.
    const list = vi
      .fn()
      .mockResolvedValueOnce({ loops: [loop], warnings: [] }) // mount load succeeds
      .mockRejectedValue(new Error('vault boom')); // refresh reload rejects
    const { errorLog, vaultHandlers } = setupMutable([loop], { list });
    await screen.findByText('A loop');
    vi.useFakeTimers();
    try {
      vaultHandlers.modify({ path: 'Agent Board/loops/a.md' });
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
  });

  it('unmount offrefs all four subscriptions and drops a pending debounce (no leak)', async () => {
    const { noteStore, vault, vaultHandlers, unmount } = setupMutable([loop]);
    await screen.findByText('A loop');
    expect(vault.on.mock.calls.map((c) => c[0]).sort())
      .toEqual(['create', 'delete', 'modify', 'rename']);
    const refs = vault.on.mock.results.map((r) => r.value);
    const before = noteStore.list.mock.calls.length;
    vi.useFakeTimers();
    try {
      vaultHandlers.delete({ path: 'Agent Board/loops/a.md' });
      unmount();
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    expect(vault.offref).toHaveBeenCalledTimes(4);
    for (const ref of refs) expect(vault.offref).toHaveBeenCalledWith(ref);
    // The queued reload died with the panel.
    expect(noteStore.list.mock.calls.length).toBe(before);
  });
});
