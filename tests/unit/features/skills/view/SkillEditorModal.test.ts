import { Notice } from 'obsidian';

import type { SkillLibraryRow } from '@/features/skills/skillLibraryRows';
import { SkillEditorModal } from '@/features/skills/view/SkillEditorModal';

const refreshMock = jest.fn().mockResolvedValue(undefined);
const getCommandCatalogMock = jest.fn((..._a: unknown[]) => ({ refresh: refreshMock }));
jest.mock('@/core/providers/ProviderWorkspaceRegistry', () => ({
  ProviderWorkspaceRegistry: { getCommandCatalog: (...a: unknown[]) => getCommandCatalogMock(...a) },
}));

function makeRow(over: Partial<SkillLibraryRow> = {}): SkillLibraryRow {
  return {
    id: 'codex:review',
    name: 'review',
    description: '',
    providerId: 'codex',
    providerDisplayName: 'Codex',
    // Codex maps SKILL.md paths through toHostPath → `<vault>/.codex/skills/...`.
    sourceFilePath: '/vault/.codex/skills/review/SKILL.md',
    editable: true,
    tags: [],
    ...over,
  };
}

function makePlugin() {
  const write = jest.fn().mockResolvedValue(undefined);
  const emit = jest.fn();
  const warn = jest.fn();
  const plugin = {
    app: { vault: { adapter: { basePath: '/vault' } } },
    events: { emit },
    logger: { scope: () => ({ error: jest.fn(), warn }) },
    vaultFileAdapter: { write, read: jest.fn().mockResolvedValue('# Review\n') },
  } as never;
  return { plugin, write, emit, warn };
}

// save() only reads the field refs and the row/plugin — no DOM render needed.
function primeAndSave(modal: SkillEditorModal, opts: { tags: string; body?: string } = { tags: '' }) {
  const m = modal as unknown as {
    contentArea: { value: string };
    nameEl: { value: string };
    tagsEl: { value: string };
    save: () => Promise<void>;
  };
  m.contentArea = { value: opts.body ?? '# Review\n' };
  m.nameEl = { value: '' }; // fall back to row.name → no rename → write path
  m.tagsEl = { value: opts.tags };
  return m.save();
}

beforeEach(() => {
  (Notice as jest.Mock).mockClear();
  refreshMock.mockClear();
  getCommandCatalogMock.mockClear();
});

describe('SkillEditorModal.save — Codex host-absolute path', () => {
  it('writes to the converted vault-relative path, not the raw host-absolute one', async () => {
    const { plugin, write } = makePlugin();
    const modal = new SkillEditorModal(plugin as never, plugin as never, makeRow(), jest.fn());

    await primeAndSave(modal, { tags: 'alpha, beta' });

    expect(write).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenContent] = write.mock.calls[0];
    expect(writtenPath).toBe('.codex/skills/review/SKILL.md');
    expect(writtenContent).toContain('alpha');
    expect(writtenContent).toContain('beta');
  });

  it('invalidates the OWNING provider bucket (codex), not claude', async () => {
    const { plugin, emit } = makePlugin();
    const modal = new SkillEditorModal(plugin as never, plugin as never, makeRow(), jest.fn());

    await primeAndSave(modal, { tags: 'x' });

    expect(emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'codex' });
  });

  it('force-reloads the owning provider catalog after a direct save (else the stale listing cache would drop a rename)', async () => {
    const { plugin } = makePlugin();
    const modal = new SkillEditorModal(plugin as never, plugin as never, makeRow(), jest.fn());

    await primeAndSave(modal, { tags: 'x' });

    // refresh() invalidates + force-reloads the provider's listing cache (Codex's
    // 5s listSkills TTL) before the re-render re-fetches entries.
    expect(getCommandCatalogMock).toHaveBeenCalledWith('codex');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  // The forced refresh must land BEFORE the event fires: Codex's refresh spawns
  // an ephemeral app-server (slow), and a consumer that reloads on the event (the
  // Library live-refresh, or the aggregator) would otherwise re-fetch the
  // pre-refresh listing and cache it for the TTL. Emitting refresh→emit means the
  // listing is fresh by the time anyone reacts.
  it('forces the provider catalog refresh BEFORE emitting vaultSkill.changed', async () => {
    const { plugin, emit } = makePlugin();
    const order: string[] = [];
    refreshMock.mockImplementationOnce(async () => { order.push('refresh'); });
    emit.mockImplementation((name: string) => { if (name === 'vaultSkill.changed') order.push('emit'); });
    const modal = new SkillEditorModal(plugin as never, plugin as never, makeRow(), jest.fn());

    await primeAndSave(modal, { tags: 'x' });

    expect(order).toEqual(['refresh', 'emit']);
  });

  // Codex's catalog refresh spawns an ephemeral app-server; if the CLI can't
  // start, refresh() rejects AFTER the vault write already landed. The save
  // must still complete (onSaved, saved notice, close) — otherwise the modal
  // stays open on an already-renamed skill and retry mutates the renamed file.
  it('completes the save when the provider catalog refresh rejects after the write landed', async () => {
    const { plugin, write, warn } = makePlugin();
    refreshMock.mockRejectedValueOnce(new Error('codex app-server failed to start'));
    const onSaved = jest.fn();
    const modal = new SkillEditorModal(plugin as never, plugin as never, makeRow(), onSaved);

    await primeAndSave(modal, { tags: 'x' });

    expect(write).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith('Saved review.');
    expect((modal as unknown as { close: jest.Mock }).close).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it('does not write when the skill lives outside the vault (home-scope path)', async () => {
    const { plugin, write, emit } = makePlugin();
    const row = makeRow({ sourceFilePath: '/home/me/.codex/skills/review/SKILL.md' });
    const modal = new SkillEditorModal(plugin as never, plugin as never, row, jest.fn());

    await primeAndSave(modal, { tags: 'x' });

    expect(write).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
