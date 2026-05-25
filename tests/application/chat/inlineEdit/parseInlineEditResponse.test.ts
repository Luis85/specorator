/**
 * T-CA-019 (RED) — pure `parseInlineEditResponse` (SPEC-CA-012, ADR-CA-004).
 * Ported verbatim from claudian `core/prompt/inlineEdit.ts:9` into the SPEC union:
 * a `<replacement>…</replacement>` block (first match, `[\s\S]*?`, trimmed inner)
 * → replacement; else `<insertion>…</insertion>` → insertion; else a non-empty
 * trimmed string → clarification; else (empty/whitespace) → failure. Pure/total —
 * never throws, no side effects (mirrors `parseTitleGenerationResponse` /
 * `parseRefineResponse`).
 *
 * Fails (RED) until T-CA-020 implements
 * `src/application/chat/inlineEdit/parseInlineEditResponse.ts`.
 *
 * Traces: TEST-CA-022, SPEC-CA-012, REQ-CA-022, NFR-CA-004.
 */
import { describe, it, expect } from 'vitest';
import {
	parseInlineEditResponse,
	type InlineEditParse,
} from '@/application/chat/inlineEdit/parseInlineEditResponse';

describe('TEST-CA-022 parseInlineEditResponse', () => {
	it('REQ-CA-022: a <replacement> block → replacement with trimmed inner', () => {
		const parsed = parseInlineEditResponse('<replacement>Bonjour</replacement>');
		expect(parsed).toEqual<InlineEditParse>({ kind: 'replacement', text: 'Bonjour' });
	});

	it('trims surrounding whitespace inside the <replacement> block', () => {
		const parsed = parseInlineEditResponse('<replacement>\n  La orilla era empinada.  \n</replacement>');
		expect(parsed).toEqual<InlineEditParse>({
			kind: 'replacement',
			text: 'La orilla era empinada.',
		});
	});

	it('takes the FIRST <replacement> block when several are present', () => {
		const parsed = parseInlineEditResponse('<replacement>first</replacement><replacement>second</replacement>');
		expect(parsed).toEqual<InlineEditParse>({ kind: 'replacement', text: 'first' });
	});

	it('an <insertion> block → insertion with trimmed inner', () => {
		const parsed = parseInlineEditResponse('<insertion>fox</insertion>');
		expect(parsed).toEqual<InlineEditParse>({ kind: 'insertion', text: 'fox' });
	});

	it('replacement wins over insertion when both are present', () => {
		const parsed = parseInlineEditResponse('<insertion>x</insertion><replacement>y</replacement>');
		expect(parsed).toEqual<InlineEditParse>({ kind: 'replacement', text: 'y' });
	});

	it('REQ-CA-022: a non-empty untagged response → clarification (trimmed)', () => {
		const parsed = parseInlineEditResponse('  Which meaning?  ');
		expect(parsed).toEqual<InlineEditParse>({ kind: 'clarification', question: 'Which meaning?' });
	});

	it('REQ-CA-022: an empty response → failure', () => {
		expect(parseInlineEditResponse('')).toEqual<InlineEditParse>({ kind: 'failure' });
	});

	it('a whitespace-only response → failure', () => {
		expect(parseInlineEditResponse('   \n\t  ')).toEqual<InlineEditParse>({ kind: 'failure' });
	});

	it('never throws (pure/total)', () => {
		expect(() => parseInlineEditResponse('<replacement>unterminated')).not.toThrow();
		expect(() => parseInlineEditResponse('plain text answer')).not.toThrow();
	});
});
