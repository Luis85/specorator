import { createMockEl } from '@test/helpers/mockElement';

import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { EventBus } from '@/core/events/EventBus';
import type { Conversation } from '@/core/types/chat';
import { THREADS_PATH } from '@/features/teamChat/TeamChatThreadStore';
import { createTeamChatThreadStore } from '@/features/teamChat/teamChatThreadStoreFactory';

// TeamChatView pulls the real tab engine; stub it so the cross-view sharing
// assertions can construct prototype-only views (mirror of the other view tests).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { TeamChatView } from '@/features/teamChat/TeamChatView';

/**
 * Duck-typed plugin over an in-memory vault, exposing a REAL lazy
 * `getTeamChatThreadStore` built from the factory — mirroring the concrete
 * `SpecoratorPlugin.getTeamChatThreadStore()` `??=` so the single-instance
 * guarantee is genuinely exercised (the concrete plugin class is intentionally
 * not loaded in the unit lane).
 */
function makeHarness() {
  const files = new Map<string, string>();
  const adapter = {
    exists: jest.fn(async (path: string) => files.has(path)),
    read: jest.fn(async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing file: ${path}`);
      return value;
    }),
    writeAtomic: jest.fn(async (path: string, content: string) => { files.set(path, content); }),
  };

  let seq = 0;
  const createConversation = jest.fn(async (options: { boundAgentId?: string }): Promise<Conversation> => ({
    id: `created-${++seq}`,
    providerId: 'claude',
    title: 'DM',
    createdAt: 0,
    updatedAt: 0,
    sessionId: null,
    messages: [],
    boundAgentId: options.boundAgentId,
    surface: 'team-chat',
  }));

  const events = new EventBus<SpecoratorEventMap>();
  const changed = jest.fn();
  events.on('teamChat:threads-changed', changed);

  const plugin: any = {
    vaultFileAdapter: adapter,
    events,
    settings: {},
    // Agent absent → createTeamChatDmConversation skips provider resolution and
    // creates provider-agnostically (keeps this test off the ProviderRegistry).
    agentRosterStore: { get: jest.fn().mockResolvedValue(null) },
    createConversation,
    getConversationSync: jest.fn(() => null),
    findTeamChatConversationForAgent: jest.fn(() => null),
  };
  let shared: ReturnType<typeof createTeamChatThreadStore> | null = null;
  plugin.getTeamChatThreadStore = jest.fn(() => (shared ??= createTeamChatThreadStore(plugin)));

  return { plugin, files, changed, createConversation };
}

function makeView(plugin: unknown): any {
  const view = Object.create(TeamChatView.prototype);
  view.plugin = plugin;
  view.contentEl = createMockEl();
  return view;
}

describe('createTeamChatThreadStore — plugin-scoped wiring (Round-20 Fix A)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wires the plugin deps: creates via plugin.createConversation, persists, and emits', async () => {
    const h = makeHarness();
    const store = createTeamChatThreadStore(h.plugin);

    const id = await store.resolveOrCreate('roster:a');

    expect(h.createConversation).toHaveBeenCalledWith({ boundAgentId: 'roster:a', surface: 'team-chat' });
    expect(JSON.parse(h.files.get(THREADS_PATH) as string)).toEqual({ version: 1, rooms: { 'roster:a': id } });
    expect(h.changed).toHaveBeenCalledTimes(1);
  });
});

describe('TeamChatThreadStore is a single plugin-scoped instance across leaves', () => {
  beforeEach(() => jest.clearAllMocks());

  it('two Team Chat views resolve DMs through ONE shared store instance', () => {
    const { plugin } = makeHarness();
    const viewA = makeView(plugin);
    const viewB = makeView(plugin);

    // Stable per plugin (lazy singleton), delegated by the view, shared by leaves.
    expect(plugin.getTeamChatThreadStore()).toBe(plugin.getTeamChatThreadStore());
    expect(viewA.getThreadStore()).toBe(plugin.getTeamChatThreadStore());
    expect(viewA.getThreadStore()).toBe(viewB.getThreadStore());
  });

  it('a resolve in one leaf does not drop the other leaf\'s mapping (shared cache + serialization)', async () => {
    const { plugin, files } = makeHarness();
    const viewA = makeView(plugin);
    const viewB = makeView(plugin);

    const idA = await viewA.getThreadStore().resolveOrCreate('roster:a');
    const idB = await viewB.getThreadStore().resolveOrCreate('roster:b');

    expect(idA).not.toBe(idB);
    // A per-view store with its own stale cache would have overwritten threads.json
    // and dropped the sibling leaf's write; the single shared instance keeps both.
    expect(JSON.parse(files.get(THREADS_PATH) as string)).toEqual({
      version: 1,
      rooms: { 'roster:a': idA, 'roster:b': idB },
    });
  });
});
