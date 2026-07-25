import type { SpecoratorEventMap } from '../../app/events/specoratorEvents';
import type { EventBus } from '../../core/events/EventBus';
import type { ProviderId } from '../../core/providers/types';
import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import type { Conversation } from '../../core/types/chat';

export const TEAM_CHAT_DIR = '.specorator/team-chat';
export const THREADS_PATH = `${TEAM_CHAT_DIR}/threads.json`;
const THREADS_VERSION = 1;

/** Persisted shape of `threads.json`. */
interface ThreadsFile {
  version: number;
  rooms: Record<string, string>;
}

export interface TeamChatThreadStoreDeps {
  adapter: VaultFileAdapter;
  /**
   * The provider the agent's DM should currently run on (roster policy, shared
   * with DM creation). `undefined` when the agent is unknown — reuse/adoption
   * then fall back to "any provider", since there is nothing to rotate toward.
   */
  resolveExpectedProvider: (agentId: string) => Promise<ProviderId | undefined>;
  /** Wraps `plugin.createConversation({ boundAgentId, surface: 'team-chat', providerId })`. */
  createConversation: (agentId: string) => Promise<Conversation>;
  /**
   * Is the mapped conversation still live AND running on `expectedProvider`? A DM's
   * `providerId` is immutable, so a conversation on a different provider is stale
   * (the agent was re-pointed at another backend) and must NOT be reused.
   */
  isConversationUsable: (id: string, expectedProvider: ProviderId | undefined) => boolean;
  /**
   * `plugin.findTeamChatConversationForAgent` scoped to `expectedProvider` — an
   * orphaned DM to adopt when the map is lost. Scoping is load-bearing: adopting
   * the agent's OLD-provider DM would instantly undo a provider-change rotation.
   */
  findAdoptable: (agentId: string, expectedProvider: ProviderId | undefined) => Conversation | null;
  events?: EventBus<SpecoratorEventMap>;
}

/**
 * Maps a Team Chat `roomKey` to the conversation id backing that DM, persisted as a
 * single `.specorator/team-chat/threads.json` file.
 *
 * All mutations are serialized **store-wide** (not per-key): `VaultFileAdapter.writeAtomic`
 * writes through one fixed `${path}.tmp`, so two concurrent writers to the shared file could
 * consume each other's temp file, and two concurrent resolves for the same agent could each
 * decide to create. A tail-chained queue (mirroring `VaultFileAdapter.append`'s `writeQueue`)
 * makes every read-modify-write atomic relative to the others.
 */
