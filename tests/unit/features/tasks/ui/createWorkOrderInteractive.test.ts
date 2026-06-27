import type { TFile } from 'obsidian';

import { buildSelectionSeed, createWorkOrder, createWorkOrderFromSeed } from '@/features/tasks/commands/taskCommands';
import {
  createWorkOrderAndOpenModal,
  createWorkOrderFromCurrentNoteAndOpenModal,
  createWorkOrderFromSelectionAndOpenModal,
} from '@/features/tasks/ui/createWorkOrderInteractive';
import { chooseWorkOrderTemplate } from '@/features/tasks/ui/WorkOrderTemplatePickerModal';
import type SpecoratorPlugin from '@/main';

jest.mock('@/features/tasks/ui/WorkOrderTemplatePickerModal', () => ({
  chooseWorkOrderTemplate: jest.fn(),
}));
jest.mock('@/features/tasks/commands/taskCommands', () => ({
  createWorkOrder: jest.fn(),
  createWorkOrderFromSeed: jest.fn(),
  buildSelectionSeed: jest.fn(),
}));

describe('createWorkOrderAndOpenModal', () => {
  beforeEach(() => {
    (chooseWorkOrderTemplate as jest.Mock).mockReset();
    (createWorkOrder as jest.Mock).mockReset();
    (createWorkOrderFromSeed as jest.Mock).mockReset();
    (buildSelectionSeed as jest.Mock).mockReset();
  });

  it('creates the work order without revealing the note, then opens the modal via the board', async () => {
    const created = { path: 'Agent Board/tasks/task.md' } as TFile;
    (chooseWorkOrderTemplate as jest.Mock).mockResolvedValue({ cancelled: false, template: undefined });
    (createWorkOrder as jest.Mock).mockResolvedValue(created);
    const openWorkOrderInBoard = jest.fn().mockResolvedValue(undefined);
    const plugin = { openWorkOrderInBoard } as unknown as SpecoratorPlugin;
    const source = { path: 'notes/source.md' } as TFile;

    const result = await createWorkOrderAndOpenModal(plugin, source);

    // reveal:'none' is the contract that prevents opening the underlying note.
    expect(createWorkOrder).toHaveBeenCalledWith(
      plugin,
      source,
      expect.objectContaining({ status: 'inbox', reveal: 'none' }),
    );
    expect(openWorkOrderInBoard).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('opens nothing when the template picker is cancelled', async () => {
    (chooseWorkOrderTemplate as jest.Mock).mockResolvedValue({ cancelled: true });
    const openWorkOrderInBoard = jest.fn();
    const plugin = { openWorkOrderInBoard } as unknown as SpecoratorPlugin;

    const result = await createWorkOrderAndOpenModal(plugin, { path: 'x' } as TFile);

    expect(createWorkOrder).not.toHaveBeenCalled();
    expect(openWorkOrderInBoard).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('createWorkOrderFromCurrentNoteAndOpenModal', () => {
  beforeEach(() => {
    (chooseWorkOrderTemplate as jest.Mock).mockReset();
    (createWorkOrder as jest.Mock).mockReset();
  });

  it('creates from the active file with reveal:none and opens the modal', async () => {
    const active = { path: 'notes/active.md' } as TFile;
    const created = { path: 'Agent Board/tasks/t.md' } as TFile;
    (chooseWorkOrderTemplate as jest.Mock).mockResolvedValue({ cancelled: false, template: undefined });
    (createWorkOrder as jest.Mock).mockResolvedValue(created);
    const openWorkOrderInBoard = jest.fn().mockResolvedValue(undefined);
    const plugin = {
      openWorkOrderInBoard,
      app: { workspace: { getActiveFile: () => active } },
    } as unknown as SpecoratorPlugin;

    const result = await createWorkOrderFromCurrentNoteAndOpenModal(plugin);

    expect(createWorkOrder).toHaveBeenCalledWith(
      plugin,
      active,
      expect.objectContaining({ status: 'inbox', reveal: 'none' }),
    );
    expect(openWorkOrderInBoard).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('no active file → no creation, no modal', async () => {
    const openWorkOrderInBoard = jest.fn();
    const plugin = {
      openWorkOrderInBoard,
      app: { workspace: { getActiveFile: () => null } },
    } as unknown as SpecoratorPlugin;

    const result = await createWorkOrderFromCurrentNoteAndOpenModal(plugin);

    expect(createWorkOrder).not.toHaveBeenCalled();
    expect(openWorkOrderInBoard).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('createWorkOrderFromSelectionAndOpenModal', () => {
  beforeEach(() => {
    (chooseWorkOrderTemplate as jest.Mock).mockReset();
    (createWorkOrderFromSeed as jest.Mock).mockReset();
    (buildSelectionSeed as jest.Mock).mockReset();
  });

  it('builds a seed, creates with reveal:none, and opens the modal', async () => {
    const created = { path: 'Agent Board/tasks/sel.md' } as TFile;
    const seed = { title: 'x', status: 'inbox' };
    (buildSelectionSeed as jest.Mock).mockReturnValue(seed);
    (chooseWorkOrderTemplate as jest.Mock).mockResolvedValue({ cancelled: false, template: undefined });
    (createWorkOrderFromSeed as jest.Mock).mockResolvedValue(created);
    const openWorkOrderInBoard = jest.fn().mockResolvedValue(undefined);
    const plugin = {
      openWorkOrderInBoard,
      app: {
        workspace: {
          activeEditor: { editor: { getSelection: () => 'selected text' } },
          getActiveFile: () => ({ path: 'notes/s.md' }),
        },
      },
    } as unknown as SpecoratorPlugin;

    const result = await createWorkOrderFromSelectionAndOpenModal(plugin);

    expect(createWorkOrderFromSeed).toHaveBeenCalledWith(
      plugin,
      seed,
      expect.objectContaining({ reveal: 'none' }),
    );
    expect(openWorkOrderInBoard).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('empty selection → no creation, no modal', async () => {
    const openWorkOrderInBoard = jest.fn();
    const plugin = {
      openWorkOrderInBoard,
      app: {
        workspace: {
          activeEditor: { editor: { getSelection: () => '   ' } },
          getActiveFile: () => null,
        },
      },
    } as unknown as SpecoratorPlugin;

    const result = await createWorkOrderFromSelectionAndOpenModal(plugin);

    expect(createWorkOrderFromSeed).not.toHaveBeenCalled();
    expect(openWorkOrderInBoard).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
