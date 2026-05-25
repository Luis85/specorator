/**
 * Turn request / prepared turn / query + ready options — mirrors claudian-main
 * `runtime/types.ts:45/56/64/73` (SPEC-CC-005, SPEC-CC-006). P1 carries the full
 * shapes for parity but only populates the marked fields.
 */

/** Turn request — mirrors `runtime/types.ts:45`. P1 uses `text` (+ optional `currentNotePath`). */
export interface ChatTurnRequest {
	text: string;
	/** P1 optional context hint; the rest of Claudian's request fields regrow P2+. */
	currentNotePath?: string;
	// images?, editorSelection?, browserSelection?, canvasSelection?,
	// externalContextPaths?, enabledMcpServers? — EXCLUDED from P1 (regrow P2+).
}

/** Prepared turn — mirrors `runtime/types.ts:56`. */
export interface PreparedChatTurn {
	request: ChatTurnRequest;
	/** P1 = `request.text`. */
	persistedContent: string;
	/** P1 = `request.text`. */
	prompt: string;
	/** P1 = `false`. */
	isCompact: boolean;
	/** P1 = empty `Set`. */
	mcpMentions: Set<string>;
}

/** Query options — mirrors `runtime/types.ts:64`. */
export interface ChatRuntimeQueryOptions {
	/** P1 optional; allowedTools/mcpMentions/enabledMcpServers/externalContextPaths are P2+. */
	model?: string;
	/**
	 * P3 additive (SPEC-TS-003/009, ADR-TS-003 §1): when set, the runtime ignores
	 * any bound session for this single query (a cold-start / one-shot query, used
	 * by the title-gen side-query so it does not steer the tab's main stream).
	 */
	forceColdStart?: boolean;
	/**
	 * P4 additive (SPEC-CP-005/011, REQ-CP-018, R-CP-001): the persisted
	 * `customSystemPrompt` the instruction `#` flow appends to. When present and
	 * non-empty the runtime feeds it to the agent's system prompt (the CLI emits
	 * `--append-system-prompt <text>`; the parity counterpart of Claudian feeding
	 * `settings.systemPrompt` through `buildSystemPrompt` into the SDK). The store
	 * reads it from `SettingsPort` and threads it here, so instruction mode actually
	 * reaches the runtime instead of dead-ending in settings.
	 */
	appendSystemPrompt?: string;
}

/** Ensure-ready options — mirrors `runtime/types.ts:73`. */
export interface ChatRuntimeEnsureReadyOptions {
	allowSessionCreation?: boolean;
	force?: boolean;
}
