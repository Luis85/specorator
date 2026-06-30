import { ProviderRegistry } from '../../../../../src/core/providers/ProviderRegistry';
import { TabProviderCommandCoordinator } from '../../../../../src/features/chat/tabs/TabProviderCommandCoordinator';

// initializeTabService pulls in the full tab-wiring graph; the path under test
// reuses an already-initialized runtime (tab.service set, serviceInitialized
// true), so it never calls this — stub it to keep the import light.
jest.mock('../../../../../src/features/chat/tabs/Tab', () => ({
  initializeTabService: jest.fn(),
}));

jest.spyOn(ProviderRegistry, 'getCapabilities').mockReturnValue(
  { supportsProviderCommands: false } as ReturnType<typeof ProviderRegistry.getCapabilities>,
);

function makeRuntime() {
  return {
    providerId: 'claude' as const,
    isReady: jest.fn().mockReturnValue(true),
    syncConversationState: jest.fn(),
    syncBoundAgentState: jest.fn(),
    ensureReady: jest.fn().mockResolvedValue(undefined),
  };
}

function makeCoordinator(resolveBoundAgent: jest.Mock) {
  const deps = {
    plugin: { resolveBoundAgent } as any,
    getTabs: jest.fn(),
    getActiveTabId: jest.fn(),
    getActiveTab: jest.fn(),
    filterTabsByProvider: jest.fn(),
  };
  return new TabProviderCommandCoordinator(deps as any);
}

function runReady(
  coordinator: TabProviderCommandCoordinator,
  runtime: ReturnType<typeof makeRuntime>,
  conversation: unknown,
): Promise<void> {
  const tab = { service: runtime, serviceInitialized: true } as any;
  const context = { runtime, conversation, externalContextPaths: [], tab, warmupMode: 'runtime' };
  return (coordinator as any).ensureProviderTabRuntimeReady(tab, 'claude', context);
}

describe('TabProviderCommandCoordinator — bound-agent pre-warm sync', () => {
  it('syncs the resolved projection for a bound-agent conversation', async () => {
    const projection = { slug: 'reviewer', prompt: 'You review.', model: 'opus', description: 'Reviews.' };
    const resolveBoundAgent = jest.fn().mockResolvedValue(projection);
    const coordinator = makeCoordinator(resolveBoundAgent);
    const runtime = makeRuntime();

    await runReady(coordinator, runtime, { boundAgentId: 'reviewer' });

    expect(resolveBoundAgent).toHaveBeenCalledWith('reviewer', 'claude');
    expect(runtime.syncBoundAgentState).toHaveBeenCalledWith(projection);
    expect(runtime.ensureReady).toHaveBeenCalled();
  });

  it('clears stale agent state when the conversation has no bound agent', async () => {
    const resolveBoundAgent = jest.fn();
    const coordinator = makeCoordinator(resolveBoundAgent);
    const runtime = makeRuntime();

    // A runtime reused from a prior bound-agent chat must not leak that persona
    // into an unbound conversation: the no-agent path clears the synced state.
    await runReady(coordinator, runtime, { boundAgentId: undefined });

    expect(resolveBoundAgent).not.toHaveBeenCalled();
    expect(runtime.syncBoundAgentState).toHaveBeenCalledWith({});
    expect(runtime.ensureReady).toHaveBeenCalled();
  });

  it('clears agent state when the bound agent no longer resolves', async () => {
    const resolveBoundAgent = jest.fn().mockResolvedValue(null);
    const coordinator = makeCoordinator(resolveBoundAgent);
    const runtime = makeRuntime();

    await runReady(coordinator, runtime, { boundAgentId: 'deleted-agent' });

    expect(runtime.syncBoundAgentState).toHaveBeenCalledWith({});
    expect(runtime.ensureReady).toHaveBeenCalled();
  });
});
