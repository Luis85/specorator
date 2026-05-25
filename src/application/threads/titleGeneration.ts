/**
 * Pure title-generation transforms (SPEC-TS-016, ADR-TS-003). The prompt + parse
 * functions are ported VERBATIM from claudian-main `core/prompt/titleGeneration.ts`;
 * `fallbackTitle` is the P3 badge-width fallback (SPEC-TS-016). All four functions
 * are pure and total — they never throw and have no side effects (NFR-TS-005). No
 * `obsidian`/Vue import; the application layer imports domain only.
 */

const MAX_TITLE_INPUT_LENGTH = 500;
const MAX_TITLE_LENGTH = 50;

/** The badge width a fallback title truncates to (SPEC-TS-016). */
const FALLBACK_TITLE_LENGTH = 50;

/** Neutral default when there is no first-user-message text (SPEC-TS-016). */
const DEFAULT_TITLE = 'New conversation';

/** Ported verbatim from claudian-main `core/prompt/titleGeneration.ts`. */
export const TITLE_GENERATION_SYSTEM_PROMPT = `You are a specialist in summarizing user intent.

**Task**: Generate a **concise, descriptive title** (max 50 chars) summarizing the user's task/request.

**Rules**:
1.  **Format**: Sentence case. No periods/quotes.
2.  **Structure**: Start with a **strong verb** (e.g., Create, Fix, Debug, Explain, Analyze).
3.  **Forbidden**: "Conversation with...", "Help me...", "Question about...", "I need...".
4.  **Tech Context**: Detect and include the primary language/framework if code is present (e.g., "Debug Python script", "Refactor React hook").

**Output**: Return ONLY the raw title text.`;

/** Ported verbatim from claudian-main `core/prompt/titleGeneration.ts`. */
export function buildTitleGenerationPrompt(userMessage: string): string {
	const truncated =
		userMessage.length > MAX_TITLE_INPUT_LENGTH
			? `${userMessage.slice(0, MAX_TITLE_INPUT_LENGTH)}...`
			: userMessage;
	return `User's request:\n"""\n${truncated}\n"""\n\nGenerate a title for this conversation:`;
}

/**
 * Ported verbatim from claudian-main `core/prompt/titleGeneration.ts`: trim, strip
 * surrounding quotes, strip trailing punctuation, cap at 50 chars (ellipsis when
 * cut). An empty/whitespace result → `null` (caller keeps the fallback).
 */
export function parseTitleGenerationResponse(responseText: string): string | null {
	const trimmed = responseText.trim();
	if (trimmed === '') {
		return null;
	}

	let title = trimmed;
	if (
		(title.startsWith('"') && title.endsWith('"')) ||
		(title.startsWith("'") && title.endsWith("'"))
	) {
		title = title.slice(1, -1);
	}

	title = title.replace(/[.!?:;,]+$/, '');

	if (title.length > MAX_TITLE_LENGTH) {
		title = `${title.slice(0, MAX_TITLE_LENGTH - 3)}...`;
	}

	return title === '' ? null : title;
}

/**
 * The immediate fallback title (SPEC-TS-016): the trimmed first user message
 * truncated to the badge width (with an ellipsis if cut). An empty/whitespace
 * message → a neutral default. Pure/total — never empty, never throws.
 */
export function fallbackTitle(firstUserMessage: string): string {
	const trimmed = firstUserMessage.trim();
	if (trimmed === '') {
		return DEFAULT_TITLE;
	}
	if (trimmed.length > FALLBACK_TITLE_LENGTH) {
		return `${trimmed.slice(0, FALLBACK_TITLE_LENGTH - 3)}...`;
	}
	return trimmed;
}