export class TeamChatThreadStore {
  private rooms: Record<string, string> | null = null;
  private loading: Promise<Record<string, string>> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: TeamChatThreadStoreDeps) {}

  /**
   * Returns the conversation id for the agent's DM. A usable mapping (still exists
   * AND runs on the agent's expected provider) is reused. Otherwise:
   *  - mapping PRESENT but stale (wrong provider after a rotation, or deleted) →
   *    a freshly created conversation. Adoption is deliberately skipped here so a
   *    prior rotation's archived same-provider DM is not resurrected.
   *  - mapping ABSENT (new agent, or a lost threads.json) → an adoptable orphan on
   *    the expected provider if one exists, else a freshly created conversation.
   * Creates and persists at most once even under concurrent calls. A provider change
   * rotates to a fresh conversation (spec §4); the old one is left orphaned, never deleted.
   */
  async resolveOrCreate(agentId: string): Promise<string> {
    return this.serialize(() => this.resolveOrCreateInner(agentId));
  }

  /** Map read only (never creates), for read-only callers such as roster presence. */
  async get(agentId: string): Promise<string | null> {
    const rooms = await this.loadRooms();
    return rooms[this.roomKeyForAgent(agentId)] ?? null;
  }

  private async resolveOrCreateInner(agentId: string): Promise<string> {
    const rooms = await this.loadRooms();
    const key = this.roomKeyForAgent(agentId);

    // Resolve the agent's expected provider ONCE (roster policy, shared with DM
    // creation) and thread it through both reuse gates below, so a single roster
    // read decides reuse, adoption, and creation consistently.
    const expectedProvider = await this.deps.resolveExpectedProvider(agentId);

    // Reuse the mapping only while it still runs on the expected provider. A DM's
    // providerId is immutable, so if the user re-pointed the agent at a different
    // backend, the mapped conversation is stale and must rotate — not be returned.
    const mapped = rooms[key];
    if (mapped && this.deps.isConversationUsable(mapped, expectedProvider)) return mapped;

    // Adoption is a MISSING-mapping recovery mechanism (threads.json lost but the
    // conversation still exists → adopt to avoid a duplicate). It must NOT run when a
    // mapping is present but stale, or an A→B→A rotation resurrects an old transcript:
    // returning to A, the mapped B DM is stale and findAdoptable would re-adopt the
    // archived A DM the first rotation orphaned, instead of creating the required
    // fresh A thread.
    let id: string;
    if (mapped) {
      // Mapping PRESENT but stale — wrong provider after a rotation, or its
      // conversation was deleted. Create fresh; never adopt.
      id = (await this.deps.createConversation(agentId)).id;
    } else {
      // Mapping ABSENT — a new agent, or a lost threads.json. Recover by adopting a
      // matching-provider orphan if one exists (scoping guards against re-adopting an
      // old-provider DM), else create.
      const adoptable = this.deps.findAdoptable(agentId, expectedProvider);
      id = adoptable ? adoptable.id : (await this.deps.createConversation(agentId)).id;
    }

    // Order matters — durable write, THEN commit the cache, THEN notify:
    //  - Write first so a rejecting writeAtomic (transient vault I/O) leaves
    //    `this.rooms` unmutated; a retry re-resolves (re-adopting the
    //    just-created conversation) and re-emits, rather than returning a
    //    "recovered" id whose mapping never reached disk and never emitted.
    //  - Swap the cache BEFORE emitting so a synchronous teamChat:threads-changed
    //    subscriber that calls get() observes the new mapping, not the stale one.
    const next = { ...rooms, [key]: id };
    await this.writeThreads(next);
    this.rooms = next;
    this.deps.events?.emit('teamChat:threads-changed');
    return id;
  }

  /**
   * Increment-1 seam: `roomKey === agentId`. Kept private so increment 2 can key on a
   * participant set without a public API change or a `threads.json` migration.
   */
  private roomKeyForAgent(agentId: string): string {
    return agentId;
  }

  private serialize<T>(body: () => Promise<T>): Promise<T> {
    const result = this.queue.then(body);
    // Keep the shared tail resolvable so one rejected op can't wedge the chain
    // (mirrors VaultFileAdapter.append's `.catch`).
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async loadRooms(): Promise<Record<string, string>> {
    if (this.rooms) return this.rooms;
    // Dedupe the initial disk read so a read-only `get` racing the first resolve
    // can't trigger a second read; disk is consulted on this load only, cached after.
    if (!this.loading) {
      this.loading = this.readRoomsFromDisk().then((rooms) => {
        this.rooms = rooms;
        this.loading = null;
        return rooms;
      });
    }
    return this.loading;
  }

  private async readRoomsFromDisk(): Promise<Record<string, string>> {
    try {
      if (!(await this.deps.adapter.exists(THREADS_PATH))) return {};
      return this.extractRooms(JSON.parse(await this.deps.adapter.read(THREADS_PATH)));
    } catch {
      // Absent, unreadable, or corrupt threads.json → treat as empty; the next
      // resolveOrCreate rewrites a clean file (mirrors AgentRosterStore's tolerance
      // of malformed json).
      return {};
    }
  }

  private extractRooms(parsed: unknown): Record<string, string> {
    const rooms = (parsed as { rooms?: unknown } | null)?.rooms;
    if (!rooms || typeof rooms !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(rooms as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  }

  /** Write-only (no emit): the caller commits the cache and emits in order. */
  private async writeThreads(rooms: Record<string, string>): Promise<void> {
    const file: ThreadsFile = { version: THREADS_VERSION, rooms };
    await this.deps.adapter.writeAtomic(THREADS_PATH, JSON.stringify(file, null, 2));
  }
}
