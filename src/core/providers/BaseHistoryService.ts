import type { Conversation } from '../types';
import type {
  DeleteHistoryOutcome,
  HistoryLoadOutcome,
  HydrationContext,
  ProviderConversationHistoryService,
  ProviderForkSupport,
} from './types';

/**
 * Shared base for provider conversation history services.
 *
 * Centralizes:
 *   - the `Map<convId, sourceRef>` cache that every provider duplicated
 *   - per-caller cancellation without poisoning a shared provider read
 *   - the `forceRefresh` bypass
 *   - cache invalidation on `empty` / `error` outcomes
 *   - concurrent-hydration dedupe keyed by conversation + immutable source identity
 *
 * The base **never** mutates `conversation.messages`. Callers (`ConversationStore`)
 * branch on the outcome and own the assignment so the loaded/error asymmetry that
 * would otherwise stale-render an error pane never exists.
 *
 * Subclasses MAY check `ctx.signal?.aborted` at iteration boundaries inside
 * `loadMessages` (Claude's multi-session walk relies on this).
 */
export abstract class BaseHistoryService<
  TPersistedState = Record<string, unknown>,
> implements ProviderConversationHistoryService<TPersistedState> {
  private hydrationCache = new Map<string, string>();
  private inflight = new Map<string, Promise<HistoryLoadOutcome>>();
  private cacheEpoch = 0;
  private conversationEpoch = new Map<string, number>();

  forkSupport?: ProviderForkSupport;

  protected abstract computeCacheKey(
    conversation: Conversation,
    ctx: HydrationContext,
  ): string | null;

  protected abstract loadMessages(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<HistoryLoadOutcome>;

  abstract resolveSessionIdForConversation(
    conversation: Conversation | null,
  ): string | null;

  abstract deleteConversationSession(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<DeleteHistoryOutcome>;

  buildPersistedProviderState?(
    conversation: Conversation,
  ): TPersistedState | undefined;

  async hydrateConversationHistory(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<HistoryLoadOutcome> {
    if (ctx.signal?.aborted) {
      return {
        kind: 'error',
        error: { code: 'cancelled', message: 'Hydration cancelled' },
        sourceRef: null,
      };
    }

    const key = this.computeCacheKey(conversation, ctx);
    if (
      !ctx.forceRefresh
      && key
      && this.hydrationCache.get(conversation.id) === key
      && conversation.messages.length > 0
    ) {
      return { kind: 'cached', sourceRef: key };
    }

    const inflightKey = `${conversation.id}::${key ?? 'unresolved'}`;
    const inflight = this.inflight.get(inflightKey);
    if (inflight) return this.awaitWithCallerCancellation(inflight, ctx.signal);

    const cacheEpoch = this.cacheEpoch;
    const conversationEpoch = this.conversationEpoch.get(conversation.id) ?? 0;
    const pending = (async (): Promise<HistoryLoadOutcome> => {
      // The shared load must not inherit one caller's AbortSignal. Otherwise a
      // second opener can join a promise that the first caller later cancels,
      // turning a valid retry into a cached cancellation. Callers cancel only
      // their own wait below; the shared provider read completes and can safely
      // serve another tab/retry.
      const outcome = await this.loadMessages(conversation, { ...ctx, signal: undefined });

      if (outcome.kind === 'loaded' && outcome.cacheable !== false) {
        // loadMessages can resolve a source that was unknown when `key` was
        // computed above (e.g. Codex backfilling sessionFilePath from a bare
        // threadId), flipping the key from null → concrete during the load.
        // Recompute it here so first-time path discovery still seeds the cache;
        // reusing the pre-load `key` would leave it unseeded and make the next
        // hydration reparse the same transcript.
        const resolvedKey = this.computeCacheKey(conversation, ctx);
        const cacheStillCurrent =
          this.cacheEpoch === cacheEpoch
          && (this.conversationEpoch.get(conversation.id) ?? 0) === conversationEpoch;
        // Don't seed the cache when the triggering caller was cancelled: its
        // outcome was delivered as `cancelled`, so ConversationStore never
        // committed `outcome.messages`. Seeding here would let the next open take
        // the fast-path `cached` branch (which only checks messages.length > 0)
        // and skip re-committing the freshly loaded transcript over the stale
        // in-memory one. A redundant reload for a joined live caller is fine;
        // serving stale messages is not.
        if (resolvedKey && cacheStillCurrent && !ctx.signal?.aborted) {
          this.hydrationCache.set(conversation.id, resolvedKey);
        }
      } else if (
        (outcome.kind === 'loaded' && outcome.cacheable === false)
        || outcome.kind === 'empty'
        || outcome.kind === 'error'
      ) {
        this.hydrationCache.delete(conversation.id);
      }

      return outcome;
    })();

    this.inflight.set(inflightKey, pending);
    const clearInflight = () => {
      if (this.inflight.get(inflightKey) === pending) {
        this.inflight.delete(inflightKey);
      }
    };
    void pending.then(clearInflight, clearInflight);
    return this.awaitWithCallerCancellation(pending, ctx.signal);
  }

  private awaitWithCallerCancellation(
    pending: Promise<HistoryLoadOutcome>,
    signal?: AbortSignal,
  ): Promise<HistoryLoadOutcome> {
    if (!signal) return pending;
    if (signal.aborted) return Promise.resolve(this.cancelledOutcome());

    // Race the load against the caller's abort. Forwarding `pending`'s rejection
    // through Promise.race preserves its original reason unchanged (no manual
    // `reject(error)` of an `unknown`); the cancellation branch only ever
    // resolves. `pending.finally` drops the abort listener when the load settles
    // first; `{ once: true }` drops it when abort fires first.
    const cancellation = new Promise<HistoryLoadOutcome>((resolve) => {
      const onAbort = () => resolve(this.cancelledOutcome());
      signal.addEventListener('abort', onAbort, { once: true });
      void pending.finally(() => signal.removeEventListener('abort', onAbort));
    });
    return Promise.race([pending, cancellation]);
  }

  private cancelledOutcome(): HistoryLoadOutcome {
    return {
      kind: 'error',
      error: { code: 'cancelled', message: 'Hydration cancelled' },
      sourceRef: null,
    };
  }

  /** Test-only: clears the cache. Subclasses may expose this for white-box tests. */
  protected clearHydrationCache(): void {
    this.cacheEpoch += 1;
    this.hydrationCache.clear();
    this.inflight.clear();
  }

  /** Clears cached hydration for one conversation without touching other entries. */
  protected clearHydrationCacheForConversation(conversationId: string): void {
    this.conversationEpoch.set(
      conversationId,
      (this.conversationEpoch.get(conversationId) ?? 0) + 1,
    );
    this.hydrationCache.delete(conversationId);
    const prefix = `${conversationId}::`;
    for (const key of this.inflight.keys()) {
      if (key.startsWith(prefix)) {
        this.inflight.delete(key);
      }
    }
  }

  invalidateConversationHistory(conversationId: string): void {
    this.clearHydrationCacheForConversation(conversationId);
  }
}
