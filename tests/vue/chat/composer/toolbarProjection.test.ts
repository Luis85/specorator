import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TabComposerProjection } from '@/features/chat/tabs/tabComposer';
import {
  getProviderMcpManager,
  getTabCapabilities,
  getTabChatUIConfig,
  getTabPermissionMode,
} from '@/features/chat/tabs/tabShared';
import { getComposerToolbarSettings } from '@/features/chat/tabs/tabUi';
import type { TabData } from '@/features/chat/tabs/types';
import type { ComposerSnapshot } from '@/features/chat/ui/vue/composer/composerCallbacks';
import type SpecoratorPlugin from '@/main';

// buildToolbar reads its truth from these engine helpers; mock them so the
// projection can be exercised with deterministic config and no registry wiring.
vi.mock('@/features/chat/tabs/tabUi', () => ({ getComposerToolbarSettings: vi.fn() }));
vi.mock('@/features/chat/tabs/tabModelPolicy', () => ({ getBlankTabModelOptions: vi.fn(() => []) }));
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: vi.fn(() => 'normal'),
  getTabCapabilities: vi.fn(),
  getTabChatUIConfig: vi.fn(),
  getProviderMcpManager: vi.fn(() => null),
}));

function baseSettings() {
  return { model: 'm1', thinkingBudget: 'off', effortLevel: 'high', serviceTier: 'standard', permissionMode: 'normal' } as Record<string, unknown> & {
    model: string; thinkingBudget: string; effortLevel: string; serviceTier: string; permissionMode: string;
  };
}

function baseCaps() {
  return { providerId: 'claude', reasoningControl: 'token-budget', supportsPlanMode: true, supportsMcpTools: false };
}

function baseUiConfig(): Record<string, unknown> {
  return {
    getModelOptions: () => [
      { value: 'm1', label: 'Model One', group: 'Anthropic' },
      { value: 'm2', label: 'Model Two' },
    ],
    getReasoningOptions: () => [],
    getDefaultReasoningValue: () => 'off',
    isAdaptiveReasoningModel: () => false,
  };
}

function makePlugin(): SpecoratorPlugin {
  return { settings: {}, getActiveEnvironmentVariables: () => '' } as unknown as SpecoratorPlugin;
}

function makeTab(overrides: Partial<{ usage: unknown; ui: Record<string, unknown> }> = {}): TabData {
  return {
    conversationId: 'c1',
    lifecycleState: 'active',
    state: { isStreaming: false, usage: overrides.usage },
    dom: { inputEl: { value: '' } },
    ui: {
      instructionModeManager: { isActive: () => false },
      bangBashModeManager: { isActive: () => false },
      ...overrides.ui,
    },
  } as unknown as TabData;
}

function firstSnapshot(tab: TabData): ComposerSnapshot {
  let snap: ComposerSnapshot | null = null;
  new TabComposerProjection(tab, makePlugin()).subscribe((s) => (snap = s));
  return snap!;
}

function setUiConfig(config: Record<string, unknown>): void {
  vi.mocked(getTabChatUIConfig).mockReturnValue(config as never);
}

