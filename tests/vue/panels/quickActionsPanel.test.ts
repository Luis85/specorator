import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { Notice } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';
import type * as quickActionStorageModule from '@/features/quickActions/QuickActionStorage';
import type { QuickAction } from '@/features/quickActions/types';

interface FakeStorage {
  hasConfiguredFolder: ReturnType<typeof vi.fn>;
  loadAll: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  setFavorite: ReturnType<typeof vi.fn>;
  unsetFavorite: ReturnType<typeof vi.fn>;
  getFilePathForName: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({ instances: [] as unknown[] }));

// The store (and the panel's editor-modal collision probe) construct their own
// QuickActionStorage. Replace the class with a capture-and-stub fake so tests
// pin the storage-call seam; assignNextFavoriteRank stays REAL — the rank rule
// (next free rank, cap of five) is behavior under test.
vi.mock('@/features/quickActions/QuickActionStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof quickActionStorageModule>();
  class FakeQuickActionStorage {
    hasConfiguredFolder = vi.fn().mockReturnValue(true);
    loadAll = vi.fn().mockResolvedValue([]);
    save = vi.fn().mockResolvedValue('Quick Actions/saved.md');
    delete = vi.fn().mockResolvedValue(undefined);
    exists = vi.fn().mockResolvedValue(false);
    setFavorite = vi.fn().mockResolvedValue(undefined);
    unsetFavorite = vi.fn().mockResolvedValue(undefined);
    getFilePathForName = vi.fn((name: string) => `Quick Actions/${name}.md`);
    constructor() {
      h.instances.push(this);
    }
  }
  return { ...actual, QuickActionStorage: FakeQuickActionStorage };
});
vi.mock('@/features/quickActions/runQuickActionForFile', () => ({
  runQuickActionForFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/features/quickActions/ui/QuickActionEditorModal', () => ({
  // Function expression: tinyspy constructs the implementation with `new`,
  // and arrows are not constructible.
  QuickActionEditorModal: vi.fn(function () {
    return { open: vi.fn() };
  }),
}));
vi.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmDelete: vi.fn(),
}));
import QuickActionsPanel from '@/features/library/vue/panels/QuickActionsPanel.vue';
import { useQuickActionStore } from '@/features/library/vue/stores/quickActionStore';
import { runQuickActionForFile } from '@/features/quickActions/runQuickActionForFile';
import { QuickActionEditorModal } from '@/features/quickActions/ui/QuickActionEditorModal';
import { confirm } from '@/shared/modals/ConfirmModal';

const action: QuickAction = {
  id: 'summarize',
  name: 'Summarize',
  description: 'Sum it up',
  icon: 'zap',
  tags: ['writing'],
  prompt: 'p',
  filePath: 'Quick Actions/summarize.md',
};
const fav: QuickAction = {
  ...action,
  id: 'fav',
  name: 'Fav',
  description: 'Starred one',
  filePath: 'Quick Actions/fav.md',
  favorite: true,
  favoriteRank: 1,
};

function noticeTexts(): unknown[] {
  return vi.mocked(Notice).mock.calls.map((c) => c[0]);
}

type VaultHandler = (file: { path?: string }, oldPath?: string) => void;

/** Vault fake capturing the panel's folder-scoped event subscriptions so tests
 * can fire create/modify/delete/rename as an external writer would. */
function makeVaultFake() {
  const handlers: Record<string, VaultHandler> = {};
  return {
    handlers,
    vault: {
      on: vi.fn((name: string, handler: VaultHandler) => {
        handlers[name] = handler;
        return { event: name }; // opaque EventRef token, asserted against offref
      }),
      offref: vi.fn(),
    },
  };
}

