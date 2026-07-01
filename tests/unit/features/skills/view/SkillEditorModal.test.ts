import { Notice } from 'obsidian';

import type { SkillLibraryRow } from '@/features/skills/skillLibraryRows';
import { SkillEditorModal } from '@/features/skills/view/SkillEditorModal';

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
  const plugin = {
    app: { vault: { adapter: { basePath: '/vault' } } },
    events: { emit },
    logger: { scope: () => ({ error: jest.fn() }) },
    vaultFileAdapter: { write, read: jest.fn().mockResolvedValue('# Review\n') },
  } as never;
  return { plugin, write, emit };
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

beforeEach(() => (Notice as jest.Mock).mockClear());

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

  it('does not write when the skill lives outside the vault (home-scope path)', async () => {
    const { plugin, write, emit } = makePlugin();
    const row = makeRow({ sourceFilePath: '/home/me/.codex/skills/review/SKILL.md' });
    const modal = new SkillEditorModal(plugin as never, plugin as never, row, jest.fn());

    await primeAndSave(modal, { tags: 'x' });

    expect(write).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
