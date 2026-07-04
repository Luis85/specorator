import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { Notice } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';
import SkillsPanel from '@/features/library/vue/panels/SkillsPanel.vue';
import { useSkillLibraryStore } from '@/features/library/vue/stores/skillLibraryStore';
import { skillTemplate } from '@/features/skills/skillCloning';

vi.mock('@/features/quickActions/skills/runVaultSkill', () => ({ runVaultSkill: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/skills/view/SkillEditorModal', () => ({
  // Function expression: tinyspy constructs the implementation with `new`,
  // and arrows are not constructible.
  SkillEditorModal: vi.fn(function () {
    return { open: vi.fn() };
  }),
}));
vi.mock('@/shared/modals/PromptModal', () => ({ promptReason: vi.fn() }));
vi.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmDelete: vi.fn(),
}));
import { runVaultSkill } from '@/features/quickActions/skills/runVaultSkill';
import { SkillEditorModal } from '@/features/skills/view/SkillEditorModal';
import { confirm } from '@/shared/modals/ConfirmModal';
import { promptReason } from '@/shared/modals/PromptModal';

const entry = {
  id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Vault',
  name: 'a-skill', description: 'does a', insertPrefix: '$' as const,
  sourceFilePath: '.claude/skills/a/SKILL.md', providerEnabled: true,
};

function makePlugin() {
  return {
    app: {},
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([entry]) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue('---\ntags: [t1]\n---\n'),
      stat: vi.fn().mockResolvedValue({ mtime: 1 }),
    },
    events: { emit: vi.fn() },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('SkillsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('renders skill rows with provider chip and tags', async () => {
    const plugin = makePlugin();
    useSkillLibraryStore().init(plugin);
    render(SkillsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    expect(await screen.findByText('a-skill')).toBeTruthy();
    // Provider name + tags also appear as toolbar filter chips — scope to the card.
    const card = screen.getByRole('button', { name: 'a-skill' });
    expect(within(card).getByText('Vault')).toBeTruthy();
    expect(within(card).getByText('t1')).toBeTruthy();
  });

  it('Prompt routes through runVaultSkill with the source entry', async () => {
    const plugin = makePlugin();
    useSkillLibraryStore().init(plugin);
    render(SkillsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(runVaultSkill).toHaveBeenCalledWith(plugin, expect.objectContaining({ id: 'claude:skill-a' }), null);
  });
});

/** Mutation flows need a fuller adapter fake (write/exists) than the render-only setup. */
function setupMutable(entries: unknown[], opts: { listAll?: ReturnType<typeof vi.fn> } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const errorLog = vi.fn();
  const plugin = {
    // vault present (adapter-less): host-absolute skill paths resolve to null
    // (out-of-vault) instead of throwing inside resolveSkillVaultPath.
    app: { vault: {} },
    vaultSkillAggregator: { listAll: opts.listAll ?? vi.fn().mockResolvedValue(entries) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue('---\ntags: [t1]\n---\nbody'),
      stat: vi.fn().mockResolvedValue({ mtime: 1 }),
      write: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      deleteFolderRecursive: vi.fn().mockResolvedValue(undefined),
    },
    events: { emit: vi.fn() },
    logger: { scope: () => ({ error: errorLog, warn: vi.fn() }) },
  } as never;
  const store = useSkillLibraryStore();
  store.init(plugin);
  const utils = render(SkillsPanel, {
    global: { plugins: [pinia], provide: { [PLUGIN_KEY as symbol]: plugin } },
  });
  const p = plugin as {
    vaultSkillAggregator: { listAll: ReturnType<typeof vi.fn> };
    vaultFileAdapter: {
      write: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
      deleteFolderRecursive: ReturnType<typeof vi.fn>;
    };
    events: { emit: ReturnType<typeof vi.fn> };
  };
  return { store, plugin, p, errorLog, ...utils };
}

