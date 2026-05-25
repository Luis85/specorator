/**
 * Pure inline-edit response parse (SPEC-CA-012, ADR-CA-004). Ported from claudian
 * `core/prompt/inlineEdit.ts:9` into the SPEC `InlineEditParse` union, mirroring
 * the P3/P4 `parseTitleGenerationResponse` / `parseRefineResponse` style. Pure +
 * total — no side effects, never throws (NFR-CA-004). No `obsidian`/`node:*`/Vue.
 */

/** The four mutually-exclusive parse outcomes the inline-edit aux response yields. */
export type InlineEditParse =
	| { kind: 'replacement'; text: string } // <replacement>…</replacement>
	| { kind: 'insertion'; text: string } // <insertion>…</insertion>
	| { kind: 'clarification'; question: string } // a non-empty untagged response
	| { kind: 'failure' }; // an empty / whitespace response

/**
 * Parse the raw aux text: a `<replacement>…</replacement>` block (first match,
 * `[\s\S]*?`, trimmed inner) → replacement; else a `<insertion>…</insertion>`
 * block → insertion; else a non-empty trimmed string → clarification; else
 * (empty/whitespace) → failure (REQ-CA-022).
 */
export function parseInlineEditResponse(raw: string): InlineEditParse {
	const replacement = /<replacement>([\s\S]*?)<\/replacement>/.exec(raw);
	if (replacement) {
		return { kind: 'replacement', text: replacement[1].trim() };
	}

	const insertion = /<insertion>([\s\S]*?)<\/insertion>/.exec(raw);
	if (insertion) {
		return { kind: 'insertion', text: insertion[1].trim() };
	}

	const trimmed = raw.trim();
	if (trimmed !== '') {
		return { kind: 'clarification', question: trimmed };
	}

	return { kind: 'failure' };
}
