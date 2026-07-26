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
  const exists = jest.fn(async (path: string) => files.has(path));
  const read = jest.fn(async (path: string) => {
    await Promise.resolve();
    const value = files.get(path);
    if (value === undefined) throw new Error(`missing file: ${path}`);
    return value;
  });
  const adapter = {
    exists,
    read,
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
    isConversationUsable: (id: string, agentId: string, expected: ProviderId | undefined) => {
      const c = conversationsById.get(id);
      return (
        c != null
        && c.surface === 'team-chat'
        && c.boundAgentId === agentId
        && (expected === undefined || c.providerId === expected)
      );
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
    exists,
    read,
    createConversation,
    changed,
    events,
    conversationsById,
    // Re-point an agent at a different provider between resolves, to drive a
    // rotation sequence (e.g. A→B→A) against one live store.
    setExpectedProvider: (agentId: string, provider: ProviderId): void => {
      expectedByAgent.set(agentId, provider);
    },
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

  // Round-65 Fix 2 (DATA-LOSS): only GENUINE absence (exists=false) and a CORRUPT
  // file (JSON.parse throws) may collapse to {}. A real adapter failure (exists()
  // or read() throws) must PROPAGATE — swallowing it caches an empty map, and the
  // next resolveOrCreate rewrites threads.json from `{ …{}, [key]: id }`, DELETING
  // every other agent's DM mapping (same class as Round-63's roster getStrict fix).
  describe('read I/O failure isolation (Round-65 Fix 2)', () => {
    it('returns {} on genuine absence (exists=false) without ever reading', async () => {
      const h = makeHarness(); // no seedFile → exists resolves false
      const id = await h.store.resolveOrCreate('roster:a');
      expect(id).toBeTruthy();
      expect(h.exists).toHaveBeenCalled();
      expect(h.read).not.toHaveBeenCalled(); // absence short-circuits before the read
    });

    it('returns {} on a corrupt/unparseable file (JSON.parse throws), not a propagated error', async () => {
      const h = makeHarness({ seedFile: '{ not valid json' });
      // read SUCCEEDS (file present) but parse throws → treated as empty, no throw.
      const id = await h.store.resolveOrCreate('roster:a');
      expect(id).toBeTruthy();
      expect(h.read).toHaveBeenCalled();
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    });

    it('PROPAGATES when adapter.exists() throws (real I/O failure), never swallowing to {}', async () => {
      const h = makeHarness();
      h.exists.mockRejectedValueOnce(new Error('exists io'));
      await expect(h.store.resolveOrCreate('roster:a')).rejects.toThrow('exists io');
      expect(h.writeAtomic).not.toHaveBeenCalled(); // no empty-map clobbering write
    });

    it('PROPAGATES when adapter.read() throws (real I/O failure), never swallowing to {}', async () => {
      const h = makeHarness({ seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'dm-a' } }) });
      h.read.mockRejectedValueOnce(new Error('read io'));
      await expect(h.store.get('roster:a')).rejects.toThrow('read io');
    });

    it('a failed first read does NOT cache {} and does NOT clobber an existing threads.json', async () => {
      // Other agents' DM mappings are already durable on disk.
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'dm-a', 'roster:b': 'dm-b' } }),
        existingConversations: [
          conversationOn('dm-a', 'roster:a', 'claude'),
          conversationOn('dm-b', 'roster:b', 'claude'),
        ],
      });
      h.read.mockRejectedValueOnce(new Error('transient vault io'));

      // Resolving a THIRD agent while the first read fails must reject AND write nothing —
      // the pre-fix bug cached {} and rewrote threads.json to just { roster:c }, deleting a+b.
      await expect(h.store.resolveOrCreate('roster:c')).rejects.toThrow('transient vault io');
      expect(h.writeAtomic).not.toHaveBeenCalled();
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': 'dm-a', 'roster:b': 'dm-b' } });

      // Retry: loadRooms re-reads (not wedged), sees the real map, adds roster:c, keeps a+b.
      const id = await h.store.resolveOrCreate('roster:c');
      expect(h.readThreads()).toEqual({
        version: 1,
        rooms: { 'roster:a': 'dm-a', 'roster:b': 'dm-b', 'roster:c': id },
      });
    });

    it('re-reads on a later call after a rejected first read (loadRooms is not wedged)', async () => {
      const h = makeHarness({ seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'dm-a' } }) });
      h.read.mockRejectedValueOnce(new Error('io'));

      await expect(h.store.get('roster:a')).rejects.toThrow('io'); // first read rejected
      await expect(h.store.get('roster:a')).resolves.toBe('dm-a'); // re-read, not a cached rejection
      expect(h.read).toHaveBeenCalledTimes(2);
    });
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

  // Round-30 (:105): the stale-mapping (rotation) branch NEVER adopts (Round-26),
  // so a failed persist on the fresh replacement, followed by Round-17's cache
  // rollback, used to create ANOTHER conversation on retry — orphaning the first.
  it('reuses the in-flight replacement across a failed persist in the stale-mapping branch (:105)', async () => {
    const h = makeHarness({
      seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'old-claude' } }),
      existingConversations: [conversationOn('old-claude', 'roster:a', 'claude')],
      expectedProvider: { 'roster:a': 'codex' }, // agent re-pointed → mapped DM is stale (rotation)
    });
    h.writeAtomic.mockRejectedValueOnce(new Error('transient vault io'));

    // First attempt: the stale mapping forces a fresh codex replacement; the write rejects.
    await expect(h.store.resolveOrCreate('roster:a')).rejects.toThrow('transient vault io');
    expect(h.createConversation).toHaveBeenCalledTimes(1);

    // Retry: pendingCreated reuses the just-created codex conversation instead of
    // creating (and orphaning) another — exactly ONE create across both attempts.
    const id = await h.store.resolveOrCreate('roster:a');
    expect(h.createConversation).toHaveBeenCalledTimes(1);
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
  });

  // Round-30 (:105): the pending replacement must be provider-matched so a genuine
  // later provider change still rotates instead of reviving the wrong-provider entry.
  it('does not reuse a stale-provider pending entry when a later provider change rotates again (:105)', async () => {
    const h = makeHarness({
      seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'old-claude' } }),
      existingConversations: [conversationOn('old-claude', 'roster:a', 'claude')],
      expectedProvider: { 'roster:a': 'codex' },
    });
    h.writeAtomic.mockRejectedValueOnce(new Error('io'));

    // First attempt records a pending codex replacement, then fails to persist.
    await expect(h.store.resolveOrCreate('roster:a')).rejects.toThrow('io');
    // Re-point the agent to a THIRD provider before the retry.
    h.setExpectedProvider('roster:a', 'opencode');

    const id = await h.store.resolveOrCreate('roster:a');

    // The codex pending entry is provider-mismatched → NOT reused; a fresh opencode
    // conversation is created (two creates total: codex then opencode).
    expect(h.createConversation).toHaveBeenCalledTimes(2);
    expect(h.conversationsById.get(id)?.providerId).toBe('opencode');
    expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
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

  describe('mapped-DM ownership validation (Round-36)', () => {
    it('does not reuse a mapping that points at a non-team-chat (ordinary) conversation', async () => {
      // A corrupt/hand-edited threads.json maps the agent key to an ordinary chat
      // conversation. Provider matches, but it is not a DM — it must NOT be reused.
      const ordinary: Conversation = { ...conversation('ordinary-1', 'roster:a'), surface: 'chat' };
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'ordinary-1' } }),
        existingConversations: [ordinary],
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).not.toBe('ordinary-1'); // the ordinary conversation is rejected
      expect(h.createConversation).toHaveBeenCalledTimes(1); // a fresh DM is created instead
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    });

    it('does not reuse a team-chat DM bound to a DIFFERENT agent on the same provider', async () => {
      // A sync/merge corruption maps roster:a's key onto roster:b's DM (same provider).
      // Reusing it would send with the WRONG bound persona — the mapping must be rejected.
      const otherAgentDm = conversationOn('dm-b', 'roster:b', DEFAULT_PROVIDER);
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'dm-b' } }),
        existingConversations: [otherAgentDm],
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).not.toBe('dm-b'); // never opens another persona's DM
      expect(h.createConversation).toHaveBeenCalledTimes(1);
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    });

    it('reuses the agent\'s OWN team-chat DM on the expected provider (all four checks pass)', async () => {
      const ownDm = conversationOn('dm-a', 'roster:a', DEFAULT_PROVIDER);
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'dm-a' } }),
        existingConversations: [ownDm],
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).toBe('dm-a'); // exists + provider + surface + boundAgent all match → reuse
      expect(h.createConversation).not.toHaveBeenCalled();
      expect(h.writeAtomic).not.toHaveBeenCalled(); // pure cache-hit, no re-persist
    });
  });

  describe('adoption recovers a missing mapping, not a stale one (Round-26)', () => {
    it('creates a fresh thread instead of resurrecting an archived same-provider DM across an A→B→A rotation', async () => {
      // Agent X's DM is mapped to convo-A on provider A (claude), and convo-A stays
      // discoverable as an orphan on A after it is rotated away — the exact conversation
      // the buggy present-but-stale fall-through re-adopts on the return to A.
      const convoA = conversationOn('convo-A', 'roster:x', 'claude');
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:x': 'convo-A' } }),
        existingConversations: [convoA],
        adoptable: { 'roster:x': convoA },
        expectedProvider: { 'roster:x': 'codex' }, // now pointed at B, so the first resolve rotates A→B
      });

      // A→B: the mapped A DM is stale (wrong provider) → rotate to a fresh B conversation.
      const bId = await h.store.resolveOrCreate('roster:x');
      expect(bId).not.toBe('convo-A');
      expect(h.conversationsById.get(bId)?.providerId).toBe('codex');

      // B→A: point the agent back at A. The mapped B DM is now stale and the archived A
      // DM is adoptable on A — but a PRESENT-yet-stale mapping must create fresh, not adopt,
      // or the old A transcript (and its still-open tab) is resurrected.
      h.setExpectedProvider('roster:x', 'claude');
      h.createConversation.mockClear();

      const aId = await h.store.resolveOrCreate('roster:x');

      expect(aId).not.toBe('convo-A'); // did NOT resurrect the archived A DM
      expect(aId).not.toBe(bId); // a third, fresh thread — not the B DM either
      expect(h.conversationsById.get(aId)?.providerId).toBe('claude'); // freshly created, back on A
      expect(h.createConversation).toHaveBeenCalledTimes(1); // created for this step, not adopted
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:x': aId } });
    });

    it('creates a fresh thread when the mapping is present but its conversation was deleted, even though an orphan is adoptable', async () => {
      // Mapping present but its conversation is gone (deleted → not usable), while a
      // same-provider orphan is discoverable. Present-but-stale creates fresh; adoption
      // is reserved for a MISSING mapping, so the orphan must NOT be adopted here.
      const orphan = conversation('orphan-1', 'roster:a'); // on the expected provider (claude)
      const h = makeHarness({
        seedFile: JSON.stringify({ version: 1, rooms: { 'roster:a': 'deleted-id' } }),
        adoptable: { 'roster:a': orphan },
      });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).not.toBe('deleted-id'); // the deleted mapping is not reused
      expect(id).not.toBe('orphan-1'); // and the adoptable orphan is NOT adopted
      expect(h.createConversation).toHaveBeenCalledTimes(1); // fresh create instead
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': id } });
    });

    it('still adopts a matching-provider orphan when there is no mapping at all', async () => {
      // The complement of the two above: with NO mapping present, adoption is the
      // correct missing-mapping recovery (a lost threads.json) and must be preserved.
      const orphan = conversation('orphan-1', 'roster:a');
      const h = makeHarness({ adoptable: { 'roster:a': orphan } });

      const id = await h.store.resolveOrCreate('roster:a');

      expect(id).toBe('orphan-1'); // adopted, not re-created
      expect(h.createConversation).not.toHaveBeenCalled();
      expect(h.readThreads()).toEqual({ version: 1, rooms: { 'roster:a': 'orphan-1' } });
    });
  });
});
