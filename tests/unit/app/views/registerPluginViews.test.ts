import { registerPluginViews } from '@/app/views/registerPluginViews';
import { VIEW_TYPE_SPECORATOR, VIEW_TYPE_SPECORATOR_AGENT_BOARD } from '@/core/types';
import { activateLibrary } from '@/features/library/activateLibrary';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
import { VIEW_TYPE_MARKETPLACE } from '@/features/marketplace/viewType';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import type SpecoratorPlugin from '@/main';

// The ribbon callback goes through the activation seam; stub it so the wiring
// can be asserted without a workspace stack.
jest.mock('@/features/library/activateLibrary', () => ({
  activateLibrary: jest.fn().mockResolvedValue(undefined),
}));

interface RibbonEntry {
  icon: string;
  label: string;
  callback: () => unknown;
}

function createPlugin(): { plugin: SpecoratorPlugin; ribbons: RibbonEntry[] } {
  const ribbons: RibbonEntry[] = [];
  const plugin = {
    registerView: jest.fn(),
    addRibbonIcon: jest.fn((icon: string, label: string, callback: () => unknown) => {
      ribbons.push({ icon, label, callback });
    }),
    addCommand: jest.fn(),
    activateView: jest.fn(),
    activateAgentBoardView: jest.fn(),
  } as unknown as SpecoratorPlugin;
  return { plugin, ribbons };
}

function register(plugin: SpecoratorPlugin): void {
  registerPluginViews({ plugin, taskExecutionSurface: {} as ChatTabExecutionSurface });
}

describe('registerPluginViews', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers the four workspace views', () => {
    const { plugin } = createPlugin();
    register(plugin);
    const types = (plugin.registerView as jest.Mock).mock.calls.map(([type]) => type);
    expect(types).toEqual([
      VIEW_TYPE_SPECORATOR,
      VIEW_TYPE_SPECORATOR_AGENT_BOARD,
      VIEW_TYPE_LIBRARY,
      VIEW_TYPE_MARKETPLACE,
    ]);
  });

  it('registers the ribbons in chat → board → library → marketplace order', () => {
    const { plugin, ribbons } = createPlugin();
    register(plugin);
    expect(ribbons.map((r) => r.icon)).toEqual(['bot', 'kanban-square', 'library-big', 'store']);
    expect(ribbons[2].label).toBe('Open Library');
    expect(ribbons[3].label).toBe('Open Marketplace');
  });

  it('the Library ribbon opens the Library without forcing a tab', () => {
    const { plugin, ribbons } = createPlugin();
    register(plugin);
    ribbons[2].callback();
    expect(activateLibrary).toHaveBeenCalledWith(plugin);
  });

  it('registers no commands — library commands live on the registrar path', () => {
    const { plugin } = createPlugin();
    register(plugin);
    expect(plugin.addCommand).not.toHaveBeenCalled();
  });
});
