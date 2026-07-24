/**
 * @jest-environment jsdom
 */
import '../../../../../../tests/setup/obsidianDom';

import type { RosterAgent } from '../../../../../../src/features/agents/roster/rosterTypes';
import { AgentDetailEditor } from '../../../../../../src/features/agents/roster/view/AgentDetailEditor';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../../../../src/features/agents/agentAvatar', () => ({
  renderAgentAvatar: jest.fn(),
}));

jest.mock('../../../../../../src/features/agents/personaRegistry', () => ({
  rosterAgentToPersona: jest.fn().mockReturnValue({ name: 'T' }),
}));

jest.mock('../../../../../../src/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getEnabledProviderIds: jest.fn().mockReturnValue(['claude']),
    getChatUIConfig: jest.fn().mockReturnValue({ getModelOptions: jest.fn().mockReturnValue([]) }),
  },
}));

jest.mock('../../../../../../src/core/types/settings', () => ({
  asSettingsBag: (s: unknown) => s,
}));

jest.mock('../../../../../../src/features/agents/roster/view/CapabilityPicker', () => ({
  renderCapabilityPicker: jest.fn(),
}));

import { renderCapabilityPicker } from '../../../../../../src/features/agents/roster/view/CapabilityPicker';

const confirmMock = jest.fn().mockResolvedValue(false);
jest.mock('../../../../../../src/shared/modals/ConfirmModal', () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:agent-a',
    name: 'Agent Alpha',
    description: 'Does alpha things.',
    prompt: 'You are Alpha.',
    disallowedTools: [],
    skills: [],
    roles: ['worker'],
    tags: [],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makePlugin() {
  return {
    app: {},
    settings: {},
    agentRosterStore: { save: jest.fn().mockResolvedValue(undefined) },
    vaultSkillAggregator: { listAll: jest.fn().mockResolvedValue([]) },
  } as any;
}

function makeCallbacks() {
  return {
    onBack: jest.fn(),
    onStartChat: jest.fn(),
    onDeleted: jest.fn(),
    onSaved: jest.fn(),
  };
}

async function renderEditor(agent: RosterAgent, opts?: { isNew?: boolean }) {
  const plugin = makePlugin();
  const callbacks = makeCallbacks();
  const editor = new AgentDetailEditor(plugin, callbacks);
  const root = document.createElement('div');
  await editor.render(root, agent, opts);
  return { plugin, callbacks, editor, root };
}

function typeName(root: HTMLElement, value: string): void {
  const nameEl = root.querySelector('.specorator-roster-detail-name') as HTMLInputElement;
  nameEl.value = value;
  nameEl.dispatchEvent(new Event('input'));
}

function saveButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector('.specorator-roster-detail-footer .mod-cta') as HTMLButtonElement;
}

function deleteButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector('.specorator-roster-detail-footer .specorator-library-card-delete') as HTMLButtonElement;
}

function startChatButton(root: HTMLElement): HTMLButtonElement {
  const buttons = root.querySelectorAll('.specorator-roster-detail-footer button');
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(false);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentDetailEditor dirty state', () => {
  it('isDirty() is false after render and true once a field diverges', async () => {
    const { editor, root } = await renderEditor(makeAgent());
    expect(editor.isDirty()).toBe(false);
    typeName(root, 'Agent Alpha renamed');
    expect(editor.isDirty()).toBe(true);
  });

  it('Back on a clean editor goes straight back without a confirm prompt', async () => {
    const { callbacks, root } = await renderEditor(makeAgent());
    (root.querySelector('.specorator-roster-detail-topbar button') as HTMLButtonElement).click();
    await flush();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('Back on a dirty editor prompts and stays when the confirm declines', async () => {
    const { callbacks, root } = await renderEditor(makeAgent());
    typeName(root, 'Agent Alpha renamed');
    (root.querySelector('.specorator-roster-detail-topbar button') as HTMLButtonElement).click();
    await flush();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(callbacks.onBack).not.toHaveBeenCalled();
  });
});

describe('AgentDetailEditor skills picker', () => {
  it('collapses same-named cross-provider skills into ONE item with a merged badge', async () => {
    const plugin = makePlugin();
    plugin.vaultSkillAggregator.listAll.mockResolvedValue([
      { name: 'brainstorming', description: 'Ideate broadly', providerDisplayName: 'Claude' },
      { name: 'brainstorming', description: 'Ideate (codex copy)', providerDisplayName: 'Codex' },
      { name: 'pdf-extract', description: 'Extract text', providerDisplayName: 'Claude' },
    ]);
    const pickerMock = renderCapabilityPicker as jest.Mock;
    pickerMock.mockClear();
    const editor = new AgentDetailEditor(plugin, makeCallbacks());
    const root = document.createElement('div');
    await editor.render(root, makeAgent());
    expect(pickerMock).toHaveBeenCalledTimes(1);
    const options = pickerMock.mock.calls[0][1];
    expect(options.items).toEqual([
      // One item per NAME (agent.skills is name-keyed), first entry's
      // description, provider badges merged in listAll order.
      { id: 'brainstorming', name: 'brainstorming', description: 'Ideate broadly', badge: 'Claude, Codex' },
      { id: 'pdf-extract', name: 'pdf-extract', description: 'Extract text', badge: 'Claude' },
    ]);
  });
});

describe('AgentDetailEditor delete button', () => {
  it('footer Delete fires onDeleted with the original agent', async () => {
    const { callbacks, root } = await renderEditor(makeAgent());
    const del = deleteButton(root);
    expect(del).toBeTruthy();
    del.click();
    await flush();
    expect(callbacks.onDeleted).toHaveBeenCalledTimes(1);
    expect(callbacks.onDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'roster:agent-a' }),
    );
  });
});

