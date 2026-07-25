import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { EventBus } from '@/core/events/EventBus';
import type { ProviderId } from '@/core/providers/types';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { Conversation } from '@/core/types/chat';
import { TeamChatThreadStore, THREADS_PATH } from '@/features/teamChat/TeamChatThreadStore';

const DEFAULT_PROVIDER: ProviderId = 'claude';

function conversationOn(id: string, agentId: string, providerId: ProviderId): Conversation {
  return {
    id,
    providerId,
    title: 'DM',
    createdAt: 0,
    updatedAt: 0,
    sessionId: null,
    messages: [],
    boundAgentId: agentId,
    surface: 'team-chat',
  };
}

function conversation(id: string, agentId: string): Conversation {
  return conversationOn(id, agentId, DEFAULT_PROVIDER);
}

interface HarnessOptions {
  /** Raw content to pre-seed `threads.json` with (e.g. a corrupt or stale map). */
  seedFile?: string;
  /** agentId → orphaned DM that `findAdoptable` should return. */
  adoptable?: Record<string, Conversation>;
  /** Conversations that already exist up front (e.g. a seeded mapped DM). */
  existingConversations?: Conversation[];
  /** agentId → the provider the agent currently resolves to (default 'claude'). */
  expectedProvider?: Record<string, ProviderId>;
}