describe('SkillsPanel mutation flows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Duplicate clones through the store, reloads, and opens the editor on the SYNTHESIZED clone row', async () => {
    const { plugin, p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(p.vaultFileAdapter.write).toHaveBeenCalledWith(
      '.claude/skills/a-skill-copy/SKILL.md', '---\ntags: [t1]\n---\nbody',
    ));
    expect(p.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'claude' });
    // Multi-leaf staleness contract: clone() must reload the shared store.
    await waitFor(() => expect(p.vaultSkillAggregator.listAll.mock.calls.length).toBeGreaterThan(1));
    // The editor must open on the fresh `<slug>-copy` row (folder basename is
    // the display name), NOT the source row — pin every synthesized field.
    await waitFor(() => expect(SkillEditorModal).toHaveBeenCalledWith(
      plugin ? (plugin as { app: unknown }).app : undefined,
      plugin,
      {
        id: 'skill-a-skill-copy',
        name: 'a-skill-copy',
        description: 'does a',
        providerId: 'claude',
        providerDisplayName: 'Vault',
        sourceFilePath: '.claude/skills/a-skill-copy/SKILL.md',
        editable: true,
        tags: ['t1'],
      },
      expect.any(Function),
    ));
  });

  it('New Skill prompts for a name, writes the template, reloads, and opens the editor on the new row', async () => {
    vi.mocked(promptReason).mockResolvedValueOnce('My Skill');
    const { plugin, p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'New Skill' }));
    await waitFor(() => expect(p.vaultFileAdapter.write).toHaveBeenCalledWith(
      '.claude/skills/my-skill/SKILL.md', skillTemplate('My Skill'),
    ));
    expect(p.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'claude' });
    await waitFor(() => expect(p.vaultSkillAggregator.listAll.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(SkillEditorModal).toHaveBeenCalledWith(
      expect.anything(),
      plugin,
      {
        id: 'skill-my-skill',
        name: 'My Skill',
        description: '',
        providerId: 'claude',
        providerDisplayName: 'Vault',
        sourceFilePath: '.claude/skills/my-skill/SKILL.md',
        editable: true,
      },
      expect.any(Function),
    ));
  });

  it('New Skill does nothing when the name prompt is cancelled', async () => {
    vi.mocked(promptReason).mockResolvedValueOnce(null);
    const { p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'New Skill' }));
    await waitFor(() => expect(promptReason).toHaveBeenCalled());
    expect(p.vaultFileAdapter.write).not.toHaveBeenCalled();
    expect(SkillEditorModal).not.toHaveBeenCalled();
  });

  it('activating a card opens the editor on that row; onSaved reloads the store', async () => {
    const { p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'a-skill' }));
    expect(SkillEditorModal).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ id: 'claude:skill-a' }), expect.any(Function),
    );
    const onSaved = vi.mocked(SkillEditorModal).mock.calls[0][3] as () => void;
    onSaved();
    // Editor saves must re-derive rows through the shared store, not a local patch.
    await waitFor(() => expect(p.vaultSkillAggregator.listAll.mock.calls.length).toBeGreaterThan(1));
  });

  it('read-only rows show the Read-only chip and no Duplicate button', async () => {
    const readOnly = { ...entry, id: 'opencode:skill-r', name: 'r-skill', sourceFilePath: null };
    setupMutable([readOnly]);
    const card = await screen.findByRole('button', { name: 'r-skill' });
    expect(within(card).getByText('Read-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });

  it('Delete confirms, removes the folder through the store, Notices, and reloads', async () => {
    const { p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(p.vaultFileAdapter.deleteFolderRecursive).toHaveBeenCalledWith('.claude/skills/a'));
    expect(confirm).toHaveBeenCalled();
    expect(p.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'claude' });
    await waitFor(() => expect(Notice).toHaveBeenCalledWith('Deleted a-skill.'));
    // Multi-leaf staleness contract: remove() must reload the shared store.
    await waitFor(() => expect(p.vaultSkillAggregator.listAll.mock.calls.length).toBeGreaterThan(1));
  });

  it('Delete keeps the skill when the confirm is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const { p } = setupMutable([entry]);
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(p.vaultFileAdapter.deleteFolderRecursive).not.toHaveBeenCalled();
  });

  it('vault-rooted Codex rows expose Duplicate and Delete (shared writability gate)', async () => {
    const codexRow = {
      ...entry, id: 'codex:skill-c', name: 'c-skill',
      providerId: 'codex', providerDisplayName: 'Codex',
      sourceFilePath: '.codex/skills/c/SKILL.md',
    };
    setupMutable([codexRow]);
    await screen.findByText('c-skill');
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('non-vault rows (host-absolute source) get no Delete button', async () => {
    const hostAbs = {
      ...entry, id: 'codex:skill-g', name: 'g-skill',
      providerId: 'codex', sourceFilePath: '/home/u/.codex/skills/g/SKILL.md',
    };
    setupMutable([hostAbs]);
    await screen.findByText('g-skill');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('empty state CTA starts the create flow', async () => {
    vi.mocked(promptReason).mockResolvedValueOnce(null);
    setupMutable([]);
    // DOM cycles empty → loading → empty during the mount-time load(); a
    // macrotask tick lets it settle before we grab the CTA.
    await new Promise((r) => setTimeout(r));
    const cta = document.querySelector('.specorator-vue-empty-action');
    expect(cta).toBeTruthy();
    await fireEvent.click(cta as Element);
    await waitFor(() => expect(promptReason).toHaveBeenCalled());
  });

  it('query filters cards (incl. no-matches text) and updated-sort stays stable', async () => {
    const entryB = {
      ...entry, id: 'claude:skill-b', name: 'b-skill', description: 'other',
      sourceFilePath: '.claude/skills/b/SKILL.md',
    };
    setupMutable([entry, entryB]);
    await screen.findByText('a-skill');
    await fireEvent.update(screen.getByRole('combobox'), 'updated');
    await fireEvent.update(screen.getByRole('searchbox'), 'does a');
    expect(screen.getByText('a-skill')).toBeTruthy();
    expect(screen.queryByText('b-skill')).toBeNull();
    await fireEvent.update(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No items match your search.')).toBeTruthy();
  });

  it('surfaces a load failure via the error logger (withErrorNotice path)', async () => {
    const { errorLog } = setupMutable([], { listAll: vi.fn().mockRejectedValue(new Error('boom')) });
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
  });

  // Spec DoD 5: snapshot ONE card (small stable sub-tree), never the whole
  // panel — locale strings are deterministic ('en' in tests), fixtures carry
  // no timestamps/ids that reach the DOM.
  it('card structure snapshot (small, stable sub-tree)', async () => {
    setupMutable([entry]);
    await screen.findByText('a-skill');
    expect(document.querySelector('.specorator-vue-card')).toMatchSnapshot();
  });
});
