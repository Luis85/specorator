import { describe, it, expect } from 'vitest';
import {
	buildRefineSystemPrompt,
	parseRefineResponse,
} from '@/application/chat/composer/instructionRefine';

/**
 * TEST-CP-010 — the pure instruction-refine transforms (SPEC-CP-015, REQ-CP-016).
 * Ported verbatim from claudian `core/prompt/instructionRefine.ts`:
 * buildRefineSystemPrompt frames the one-shot refine prompt (folding in the
 * existing instructions when present); parseRefineResponse extracts
 * <instruction>…</instruction> → refined, a non-empty plain text → clarification,
 * '' → null. Pure/total — never throws.
 */
describe('TEST-CP-010 buildRefineSystemPrompt', () => {
	it('includes the existing-instructions section when non-empty', () => {
		const prompt = buildRefineSystemPrompt('Always use TypeScript.');
		expect(prompt).toContain('EXISTING INSTRUCTIONS');
		expect(prompt).toContain('Always use TypeScript.');
	});

	it('omits the existing section when empty/whitespace', () => {
		expect(buildRefineSystemPrompt('')).not.toContain('EXISTING INSTRUCTIONS');
		expect(buildRefineSystemPrompt('   ')).not.toContain('EXISTING INSTRUCTIONS');
	});

	it('always frames the prompt-engineer goal', () => {
		expect(buildRefineSystemPrompt('')).toContain('Prompt Engineer');
	});
});

describe('TEST-CP-010 parseRefineResponse', () => {
	it('extracts an <instruction>…</instruction> block as refined', () => {
		const out = parseRefineResponse('<instruction>- **Code**: Use TypeScript.</instruction>');
		expect(out).toEqual({ kind: 'refined', instruction: '- **Code**: Use TypeScript.' });
	});

	it('trims the extracted instruction body', () => {
		const out = parseRefineResponse('<instruction>\n  be concise  \n</instruction>');
		expect(out).toEqual({ kind: 'refined', instruction: 'be concise' });
	});

	it('treats a non-empty plain text as a clarification', () => {
		const out = parseRefineResponse('Could you clarify which thing?');
		expect(out).toEqual({ kind: 'clarification', question: 'Could you clarify which thing?' });
	});

	it('returns null for an empty/whitespace response', () => {
		expect(parseRefineResponse('')).toBeNull();
		expect(parseRefineResponse('   \n  ')).toBeNull();
	});
});