function makeHarness(options: HarnessOptions = {}) {
  const files = new Map<string, string>();
  if (options.seedFile !== undefined) files.set(THREADS_PATH, options.seedFile);

  // Every conversation that currently "exists", keyed by id — the harness's stand-in
  // for getConversationSync. isConversationUsable reads providerId out of here.
  const conversationsById = new Map<string, Conversation>();
  for (const c of options.existingConversations ?? []) conversationsById.set(c.id, c);
  const adoptableByAgent = new Map<string, Conversation>(Object.entries(options.adoptable ?? {}));
  for (const c of adoptableByAgent.values()) conversationsById.set(c.id, c);
  const expectedByAgent = new Map<string, ProviderId>(Object.entries(options.expectedProvider ?? {}));
  const expectedProviderFor = (agentId: string): ProviderId => expectedByAgent.get(agentId) ?? DEFAULT_PROVIDER;

  // In-memory VaultFileAdapter over a Map, with real async writeAtomic/read/exists.
  // The `await Promise.resolve()` yields hand control back to the event loop mid-op
  // so concurrent resolveOrCreate calls get a genuine interleave window — that is
  // what makes the serialization guard actually load-bearing in the concurrency tests.
  const writeAtomic = jest.fn(async (path: string, content: string) => {
    await Promise.resolve();
    files.set(path, content);
  });
  const adapter = {
    exists: jest.fn(async (path: string) => files.has(path)),
    read: jest.fn(async (path: string) => {
      await Promise.resolve();
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing file: ${path}`);
      return value;
    }),
    writeAtomic,
  } as unknown as VaultFileAdapter;

  let seq = 0;
  // A freshly created team-chat DM is itself adoptable from then on, mirroring
  // production's findTeamChatConversationForAgent (which scans every conversation
  // by boundAgentId + surface). This is what lets a retry after a failed persist
  // adopt the just-created conversation instead of creating a duplicate.
  const createdByAgent = new Map<string, Conversation>();
  const createConversation = jest.fn(async (agentId: string) => {
    await Promise.resolve();
    // Create on the agent's expected provider, mirroring createTeamChatDmConversation
    // (which resolves the same provider before creating on it).
    const created = conversationOn(`created-${++seq}`, agentId, expectedProviderFor(agentId));
    // A freshly created conversation exists from then on.
    conversationsById.set(created.id, created);
    createdByAgent.set(agentId, created);
    return created;
  });

  const events = new EventBus<SpecoratorEventMap>();
  const changed = jest.fn();
  events.on('teamChat:threads-changed', changed);

  const store = new TeamChatThreadStore({
    adapter,
    resolveExpectedProvider: async (agentId: string) => expectedProviderFor(agentId),
    createConversation,
    isConversationUsable: (id: string, expected: ProviderId | undefined) => {
      const c = conversationsById.get(id);
      return c != null && (expected === undefined || c.providerId === expected);
    },
    findAdoptable: (agentId: string, expected: ProviderId | undefined) => {
      const candidate = adoptableByAgent.get(agentId) ?? createdByAgent.get(agentId) ?? null;
      if (!candidate) return null;
      return expected === undefined || candidate.providerId === expected ? candidate : null;
    },
    events,
  });

  return {
    store,
    files,
    writeAtomic,
    createConversation,
    changed,
    events,
    conversationsById,
    readThreads: (): { version: number; rooms: Record<string, string> } | null => {
      const raw = files.get(THREADS_PATH);
      return raw ? (JSON.parse(raw) as { version: number; rooms: Record<string, string> }) : null;
    },
  };
}

describe('TeamChatThreadStore', () => {
  it('creates once, persists the mapping, emits, and returns the id on an empty store', async () => {
    const h = makeHarness();

    const id = await h.store.resolveOrCreate('roster:a');

    expect(h.createConversation).toHaveBeenCalledTimes(1);
    expect(h.createConversation).toHaveBeenCalledWith('roster:a');
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    expect(h.changed).toHaveBeenCalledTimes(1);
  });

  it('returns the cached id without re-creating or re-writing when the mapping still exists', async () => {
    const h = makeHarness();
    const first = await h.store.resolveOrCreate('roster:a');
    expect(h.writeAtomic).toHaveBeenCalledTimes(1);
    h.changed.mockClear();

    const second = await h.store.resolveOrCreate('roster:a');

    expect(second).toBe(first);
    expect(h.createConversation).toHaveBeenCalledTimes(1);
    expect(h.writeAtomic).toHaveBeenCalledTimes(1);
    expect(h.changed).not.toHaveBeenCalled();
  });

  it('remaps to a fresh conversation when the stored id no longer exists and nothing is adoptable', async () => {
    const h = makeHarness({
      seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'stale-id' } }),
    });

    const id = await h.store.resolveOrCreate('roster:a');

    expect(id).not.toBe('stale-id');
    expect(h.createConversation).toHaveBeenCalledTimes(1);
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
  });

  it('adopts an orphaned team-chat DM instead of creating when there is no mapping', async () => {
    const orphan = conversation('orphan-1', 'roster:a');
    const h = makeHarness({ adoptable: { 'roster:a': orphan } });

    const id = await h.store.resolveOrCreate('roster:a');

    expect(id).toBe('orphan-1');
    expect(h.createConversation).not.toHaveBeenCalled();
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': 'orphan-1' } });
    expect(h.changed).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent same-agent calls into exactly one create', async () => {
    const h = makeHarness();

    const [a, b] = await Promise.all([
      h.store.resolveOrCreate('roster:a'),
      h.store.resolveOrCreate('roster:a'),
    ]);

    expect(a).toBe(b);
    expect(h.createConversation).toHaveBeenCalledTimes(1);
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': a } });
  });

  it('persists both keys for concurrent different-agent calls (no lost write)', async () => {
    const h = makeHarness();

    const [a, b] = await Promise.all([
      h.store.resolveOrCreate('roster:a'),
      h.store.resolveOrCreate('roster:b'),
    ]);

    expect(a).not.toBe(b);
    expect(h.createConversation).toHaveBeenCalledTimes(2);
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': a, 'roster:b': b } });
  });

  it('treats a corrupt or absent threads.json as empty without throwing', async () => {
    const corrupt = makeHarness({ seedFile: '{ this is not valid json' });
    const id = await corrupt.store.resolveOrCreate('roster:a');
    expect(id).toBeTruthy();
    expect(corrupt.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });

    // Absent file: a read-only `get` returns null rather than throwing.
    const absent = makeHarness();
    await expect(absent.store.get('roster:zzz')).resolves.toBeNull();
  });

  it('re-persists and re-emits on retry after writeAtomic fails (no stale disk state)', async () => {
    const h = makeHarness();
    h.writeAtomic.mockRejectedValueOnce(new Error('transient vault io'));

    // First attempt: the conversation is created but the durable write rejects, so
    // the call rejects and — crucially — nothing is cached, persisted, or emitted.
    await expect(h.store.resolveOrCreate('roster:a')).rejects.toThrow('transient vault io');
    expect(h.readThreads()).toBeNull(); // threads.json was never written
    expect(h.changed).not.toHaveBeenCalled(); // no emit for a write that didn't land

    // Retry: because the cache was NOT mutated on failure, the retry re-resolves,
    // adopts the orphaned just-created conversation (no duplicate create), and this
    // time persists + emits. The pre-fix bug left the cache mapped so the retry
    // returned a "recovered" id while threads.json stayed empty.
    const id = await h.store.resolveOrCreate('roster:a');
    expect(h.createConversation).toHaveBeenCalledTimes(1); // adopted, not re-created
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    expect(h.changed).toHaveBeenCalledTimes(1);
  });

  it('commits the mapping to the cache before emitting, so a subscriber reading during the event sees it', async () => {
    const h = makeHarness();
    // Capture the read a subscriber issues the moment it is notified. `get`'s
    // loadRooms reads `this.rooms` synchronously (no await before the cache
    // check), so this promise reflects the cache state AT emit time — which must
    // already hold the new mapping, not the stale one.
    let readDuringEvent: Promise<string | null> | null = null;
    h.events.on('teamChat:threads-changed', () => {
      readDuringEvent = h.store.get('roster:a');
    });

    const id = await h.store.resolveOrCreate('roster:a');

    expect(readDuringEvent).not.toBeNull(); // the change event actually fired
    await expect(readDuringEvent).resolves.toBe(id); // not null / not a prior value
  });

  describe('provider-change rotation (spec §4)', () => {
    it('rotates a mapped DM to a fresh conversation on the new provider when the agent changed providers', async () => {
      // The mapped DM lives on 'claude', but the agent now resolves to 'codex'. Its
      // OLD DM is still adoptable (same boundAgentId) — the trap the scoping guards.
      const stale = conversationOn('convo-claude', 'roster:a', 'claude');
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'convo-claude' } }),
        existingConversations: [stale],
        adoptable: { 'roster:a': stale },
        expectedProvider: { 'roster:a': 'codex' },
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).not.toBe('convo-claude'); // did NOT return the old-provider DM
      expect(h.createConversation).toHaveBeenCalledTimes(1); // adoption rejected the stale one
      expect(h.conversationsById.get(id)?.providerId).toBe('codex'); // fresh, on the new provider
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } }); // remapped + persisted
      expect(h.changed).toHaveBeenCalledTimes(1); // emitted after the swap
    });

    it('reuses the mapped DM without rewrite when it already runs on the expected provider (no-op)', async () => {
      const mapped = conversationOn('convo-codex', 'roster:a', 'codex');
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'convo-codex' } }),
        existingConversations: [mapped],
        expectedProvider: { 'roster:a': 'codex' },
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).toBe('convo-codex'); // provider matches → reuse, not rotate
      expect(h.createConversation).not.toHaveBeenCalled();
      expect(h.writeAtomic).not.toHaveBeenCalled(); // pure cache-hit, no re-persist
      expect(h.changed).not.toHaveBeenCalled(); // no emit on reuse
    });

    it('does not adopt an orphan on the wrong provider — creates a fresh DM on the expected provider', async () => {
      const wrongProviderOrphan = conversationOn('orphan-claude', 'roster:a', 'claude');
      const h = makeHarness({
        adoptable: { 'roster:a': wrongProviderOrphan },
        expectedProvider: { 'roster:a': 'codex' },
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).not.toBe('orphan-claude'); // provider mismatch → not adopted
      expect(h.createConversation).toHaveBeenCalledTimes(1);
      expect(h.conversationsById.get(id)?.providerId).toBe('codex');
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    });

    it('adopts an orphan already on the expected provider', async () => {
      const rightProviderOrphan = conversationOn('orphan-codex', 'roster:a', 'codex');
      const h = makeHarness({
        adoptable: { 'roster:a': rightProviderOrphan },
        expectedProvider: { 'roster:a': 'codex' },
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).toBe('orphan-codex'); // provider matches → adopt, don't create
      expect(h.createConversation).not.toHaveBeenCalled();
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': 'orphan-codex' } });
      expect(h.changed).toHaveBeenCalledTimes(1);
    });
  });
});