describe('TabComposerProjection.buildToolbar', () => {
  beforeEach(() => {
    vi.mocked(getTabPermissionMode).mockReturnValue('normal');
    vi.mocked(getComposerToolbarSettings).mockReturnValue(baseSettings() as never);
    vi.mocked(getTabCapabilities).mockReturnValue(baseCaps() as never);
    vi.mocked(getProviderMcpManager).mockReturnValue(null as never);
    setUiConfig(baseUiConfig());
  });

  it('projects the model label from the active model option', () => {
    expect(firstSnapshot(makeTab()).toolbar.modelLabel).toBe('Model One');
  });

  it('falls back to the raw model id when no option matches', () => {
    vi.mocked(getComposerToolbarSettings).mockReturnValue({ ...baseSettings(), model: 'unknown' } as never);
    expect(firstSnapshot(makeTab()).toolbar.modelLabel).toBe('unknown');
  });

  it('leaves mode null unless there are exactly two options', () => {
    setUiConfig({ ...baseUiConfig(), getModeSelector: () => ({ label: 'M', value: 'a', options: [{ value: 'a', label: 'A' }] }) });
    expect(firstSnapshot(makeTab()).toolbar.mode).toBeNull();

    setUiConfig({
      ...baseUiConfig(),
      getModeSelector: () => ({ label: 'M', value: 'a', activeValue: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
    });
    expect(firstSnapshot(makeTab()).toolbar.mode).not.toBeNull();
  });

  it('projects EXACTLY the effort control for an adaptive model', () => {
    setUiConfig({
      ...baseUiConfig(),
      getReasoningOptions: () => [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
      getDefaultReasoningValue: () => 'high',
      isAdaptiveReasoningModel: () => true,
    });
    const reasoning = firstSnapshot(makeTab()).toolbar.reasoning!;
    expect(reasoning.effort).not.toBeNull();
    expect(reasoning.budget).toBeNull();
    expect(reasoning.effort!.current).toBe('High');
  });

  it('projects EXACTLY the budget control for a non-adaptive model', () => {
    setUiConfig({
      ...baseUiConfig(),
      getReasoningOptions: () => [{ value: 'off', label: 'Off' }, { value: 'max', label: 'Max' }],
      getDefaultReasoningValue: () => 'off',
      isAdaptiveReasoningModel: () => false,
    });
    const reasoning = firstSnapshot(makeTab()).toolbar.reasoning!;
    expect(reasoning.budget).not.toBeNull();
    expect(reasoning.effort).toBeNull();
  });

  it('hides reasoning when options are empty or a lone default', () => {
    setUiConfig({ ...baseUiConfig(), getReasoningOptions: () => [] });
    expect(firstSnapshot(makeTab()).toolbar.reasoning).toBeNull();

    setUiConfig({
      ...baseUiConfig(),
      getReasoningOptions: () => [{ value: 'off', label: 'Off' }],
      getDefaultReasoningValue: () => 'off',
    });
    expect(firstSnapshot(makeTab()).toolbar.reasoning).toBeNull();
  });

  it('hides reasoning entirely when reasoningControl is none', () => {
    vi.mocked(getTabCapabilities).mockReturnValue({ ...baseCaps(), reasoningControl: 'none' } as never);
    setUiConfig({ ...baseUiConfig(), getReasoningOptions: () => [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    expect(firstSnapshot(makeTab()).toolbar.reasoning).toBeNull();
  });

  it('marks the permission toggle plan-active and hides the switch when in plan mode', () => {
    vi.mocked(getComposerToolbarSettings).mockReturnValue({ ...baseSettings(), permissionMode: 'plan' } as never);
    setUiConfig({
      ...baseUiConfig(),
      getPermissionModeToggle: () => ({ activeValue: 'acceptEdits', inactiveValue: 'normal', activeLabel: 'Auto', inactiveLabel: 'Manual', planValue: 'plan', planLabel: 'PLAN' }),
    });
    const toolbar = firstSnapshot(makeTab()).toolbar;
    expect(toolbar.permission!.planActive).toBe(true);
    expect(toolbar.permission!.switchVisible).toBe(false);
    expect(toolbar.planMode.visible).toBe(true);
    expect(toolbar.planMode.active).toBe(true);
  });

  it('gates planMode.visible on plan support', () => {
    vi.mocked(getTabCapabilities).mockReturnValue({ ...baseCaps(), supportsPlanMode: false } as never);
    setUiConfig({
      ...baseUiConfig(),
      getPermissionModeToggle: () => ({ activeValue: 'acceptEdits', inactiveValue: 'normal', activeLabel: 'Auto', inactiveLabel: 'Manual', planValue: 'plan' }),
    });
    expect(firstSnapshot(makeTab()).toolbar.planMode.visible).toBe(false);
  });

  it('projects MCP servers when the provider supports MCP tools', () => {
    vi.mocked(getTabCapabilities).mockReturnValue({ ...baseCaps(), supportsMcpTools: true } as never);
    vi.mocked(getProviderMcpManager).mockReturnValue({
      getServers: () => [{ name: 'srv', enabled: true, contextSaving: false }],
    } as never);
    const tab = makeTab({ ui: { mcpServerSelector: { getEnabledServers: () => new Set(['srv']) } } });
    const mcp = firstSnapshot(tab).toolbar.mcp;
    expect(mcp.visible).toBe(true);
    expect(mcp.count).toBe(1);
    expect(mcp.servers[0]).toMatchObject({ name: 'srv', enabled: true });
  });

  it('hides MCP entirely when the provider does not support MCP tools', () => {
    expect(firstSnapshot(makeTab()).toolbar.mcp.visible).toBe(false);
  });

  it('warns on the usage meter past 80 percent', () => {
    const tab = makeTab({ usage: { contextTokens: 900, contextWindow: 1000, percentage: 90 } });
    const usage = firstSnapshot(tab).toolbar.usage!;
    expect(usage.warning).toBe(true);
    expect(usage.percentage).toBe(90);
  });

  it('omits the usage meter when there are no context tokens', () => {
    const tab = makeTab({ usage: { contextTokens: 0, contextWindow: 1000, percentage: 0 } });
    expect(firstSnapshot(tab).toolbar.usage).toBeNull();
  });
});

// The external-context slice re-projects ONLY from the selector's async onChange
// (mirroring Step 5), never synchronously from the add delegator: openFolderPicker
// resolves on a microtask, so a synchronous emit would carry the stale list.
describe('TabComposerProjection external-context async re-projection', () => {
  beforeEach(() => {
    vi.mocked(getTabPermissionMode).mockReturnValue('normal');
    vi.mocked(getComposerToolbarSettings).mockReturnValue(baseSettings() as never);
    vi.mocked(getTabCapabilities).mockReturnValue(baseCaps() as never);
    vi.mocked(getProviderMcpManager).mockReturnValue(null as never);
    setUiConfig(baseUiConfig());
  });

  function makeAsyncSelector() {
    const paths: string[] = [];
    const persistent = new Set<string>();
    let onChange: () => void = () => {};
    return {
      getExternalContexts: () => [...paths],
      getPersistentPaths: () => [...persistent],
      setOnChange: (cb: () => void) => { onChange = cb; },
      // Appends + fires onChange only AFTER the picker promise resolves.
      openFolderPicker: () => Promise.resolve().then(() => { paths.push('/new/path'); onChange(); }),
      togglePersistence: (p: string) => Promise.resolve().then(() => {
        if (persistent.has(p)) persistent.delete(p); else persistent.add(p);
        onChange();
      }),
    };
  }

  it('re-projects the added path only after the picker resolves', async () => {
    const selector = makeAsyncSelector();
    const tab = makeTab({ ui: { externalContextSelector: selector } });
    const projection = new TabComposerProjection(tab, makePlugin());
    selector.setOnChange(() => projection.emit());

    const snaps: ComposerSnapshot[] = [];
    projection.subscribe((s) => snaps.push(s));

    // Mirror the tabComposerMount delegator: fire the async picker, no sync emit.
    void selector.openFolderPicker();
    const syncPaths = snaps[snaps.length - 1].toolbar.externalContext.items.map((i) => i.path);
    expect(syncPaths).not.toContain('/new/path');

    await flushPromises();
    const asyncItems = snaps[snaps.length - 1].toolbar.externalContext.items;
    expect(asyncItems.map((i) => i.path)).toContain('/new/path');
  });

  it('re-projects the persistence lock state on a persistence toggle', async () => {
    const selector = makeAsyncSelector();
    await selector.openFolderPicker(); // seed one path
    const tab = makeTab({ ui: { externalContextSelector: selector } });
    const projection = new TabComposerProjection(tab, makePlugin());
    selector.setOnChange(() => projection.emit());

    const snaps: ComposerSnapshot[] = [];
    projection.subscribe((s) => snaps.push(s));
    expect(snaps[snaps.length - 1].toolbar.externalContext.items[0].persistent).toBe(false);

    void selector.togglePersistence('/new/path');
    await flushPromises();
    expect(snaps[snaps.length - 1].toolbar.externalContext.items[0].persistent).toBe(true);
  });
});
