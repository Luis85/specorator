import type { ComposerSendContext, ComposerTurnOptions } from './composerSendPhases';

/**
 * A turn replayed from a captured snapshot (the streaming-queue dequeue), rather
 * than one built from the live composer.
 *
 * Such a turn OWNS its context: whatever it carries was folded in — and consumed
 * — when it was queued, so anything sitting on the composer now was staged
 * afterwards and belongs to the user's next turn. Consuming it here silently
 * drops context the replayed request never contained. This is separate from the
 * compact rules below because a merged queue (`ordinary\n\n/compact`) no longer
 * reads as a compact invocation, so those predicates cannot catch it.
 */
export function isReplayedTurn(options?: ComposerTurnOptions): boolean {
  return options?.turnRequestOverride !== undefined;
}

/**
 * What a `/compact` turn does and does not take from the composer.
 *
 * `resolveTurnSubmission` ships the invocation BARE so the provider recognizes
 * its built-in: no pill mention suffix, no images. Every site that consumes
 * composer context afterwards has to agree, or the turn eats attachments it
 * never carried. Those sites are spread across `InputController` (dispatch,
 * streaming queue) and `QueuedMessageController` (steer commit), so the rule
 * lives here rather than being re-derived at each one — it drifted once
 * already, and the queue path kept clearing pills a compact turn never folded
 * in.
 *
 * **Scope, and its one exception.** These predicates answer for context the
 * FEATURE layer strips (pills, images): no provider gets a say, so a textual
 * test is authoritative. They do NOT answer for the current note, which stays
 * on the turnRequest and is dropped or rendered per-runtime — Claude's encoder
 * drops the whole envelope, Codex routes to its own compact endpoint, Opencode
 * has no compact concept and renders it. Only `PreparedChatTurn.isCompact` can
 * settle that, which is why the note is consumed in `streamPreparedTurn`.
 */
export function isCompactInvocation(content: string): boolean {
  return /^\/compact(\s|$)/i.test(content);
}

/**
 * Whether this turn's images should be written to the vault before dispatch.
 *
 * False for `/compact`: persisting would write an attachment the turn never
 * references, orphaning it in the vault once the user clears the still-staged
 * image, and a failed write would abort a compaction that had nothing to do
 * with it. Safe to decide textually — this runs before `prepareTurn`, and the
 * image exclusion is the feature layer's for every provider.
 */
export function shouldPersistComposerImages(send: ComposerSendContext): boolean {
  return send.hasImages && !isCompactInvocation(send.content);
}
