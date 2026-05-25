/**
 * Inline ask-user-question DTOs (SPEC-CP-004). Plain domain data — string/array
 * only; no `obsidian`, no `node:*`, no Vue, no class. Mirrors claudian
 * `core/types/tools.ts` `AskUserQuestionItem`. The runtime owns `requestId`
 * (the correlation key the response resolves against, SPEC-CP-017).
 */
export interface AskUserQuestionOption {
	/** Stable option id — the answer carries it back. */
	readonly id: string;
	readonly label: string;
	readonly description?: string;
}

export interface AskUserQuestionItem {
	/** Stable question id — used to key the answer in a multi-question block. */
	readonly id: string;
	readonly question: string;
	readonly options: AskUserQuestionOption[];
	/** When true, a free-text answer is permitted alongside the options (mirrors claudian). */
	readonly allowCustomInput?: boolean;
}

export interface AskUserQuestionRequest {
	readonly requestId: string;
	/** One or many questions (multi-question tabs, REQ-CP-022). */
	readonly questions: AskUserQuestionItem[];
}

/**
 * The answer per question: keyed by question id; the value is the chosen option
 * id, OR, for a custom free-text answer (`allowCustomInput`), `{ custom: string }`.
 * A complete answer covers every question id of the request (REQ-CP-022).
 */
export interface AskUserQuestionAnswer {
	readonly requestId: string;
	readonly answers: Record<string, string | { custom: string }>;
}
