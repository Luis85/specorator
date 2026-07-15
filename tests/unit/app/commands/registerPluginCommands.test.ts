import { registerPluginCommands } from '@/app/commands/registerPluginCommands';
import {
  getCommandHotkeys,
  resetCommandHotkeysForTests,
} from '@/core/commands/commandHotkeyRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { activateLibrary } from '@/features/library/activateLibrary';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import type { ChatWorkOrderLinker } from '@/features/tasks/execution/ChatWorkOrderLinker';
import {
  createWorkOrderAndOpenModal,
  createWorkOrderFromCurrentNoteAndOpenModal,
  createWorkOrderFromSelectionAndOpenModal,
} from '@/features/tasks/ui/createWorkOrderInteractive';
import type SpecoratorPlugin from '@/main';

// The create-work-order commands open modals / pickers; stub the module so the
// command wiring can be asserted without the task UI stack.
// The five library commands target the unified Vue Library; stub the activation seam.
jest.mock('@/features/library/activateLibrary', () => ({
  activateLibrary: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/core/providers/ProviderWorkspaceRegistry', () => ({
  ProviderWorkspaceRegistry: {
    openDiagnosticsCaptureFolder: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/features/tasks/ui/createWorkOrderInteractive', () => ({
  createWorkOrderInteractive: jest.fn(),
  createWorkOrderFromCurrentNoteInteractive: jest.fn(),
  createWorkOrderFromSelectionInteractive: jest.fn(),
  createWorkOrderAndOpenModal: jest.fn(),
  createWorkOrderFromCurrentNoteAndOpenModal: jest.fn(),
  createWorkOrderFromSelectionAndOpenModal: jest.fn(),
}));

type AnyCommand = {
  id: string;
  name: string;
  callback?: () => unknown;
  editorCallback?: (...args: unknown[]) => unknown;
  checkCallback?: (checking: boolean) => boolean;
};

function createPlugin(): { plugin: SpecoratorPlugin; commands: AnyCommand[] } {
  const commands: AnyCommand[] = [];
  const plugin = {
    addCommand: jest.fn((cmd: AnyCommand) => {
      commands.push(cmd);
    }),
    logger: { clear: jest.fn() },
    app: {
      workspace: {
        getActiveViewOfType: jest.fn().mockReturnValue(null),
        getLeavesOfType: jest.fn().mockReturnValue([]),
      },
    },
    settings: { maxChatTabs: 3, agentBoardQueueCap: 1 },
    copyDiagnosticLogs: jest.fn(),
  } as unknown as SpecoratorPlugin;
  return { plugin, commands };
}

const EXPECTED_COMMAND_IDS = [
  'open-view',
  'open-agent-board',
  'run-next-ready-work-order',
  'open-library',
  'open-agent-roster',
  'open-skill-library',
  'open-loop-library',
  'open-quick-actions',
  'create-work-order',
  'create-work-order-from-current-note',
  'create-work-order-from-selection',
  'create-work-order-template',
  'install-common-work-order-templates',
  'create-work-order-from-browser-selection',
  'create-work-order-from-chat-conversation',
  'copy-diagnostic-logs',
  'clear-diagnostic-logs',
  'cursor-open-acp-captures',
  'inline-edit',
  'new-tab',
  'new-session',
  'close-current-tab',
];

describe('registerPluginCommands', () => {
  beforeEach(() => {
    resetCommandHotkeysForTests();
  });

  it('registers the expected command ids', () => {
    const { plugin, commands } = createPlugin();
    const taskExecutionSurface = {} as ChatTabExecutionSurface;
    const chatWorkOrderLinker = {} as ChatWorkOrderLinker;

    registerPluginCommands({ plugin, taskExecutionSurface, chatWorkOrderLinker });

    expect(commands.map((c) => c.id)).toEqual(EXPECTED_COMMAND_IDS);
  });

  it('registers a hotkey entry for every command', () => {
    const { plugin } = createPlugin();
    registerPluginCommands({
      plugin,
      taskExecutionSurface: {} as ChatTabExecutionSurface,
      chatWorkOrderLinker: {} as ChatWorkOrderLinker,
    });

    expect(getCommandHotkeys().map((h) => h.commandId)).toEqual(EXPECTED_COMMAND_IDS);
  });

  it('routes the create-work-order commands through the modal-opening helpers (not the note)', () => {
    const { plugin, commands } = createPlugin();
    registerPluginCommands({
      plugin,
      taskExecutionSurface: {} as ChatTabExecutionSurface,
      chatWorkOrderLinker: {} as ChatWorkOrderLinker,
    });

    commands.find((c) => c.id === 'create-work-order')!.callback?.();
    expect(createWorkOrderAndOpenModal).toHaveBeenCalledWith(plugin);

    commands.find((c) => c.id === 'create-work-order-from-current-note')!.callback?.();
    expect(createWorkOrderFromCurrentNoteAndOpenModal).toHaveBeenCalledWith(plugin);

    commands.find((c) => c.id === 'create-work-order-from-selection')!.editorCallback?.();
    expect(createWorkOrderFromSelectionAndOpenModal).toHaveBeenCalledWith(plugin);
  });

  it('routes the five library commands through activateLibrary with their tabs', () => {
    const { plugin, commands } = createPlugin();
    registerPluginCommands({
      plugin,
      taskExecutionSurface: {} as ChatTabExecutionSurface,
      chatWorkOrderLinker: {} as ChatWorkOrderLinker,
    });

    const run = (id: string) => {
      (activateLibrary as jest.Mock).mockClear();
      commands.find((c) => c.id === id)!.callback?.();
    };

    run('open-library');
    expect(activateLibrary).toHaveBeenCalledWith(plugin);
    run('open-agent-roster');
    expect(activateLibrary).toHaveBeenCalledWith(plugin, 'agents');
    run('open-skill-library');
    expect(activateLibrary).toHaveBeenCalledWith(plugin, 'skills');
    run('open-loop-library');
    expect(activateLibrary).toHaveBeenCalledWith(plugin, 'loops');
    run('open-quick-actions');
    expect(activateLibrary).toHaveBeenCalledWith(plugin, 'quick-actions');
  });

  it('clear-diagnostic-logs invokes plugin.logger.clear', () => {
    const { plugin, commands } = createPlugin();
    registerPluginCommands({
      plugin,
      taskExecutionSurface: {} as ChatTabExecutionSurface,
      chatWorkOrderLinker: {} as ChatWorkOrderLinker,
    });
    const cmd = commands.find((c) => c.id === 'clear-diagnostic-logs')!;
    cmd.callback?.();
    expect((plugin.logger.clear as jest.Mock)).toHaveBeenCalled();
  });

  it('cursor-open-acp-captures routes through ProviderWorkspaceRegistry, not a direct provider import', () => {
    const { plugin, commands } = createPlugin();
    registerPluginCommands({
      plugin,
      taskExecutionSurface: {} as ChatTabExecutionSurface,
      chatWorkOrderLinker: {} as ChatWorkOrderLinker,
    });
    const cmd = commands.find((c) => c.id === 'cursor-open-acp-captures')!;
    cmd.callback?.();
    expect(ProviderWorkspaceRegistry.openDiagnosticsCaptureFolder).toHaveBeenCalledWith('cursor');
  });
});
