import { Notice } from 'obsidian';

import { runInstructionRefineFlow } from '@/features/chat/controllers/instructionRefineFlow';
import { InstructionModal, type InstructionModalCallbacks } from '@/shared/modals/InstructionConfirmModal';

jest.mock('@/shared/modals/InstructionConfirmModal', () => ({
  InstructionModal: jest.fn(),
}));

const MockModal = InstructionModal as unknown as jest.Mock;

interface CapturedModal {
  callbacks: InstructionModalCallbacks;
  open: jest.Mock;
  showConfirmation: jest.Mock;
  showClarification: jest.Mock;
  showError: jest.Mock;
}

/** Captures the modal instance the flow constructs so a test can drive its callbacks. */
function installModalMock(): { current: CapturedModal | null } {
  const ref: { current: CapturedModal | null } = { current: null };
  MockModal.mockImplementation((_app: unknown, _raw: string, callbacks: InstructionModalCallbacks) => {
    const instance: CapturedModal = {
      callbacks,
      open: jest.fn(),
      showConfirmation: jest.fn(),
      showClarification: jest.fn(),
      showError: jest.fn(),
    };
    ref.current = instance;
    return instance;
  });
  return ref;
}

function createRefineService(overrides: Record<string, jest.Mock> = {}) {
  return {
    refineInstruction: jest.fn().mockResolvedValue({ success: true, refinedInstruction: 'refined' }),
    continueConversation: jest.fn(),
    resetConversation: jest.fn(),
    cancel: jest.fn(),
    setModelOverride: jest.fn(),
    ...overrides,
  };
}

function createPlugin(systemPrompt = '') {
  return {
    app: {},
    settings: { systemPrompt },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runInstructionRefineFlow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('syncs the auxiliary-model override and refines against the current system prompt', async () => {
    installModalMock();
    const refine = createRefineService();

    await runInstructionRefineFlow('add logging', {
      plugin: createPlugin('existing prompt') as any,
      instructionRefineService: refine as any,
      instructionModeManager: null,
      getAuxiliaryModel: () => 'opencode:openai/gpt-5.4',
    });

    expect(refine.setModelOverride).toHaveBeenCalledWith('opencode:openai/gpt-5.4');
    expect(refine.resetConversation).toHaveBeenCalled();
    expect(refine.refineInstruction).toHaveBeenCalledWith('add logging', 'existing prompt');
  });

  it('shows the refined instruction for confirmation on success', async () => {
    const ref = installModalMock();
    const refine = createRefineService({
      refineInstruction: jest.fn().mockResolvedValue({ success: true, refinedInstruction: 'refined text' }),
    });

    await runInstructionRefineFlow('x', {
      plugin: createPlugin() as any,
      instructionRefineService: refine as any,
      instructionModeManager: null,
      getAuxiliaryModel: () => null,
    });

    expect(ref.current?.showConfirmation).toHaveBeenCalledWith('refined text');
  });

  it('appends the accepted instruction to the system prompt and persists it', async () => {
    const ref = installModalMock();
    const plugin = createPlugin('');
    const modeManager = { clear: jest.fn() };

    await runInstructionRefineFlow('x', {
      plugin: plugin as any,
      instructionRefineService: createRefineService() as any,
      instructionModeManager: modeManager as any,
      getAuxiliaryModel: () => null,
    });

    // Drive the modal's accept callback (user confirmed the refined instruction).
    ref.current!.callbacks.onAccept('final instruction');
    await flush();

    expect(plugin.settings.systemPrompt).toContain('final instruction');
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(modeManager.clear).toHaveBeenCalled();
    expect(Notice as unknown as jest.Mock).toHaveBeenCalled();
  });

  it('surfaces a refine failure through the modal and clears instruction mode', async () => {
    const ref = installModalMock();
    const modeManager = { clear: jest.fn() };

    await runInstructionRefineFlow('x', {
      plugin: createPlugin() as any,
      instructionRefineService: createRefineService({
        refineInstruction: jest.fn().mockResolvedValue({ success: false, error: 'boom' }),
      }) as any,
      instructionModeManager: modeManager as any,
      getAuxiliaryModel: () => null,
    });

    expect(ref.current?.showError).toHaveBeenCalledWith('boom');
    expect(modeManager.clear).toHaveBeenCalled();
  });
});
