import { describe, it, expect } from 'vitest';
import {
	TITLE_GENERATION_SYSTEM_PROMPT,
	buildTitleGenerationPrompt,
	parseTitleGenerationResponse,
	fallbackTitle,
} from '@/application/threads/titleGeneration';

/**
 * TEST-TS-019 — `titleGeneration.ts` pure transforms (SPEC-TS-016, REQ-TS-024,
 * NFR-TS-005). Ported verbatim from claudian-main `core/prompt/titleGeneration.ts`:
 * `parseTitleGenerationResponse` strips surrounding quotes/backticks, trims, strips
 * trailing punctuation, caps at 50 chars (ellipsis when cut), empty/whitespace → null;
 * `fallbackTitle` truncates the first user message to the badge width (ellipsis if cut),
 * empty → 'New conversation'. Both pure/total (never throw).
 */
describe('TEST-TS-019 titleGeneration pure transforms', () => {
	describe('TITLE_GENERATION_SYSTEM_PROMPT + buildTitleGenerationPrompt', () => {
		it('exposes a non-empty system prompt instructing a concise title', () => {
			expect(typeof TITLE_GENERATION_SYSTEM_PROMPT).toBe('string');
			expect(TITLE_GENERATION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
			expect(TITLE_GENERATION_SYSTEM_PROMPT).toContain('50 chars');
		});

		it('embeds the user message in the prompt', () => {
			const prompt = buildTitleGenerationPrompt('Fix the login bug');
			expect(prompt).toContain('Fix the login bug');
			expect(prompt).toContain('Generate a title');
		});

		it('truncates an over-long user message in the prompt (≤500 chars + ellipsis)', () => {
			const long = 'x'.repeat(600);
			const prompt = buildTitleGenerationPrompt(long);
			expect(prompt).toContain(`${'x'.repeat(500)}...`);
			expect(prompt).not.toContain('x'.repeat(501));
		});
	});

	describe('parseTitleGenerationResponse', () => {
		it('returns the trimmed title for a clean response', () => {
			expect(parseTitleGenerationResponse('Fix the login bug')).toBe('Fix the login bug');
		});

		it('strips surrounding double quotes', () => {
			expect(parseTitleGenerationResponse('"Refactor the parser"')).toBe('Refactor the parser');
		});

		it('strips surrounding single quotes', () => {
			expect(parseTitleGenerationResponse("'Debug the worker'")).toBe('Debug the worker');
		});

		it('strips trailing punctuation', () => {
			expect(parseTitleGenerationResponse('Explain the design.')).toBe('Explain the design');
			expect(parseTitleGenerationResponse('Analyze the data!?')).toBe('Analyze the data');
		});

		it('caps at 50 chars, replacing the tail with an ellipsis', () => {
			const raw = 'Create a very long descriptive conversation title that exceeds the cap';
			const parsed = parseTitleGenerationResponse(raw);
			expect(parsed).not.toBeNull();
			expect(parsed?.length).toBe(50);
			expect(parsed?.endsWith('...')).toBe(true);
		});

		it('returns null for an empty / whitespace-only response', () => {
			expect(parseTitleGenerationResponse('')).toBeNull();
			expect(parseTitleGenerationResponse('   \n\t ')).toBeNull();
		});

		it('returns null when stripping leaves nothing', () => {
			expect(parseTitleGenerationResponse('""')).toBeNull();
		});

		it('never throws on odd input', () => {
			expect(() => parseTitleGenerationResponse('"')).not.toThrow();
			expect(() => parseTitleGenerationResponse('....')).not.toThrow();
		});
	});

	describe('fallbackTitle', () => {
		it('returns the trimmed first user message when short', () => {
			expect(fallbackTitle('  Fix the bug  ')).toBe('Fix the bug');
		});

		it('truncates an over-long first message with an ellipsis (50 chars total)', () => {
			const long = 'a'.repeat(80);
			const fallback = fallbackTitle(long);
			expect(fallback.length).toBe(50);
			expect(fallback.endsWith('...')).toBe(true);
		});

		it("returns 'New conversation' for an empty / whitespace message", () => {
			expect(fallbackTitle('')).toBe('New conversation');
			expect(fallbackTitle('   ')).toBe('New conversation');
		});

		it('never throws', () => {
			expect(() => fallbackTitle('')).not.toThrow();
		});
	});
});