describe('AgentDetailEditor onSaved callback', () => {
  it('fires after an explicit Save with the persisted agent', async () => {
    const { plugin, callbacks, root } = await renderEditor(makeAgent());
    typeName(root, 'Agent Alpha renamed');
    saveButton(root).click();
    await flush();
    expect(plugin.agentRosterStore.save).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'roster:agent-a', name: 'Agent Alpha renamed' }),
    );
  });

  it('fires on the start-chat auto-save of a dirty draft, alongside onStartChat', async () => {
    const { plugin, callbacks, root } = await renderEditor(makeAgent());
    typeName(root, 'Agent Alpha renamed');
    startChatButton(root).click();
    await flush();
    expect(plugin.agentRosterStore.save).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Agent Alpha renamed' }),
    );
    expect(callbacks.onStartChat).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Agent Alpha renamed' }),
    );
  });

  it('fires on the start-chat auto-save of a NEW agent even when untouched', async () => {
    const { plugin, callbacks, root } = await renderEditor(makeAgent(), { isNew: true });
    startChatButton(root).click();
    await flush();
    expect(plugin.agentRosterStore.save).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
    expect(callbacks.onStartChat).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when starting a chat from a clean existing agent (no persist)', async () => {
    const { plugin, callbacks, root } = await renderEditor(makeAgent());
    startChatButton(root).click();
    await flush();
    expect(plugin.agentRosterStore.save).not.toHaveBeenCalled();
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onStartChat).toHaveBeenCalledTimes(1);
  });
});

describe('AgentDetailEditor voice + emoji fields', () => {
  it('persists an edited voice field', async () => {
    const { editor, callbacks, root } = await renderEditor(makeAgent());
    const voice = root.querySelector('.specorator-roster-voice-input') as HTMLTextAreaElement;
    expect(voice).toBeTruthy();
    voice.value = 'Warm and concise';
    voice.dispatchEvent(new Event('input'));
    expect(editor.isDirty()).toBe(true);
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ voice: 'Warm and concise' }));
  });

  it('persists an edited emoji field', async () => {
    const { editor, callbacks, root } = await renderEditor(makeAgent());
    const emoji = root.querySelector('.specorator-roster-appearance-emoji') as HTMLInputElement;
    expect(emoji).toBeTruthy();
    emoji.value = '🔬';
    emoji.dispatchEvent(new Event('input'));
    expect(editor.isDirty()).toBe(true);
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ avatarEmoji: '🔬' }));
  });

  it('persists a multi-code-point emoji without truncation', async () => {
    const { callbacks, root } = await renderEditor(makeAgent());
    const emoji = root.querySelector('.specorator-roster-appearance-emoji') as HTMLInputElement;
    emoji.value = '👨‍👩‍👧‍👦';
    emoji.dispatchEvent(new Event('input'));
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ avatarEmoji: '👨‍👩‍👧‍👦' }));
  });
});
