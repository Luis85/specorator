import type { Result } from '@/domain/shared/Result';

/**
 * One-shot cold-start auxiliary-model port (SPEC-CA-004, ADR-CA-002 §1).
 * Claudian ground-truth: `core/auxiliary/AuxQueryRunner.ts`. The unified seam
 * three consumers drive — title generation (P3), instruction refinement (P4),
 * and inline edit (P5) — so each is a single cold-start aux query rather than a
 * bespoke `ChatRuntimePort` drain loop. One port, one consumer kind ("a one-shot
 * cold-start aux query"), per ADR-008. No `obsidian`/`node:*`/Vue.
 */
export interface AuxModelRunOptions {
	/** Frames the one-shot request as the aux system prompt (title/refine/inline-edit prompts). */
	readonly systemPrompt?: string;
	/** Optional model override; absent → the runtime's default model. */
	readonly model?: string;
	/** Abort the in-flight aux query (modal dismissed mid-query — REQ-CA-027, EC-CA-8). */
	readonly signal?: AbortSignal;
}

export interface AuxModelPort {
	/**
	 * Run one cold-start aux query and resolve the accumulated text. Delegates to
	 * the active runtime's cold-start `query(turn, [], { forceColdStart: true })`
	 * so it never steers the tab's main stream (REQ-CA-021). Maps a streaming
	 * `error` chunk, an empty result, or an abort to `Result.err`; the accumulated
	 * non-empty text to `Result.ok(text)`. NEVER throws across the boundary
	 * (ADR-CC-001 §2, NFR-CA-010).
	 */
	run(prompt: string, options?: AuxModelRunOptions): Promise<Result<string>>;
}