function setup(actions: QuickAction[], opts: { folderConfigured?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const errorLog = vi.fn();
  const { vault, handlers } = makeVaultFake();
  // One plugin object for BOTH init() and provide() — the panel re-inits the
  // store with the injected plugin, so they must be the same fake.
  const plugin = {
    app: { vault },
    settings: {},
    storage: { getAdapter: vi.fn(() => ({})) },
    quickActionFavoritesCache: { refresh: vi.fn() },
    logger: { scope: () => ({ error: errorLog, warn: vi.fn() }) },
  };
  const store = useQuickActionStore();
  store.init(plugin as never);
  const storage = h.instances.at(-1) as FakeStorage;
  // Live fixture list: favorite toggles rewrite it so the post-reload
  // favorite-state detection sees what a real frontmatter patch would yield.
  let current = [...actions];
  storage.loadAll.mockImplementation(() => Promise.resolve(current));
  storage.setFavorite.mockImplementation((a: QuickAction, rank: number) => {
    current = current.map((x) =>
      x.filePath === a.filePath ? { ...x, favorite: true, favoriteRank: rank } : x);
    return Promise.resolve();
  });
  storage.unsetFavorite.mockImplementation((a: QuickAction) => {
    current = current.map((x) =>
      x.filePath === a.filePath ? { ...x, favorite: undefined, favoriteRank: undefined } : x);
    return Promise.resolve();
  });
  if (opts.folderConfigured === false) storage.hasConfiguredFolder.mockReturnValue(false);
  const utils = render(QuickActionsPanel, {
    global: { plugins: [pinia], provide: { [PLUGIN_KEY as symbol]: plugin } },
  });
  return { store, plugin, storage, errorLog, vault, vaultHandlers: handlers, ...utils };
}

describe('QuickActionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.instances.length = 0;
  });

  it('renders action cards with description, tag chips, and star state', async () => {
    setup([action, fav]);
    expect(await screen.findByText('Summarize')).toBeTruthy();
    expect(screen.getByText('Sum it up')).toBeTruthy();
    // Tags render in BOTH the toolbar filter chips and the card — scope to the
    // card or getByText throws 'Found multiple elements'.
    const card = screen.getByRole('button', { name: 'Summarize' });
    expect(within(card).getByText('writing')).toBeTruthy();
    const offStar = within(card).getByRole('button', { name: 'Toggle favorite' });
    expect(offStar.getAttribute('aria-pressed')).toBe('false');
    expect(offStar.classList.contains('is-on')).toBe(false);
    const favCard = screen.getByRole('button', { name: 'Fav' });
    const onStar = within(favCard).getByRole('button', { name: 'Toggle favorite' });
    expect(onStar.getAttribute('aria-pressed')).toBe('true');
    expect(onStar.classList.contains('is-on')).toBe(true);
  });

  it('shows the loading indicator only on the first/empty load, never on a background mutation reload', async () => {
    const { store } = setup([action]);
    await screen.findByText('Summarize');
    store.loading = true; // background reload, rows still present
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeNull();
    store.actions = []; // first/empty load
    store.error = null;
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeTruthy();
  });

  it('Run dispatches through runQuickActionForFile with a null file (no pill context)', async () => {
    const { plugin } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(runQuickActionForFile).toHaveBeenCalledWith(
      plugin, null, expect.objectContaining({ id: 'summarize' }),
    ));
  });

  it('Run marks the row busy (all actions disabled + aria-busy), fires ONCE on double-click, re-enables on resolve', async () => {
    let resolveRun!: () => void;
    vi.mocked(runQuickActionForFile).mockReturnValue(
      new Promise<void>((r) => { resolveRun = r; }),
    );
    setup([action]);
    await screen.findByText('Summarize');
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    const edit = screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement;
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    const star = screen.getByRole('button', { name: 'Toggle favorite' }) as HTMLButtonElement;
    await fireEvent.click(run);
    await waitFor(() => expect(run.disabled).toBe(true));
    // One busy bit per row gates ALL of that row's actions, star included.
    expect(edit.disabled).toBe(true);
    expect(dup.disabled).toBe(true);
    expect(del.disabled).toBe(true);
    expect(star.disabled).toBe(true);
    expect(run.getAttribute('aria-busy')).toBe('true');
    const actions = document.querySelector('.specorator-vue-card-actions');
    expect(actions?.classList.contains('is-busy')).toBe(true);
    // A second click during the send must not double-dispatch the prompt.
    await fireEvent.click(run);
    expect(runQuickActionForFile).toHaveBeenCalledTimes(1);
    resolveRun();
    await waitFor(() => expect(run.disabled).toBe(false));
    expect(actions?.classList.contains('is-busy')).toBe(false);
  });

  it('Edit opens the editor modal; its onSave persists via store.save and reloads', async () => {
    const { storage } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(QuickActionEditorModal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'summarize' }),
      expect.any(Function),
      expect.anything(),
    );
    const onSave = vi.mocked(QuickActionEditorModal).mock.calls[0][2] as
      (a: QuickAction) => Promise<void>;
    await onSave({ ...action, description: 'updated' });
    // store.save path: the STORE's storage persists (instance 0), then the
    // shared store reloads so every mounted leaf re-derives.
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ description: 'updated' }));
    await waitFor(() => expect(storage.loadAll.mock.calls.length).toBeGreaterThan(1));
  });

  it('activating a card opens the editor pre-filled with that action', async () => {
    setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Summarize' }));
    expect(QuickActionEditorModal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'summarize' }),
      expect.any(Function),
      expect.anything(),
    );
  });

  it('New action opens the editor for a fresh action', async () => {
    setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'New action' }));
    expect(QuickActionEditorModal).toHaveBeenCalledWith(
      expect.anything(), null, expect.any(Function), expect.anything(),
    );
  });

  it('unconfigured folder: New is disabled and the empty state is a settings nudge without a CTA', async () => {
    setup([], { folderConfigured: false });
    // DOM cycles empty → loading → empty during the mount-time load(); a
    // macrotask tick lets it settle.
    await new Promise((r) => setTimeout(r));
    expect(screen.getByText(/Settings/)).toBeTruthy();
    expect(document.querySelector('.specorator-vue-empty-action')).toBeNull();
    const newBtn = screen.getByRole('button', { name: 'New action' }) as HTMLButtonElement;
    expect(newBtn.disabled).toBe(true);
    expect(QuickActionEditorModal).not.toHaveBeenCalled();
  });

  it('configured-but-empty state offers the New action CTA', async () => {
    setup([]);
    await new Promise((r) => setTimeout(r));
    const cta = document.querySelector('.specorator-vue-empty-action');
    expect(cta).toBeTruthy();
    await fireEvent.click(cta as Element);
    expect(QuickActionEditorModal).toHaveBeenCalledWith(
      expect.anything(), null, expect.any(Function), expect.anything(),
    );
  });

  it('Duplicate clones through the store and reloads', async () => {
    const { storage } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Summarize copy' }),
    ));
    await waitFor(() => expect(storage.loadAll.mock.calls.length).toBeGreaterThan(1));
  });

  it('Delete confirms (naming the note) then removes through the store and reloads', async () => {
    const { storage } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(storage.delete).toHaveBeenCalledWith('Quick Actions/summarize.md'));
    expect(confirm).toHaveBeenCalled();
    // Deleting a quick action deletes one note file — the copy must say so.
    expect(vi.mocked(confirm).mock.calls[0][1]).toContain('and its note');
    await waitFor(() => expect(storage.loadAll.mock.calls.length).toBeGreaterThan(1));
  });

  it('Delete keeps the action when the confirm is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const { storage } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('Delete holds the row busy through the confirm, blocking duplicate-during-delete races', async () => {
    let resolveConfirm!: (ok: boolean) => void;
    vi.mocked(confirm).mockReturnValueOnce(new Promise<boolean>((r) => { resolveConfirm = r; }));
    const { storage } = setup([action]);
    await screen.findByText('Summarize');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    await waitFor(() => expect(dup.disabled).toBe(true));
    await fireEvent.click(dup);
    expect(storage.save).not.toHaveBeenCalled();
    resolveConfirm(false);
    await waitFor(() => expect(dup.disabled).toBe(false));
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('star toggle favorites a non-favorite at the next free rank, without a limit notice', async () => {
    const { storage } = setup([action, fav]);
    await screen.findByText('Summarize');
    const card = screen.getByRole('button', { name: 'Summarize' });
    await fireEvent.click(within(card).getByRole('button', { name: 'Toggle favorite' }));
    // Real assignNextFavoriteRank: rank 1 is taken by fav, next free is 2.
    await waitFor(() => expect(storage.setFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'summarize' }), 2,
    ));
    expect(noticeTexts()).not.toContain('You can favorite up to 5 quick actions');
  });

  it('star toggle unfavorites a favorite', async () => {
    const { storage } = setup([action, fav]);
    await screen.findByText('Fav');
    const favCard = screen.getByRole('button', { name: 'Fav' });
    await fireEvent.click(within(favCard).getByRole('button', { name: 'Toggle favorite' }));
    await waitFor(() => expect(storage.unsetFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fav' }),
    ));
    expect(storage.setFavorite).not.toHaveBeenCalled();
  });

  it('star toggle at the five-favorite cap surfaces the limit notice (store no-ops)', async () => {
    const favorites = [1, 2, 3, 4, 5].map((rank) => ({
      ...action,
      id: `f${rank}`,
      name: `Fav ${rank}`,
      filePath: `Quick Actions/f${rank}.md`,
      favorite: true,
      favoriteRank: rank,
    }));
    const { storage } = setup([...favorites, action]);
    await screen.findByText('Summarize');
    const card = screen.getByRole('button', { name: 'Summarize' });
    await fireEvent.click(within(card).getByRole('button', { name: 'Toggle favorite' }));
    // The store returns nothing today: the panel detects "nothing happened"
    // from the action's favorite state after reload and tells the user.
    await waitFor(() => expect(noticeTexts()).toContain('You can favorite up to 5 quick actions'));
    expect(storage.setFavorite).not.toHaveBeenCalled();
  });

  it('surfaces a load failure as inline error copy (store captures, panel renders)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const plugin = {
      app: { vault: makeVaultFake().vault },
      settings: {},
      storage: { getAdapter: vi.fn(() => ({})) },
      quickActionFavoritesCache: { refresh: vi.fn() },
      logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
    };
    const store = useQuickActionStore();
    store.init(plugin as never);
    const storage = h.instances.at(-1) as FakeStorage;
    storage.loadAll.mockRejectedValue(new Error('boom'));
    // The store captures load failures in `error` rather than throwing, so the
    // panel surfaces them as inline error copy, not a Notice.
    render(QuickActionsPanel, {
      global: { plugins: [pinia], provide: { [PLUGIN_KEY as symbol]: plugin } },
    });
    await waitFor(() => expect(store.error).toBe('boom'));
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });

  // External writers (QuickActionsModal, capture-from-message) persist through
  // their own QuickActionStorage — no store call, no event bus. Quick actions
  // live in a REGULAR vault folder, so vault events fire for them and the
  // mounted panel must refresh from a folder-scoped subscription (the
  // QuickActionFavoritesCache pattern).
  describe('vault-event refresh', () => {
    it('reloads (debounced, coalescing bursts) after a create inside the quick-actions folder', async () => {
      const { storage, vaultHandlers } = setup([action]);
      await screen.findByText('Summarize');
      const before = storage.loadAll.mock.calls.length;
      vi.useFakeTimers();
      try {
        vaultHandlers.create({ path: 'Quick Actions/from-capture.md' });
        vaultHandlers.modify({ path: 'Quick Actions/from-capture.md' });
        // Debounce window still open: no reload yet.
        expect(storage.loadAll.mock.calls.length).toBe(before);
        await vi.advanceTimersByTimeAsync(400);
      } finally {
        vi.useRealTimers();
      }
      // The two-event burst coalesced into exactly one reload.
      expect(storage.loadAll.mock.calls.length).toBe(before + 1);
    });

    it('ignores vault events outside the quick-actions folder', async () => {
      const { storage, vaultHandlers } = setup([action]);
      await screen.findByText('Summarize');
      const before = storage.loadAll.mock.calls.length;
      vi.useFakeTimers();
      try {
        vaultHandlers.modify({ path: 'Notes/unrelated.md' });
        // Prefix must be path-segment-aware: a sibling folder sharing the
        // configured folder's prefix is OUTSIDE.
        vaultHandlers.create({ path: 'Quick Actionsish/nope.md' });
        await vi.advanceTimersByTimeAsync(400);
      } finally {
        vi.useRealTimers();
      }
      expect(storage.loadAll.mock.calls.length).toBe(before);
    });

    it('reloads when a rename moves a note OUT of the folder (old path was inside)', async () => {
      const { storage, vaultHandlers } = setup([action]);
      await screen.findByText('Summarize');
      const before = storage.loadAll.mock.calls.length;
      vi.useFakeTimers();
      try {
        vaultHandlers.rename({ path: 'Notes/moved-away.md' }, 'Quick Actions/summarize.md');
        await vi.advanceTimersByTimeAsync(400);
      } finally {
        vi.useRealTimers();
      }
      expect(storage.loadAll.mock.calls.length).toBe(before + 1);
    });

    it('unmount offrefs all four subscriptions and drops a pending debounce (no leak)', async () => {
      const { storage, vault, vaultHandlers, unmount } = setup([action]);
      await screen.findByText('Summarize');
      expect(vault.on.mock.calls.map((c) => c[0]).sort())
        .toEqual(['create', 'delete', 'modify', 'rename']);
      const refs = vault.on.mock.results.map((r) => r.value);
      const before = storage.loadAll.mock.calls.length;
      vi.useFakeTimers();
      try {
        vaultHandlers.delete({ path: 'Quick Actions/summarize.md' });
        unmount();
        await vi.advanceTimersByTimeAsync(400);
      } finally {
        vi.useRealTimers();
      }
      expect(vault.offref).toHaveBeenCalledTimes(4);
      for (const ref of refs) expect(vault.offref).toHaveBeenCalledWith(ref);
      // The queued reload died with the panel.
      expect(storage.loadAll.mock.calls.length).toBe(before);
    });
  });

  // Spec DoD: snapshot ONE card (small stable sub-tree), never the whole
  // panel — locale strings are deterministic ('en' in tests), fixtures carry
  // no timestamps/ids that reach the DOM.
  it('card structure snapshot (small, stable sub-tree)', async () => {
    setup([action]);
    await screen.findByText('Summarize');
    expect(document.querySelector('.specorator-vue-card')).toMatchSnapshot();
  });
});
