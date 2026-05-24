/**
 * Context window usage — mirrors claudian-main `chat.ts:165` (SPEC-CC-003).
 *
 * P1 uses `contextTokens`/`contextWindow`/`percentage`/`inputTokens`; the optional
 * cache fields are kept for shape-parity (the Claude CLI may report them) but P1
 * renders none of these (NG4 — no context meter). The store keeps the DTO for the
 * P6 meter seam only (REQ-CC-005a).
 *
 * Validation (P1 stores as received, never throws): `inputTokens`, `contextWindow`,
 * `contextTokens`, `percentage` are finite numbers >= 0; `percentage` is 0–100.
 */
export interface UsageInfo {
	model?: string;
	/** Prompt caching: tokens used to create cache entries. Claude-specific; 0 if omitted. */
	cacheCreationInputTokens?: number;
	/** Prompt caching: tokens read from cache. Claude-specific; 0 if omitted. */
	cacheReadInputTokens?: number;
	inputTokens: number;
	contextWindow: number;
	/** True when `contextWindow` came from provider runtime data instead of a local heuristic. */
	contextWindowIsAuthoritative?: boolean;
	contextTokens: number;
	percentage: number;
}
