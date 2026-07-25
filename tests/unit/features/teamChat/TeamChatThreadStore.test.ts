import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { EventBus } from '@/core/events/EventBus';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { Conversation } from '@/core/types/chat';
import { TeamChatThreadStore, THREADS_PATH } from '@/features/teamChat/TeamChatThreadStore';

function conversation(id: string, agentId: string): Conversation {
  return {
    id,
    providerId: 'claude',
    title: 'DM',
    createdAt: 0,
    updatedAt: 0,
    sessionId: null,
    messages: [],
    boundAgentId: agentId,
    surface: 'team-chat',
  };
}

interface HarnessOptions {
  /** Raw content to pre-seed `threads.json` with (e.g. a corrupt or stale map). */
  seedFile?: string;
  /** agentId → orphaned DM that `findAdoptable` should return. */
  adoptable?: Record<string, Conversation>;
  /** ids for which `conversationExists` returns true up front. */
  existingIds?: string[];
}

function makeHarness(options: HarnessOptions = {}) {
  const files = new Map<string, string>();
  if (options.seedFile !== undefined) files.set(THREADS_PATH, options.seedFile);

  const existing = new Set<string>(options.existingIds ?? []);
  const adoptable = new Map<string, Conversation>(Object.entries(options.adoptable ?? {}));

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
    const created = conversation(`created-${++seq}`, agentId);
    // A freshly created conversation exists from then on.
    existing.add(created.id);
    createdByAgent.set(agentId, created);
    return created;
  });

  const events = new EventBus<SpecoratorEventMap>();
  const changed = jest.fn();
  events.on('teamChat:threads-changed', changed);

  const store = new TeamChatThreadStore({
    adapter,
    createConversation,
    conversationExists: (id: string) => existing.has(id),
    findAdoptable: (agentId: string) => adoptable.get(agentId) ?? createdByAgent.get(agentId) ?? null,
    events,
  });

  return {
    store,
    files,
    writeAtomic,
    createConversation,
    changed,
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
});
