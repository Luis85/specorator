import type { SpecoratorEventMap } from '../../app/events/specoratorEvents';
import type { EventBus } from '../../core/events/EventBus';
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
  /** Wraps `plugin.createConversation({ boundAgentId, surface: 'team-chat', providerId })`. */
  createConversation: (agentId: string) => Promise<Conversation>;
  /** `plugin.getConversationSync(id) != null` — is the mapped conversation still live? */
  conversationExists: (id: string) => boolean;
  /** `plugin.findTeamChatConversationForAgent` — an orphaned DM to adopt when the map is lost. */
  findAdoptable: (agentId: string) => Conversation | null;
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
   * Returns the conversation id for the agent's DM: the mapped id if it still exists,
   * else an adoptable orphan, else a freshly created conversation — creating and persisting
   * at most once even under concurrent calls.
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

    const mapped = rooms[key];
    if (mapped && this.deps.conversationExists(mapped)) return mapped;

    // Adopt an orphaned DM before creating, so a lost threads.json can't duplicate it.
    const adoptable = this.deps.findAdoptable(agentId);
    const id = adoptable ? adoptable.id : (await this.deps.createConversation(agentId)).id;

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
