import type { TriggerHit } from '@/domain/chat/composer/ComposerMode';

/**
 * Pure trigger-parse (SPEC-CP-012, ADR-CP-001 §2). Ported from claudian
 * `SlashCommandDropdown.handleInputChange` (slash/skills start-of-token scan +
 * whitespace-closes), `MentionDropdownController` (the `@`-token scan), and the
 * empty-input gates of the instruction/bang-bash mode managers. Every function is
 * pure and total — it never throws and has no side effects (NFR-CP-005). No
 * `obsidian`/`node:*`/Vue import; the application layer imports domain only.
 */

const WHITESPACE = /\s/;

/**
 * Scan backward from the caret for the nearest valid slash/skills trigger
 * (`/` or `$`). Valid means the trigger char is at index 0 or immediately follows
 * whitespace (start-of-token, REQ-CP-001/002). A whitespace before the trigger
 * ends the scan; a mid-word trigger (`a/b`) yields no hit (EC-CP-1). Returns the
 * trigger index + char, or `null`.
 */
function scanSlashTrigger(
	textBeforeCaret: string,
	caret: number,
): { index: number; char: '/' | '$' } | null {
	for (let i = caret - 1; i >= 0; i--) {
		const ch = textBeforeCaret.charAt(i);
		if (WHITESPACE.test(ch)) break;
		if (ch === '/' || ch === '$') {
			if (i === 0 || WHITESPACE.test(textBeforeCaret.charAt(i - 1))) {
				return { index: i, char: ch };
			}
			break;
		}
	}
	return null;
}

/**
 * Classify the active trigger from `(value, caret)`. `null` when no trigger
 * applies. Slash/skills take precedence; a slash filter that has swallowed a
 * whitespace closes the palette (EC-CP-2). `@` is detected anywhere the caret sits
 * within the `@`-token (the latest `@` before the caret); mention does not close on
 * whitespace (A.1).
 */
export function detectTrigger(value: string, caret: number): TriggerHit | null {
	const textBeforeCaret = value.slice(0, caret);

	const slash = scanSlashTrigger(textBeforeCaret, caret);
	if (slash !== null) {
		const filter = textBeforeCaret.slice(slash.index + 1);
		if (WHITESPACE.test(filter)) return null; // whitespace closes the slash/skills palette.
		return {
			kind: slash.char === '/' ? 'slash' : 'skills',
			tokenStart: slash.index,
			filter,
		};
	}

	const atIndex = textBeforeCaret.lastIndexOf('@');
	if (atIndex === -1) return null;
	return {
		kind: 'mention',
		tokenStart: atIndex,
		filter: textBeforeCaret.slice(atIndex + 1),
	};
}

/** `'#'` rule (REQ-CP-015): instruction mode iff the WHOLE value is empty/whitespace. */
export function shouldEnterInstruction(value: string): boolean {
	return value.trim() === '';
}

/** `'!'` rule (REQ-CP-029): bang-bash mode iff the WHOLE value is empty/whitespace. */
export function shouldEnterBangBash(value: string): boolean {
	return value.trim() === '';
}

/**
 * Replace the trigger token `[tokenStart, caret]` with `insertion`; the text
 * OUTSIDE the token is preserved (so an Escape-then-restore keeps `look at @no`
 * intact — the consumer never destructively rewrites on cancel, only on confirm;
 * REQ-CP-036, EC-CP-4). The returned caret sits after the inserted text.
 */
export function replaceTriggerToken(
	value: string,
	tokenStart: number,
	caret: number,
	insertion: string,
): { value: string; caret: number } {
	const before = value.slice(0, tokenStart);
	const after = value.slice(caret);
	return {
		value: before + insertion + after,
		caret: before.length + insertion.length,
	};
}
