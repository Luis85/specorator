/**
 * T-CA-019 (RED) — pure `inlineEditPrompt` module (SPEC-CA-013, ADR-CA-004).
 * `INLINE_EDIT_SYSTEM_PROMPT` is a non-empty string instructing the model to
 * answer with a `<replacement>` / `<insertion>` block or a plain-text
 * clarification (the contract `parseInlineEditResponse` reads, SPEC-CA-012);
 * `buildInlineEditPrompt(selectedText, instruction, notePath?)` frames the
 * selection + the instruction (+ optional note-path context). Both pure/total.
 *
 * Fails (RED) until T-CA-020 implements
 * `src/application/chat/inlineEdit/inlineEditPrompt.ts`.
 *
 * Traces: TEST-CA-021 (prompt leg), SPEC-CA-013, REQ-CA-021, NFR-CA-004.
 */
import { describe, it, expect } from 'vitest';
import {
	INLINE_EDIT_SYSTEM_PROMPT,
	buildInlineEditPrompt,
} from '@/application/chat/inlineEdit/inlineEditPrompt';

describe('TEST-CA-021 INLINE_EDIT_SYSTEM_PROMPT', () => {
	it('is a non-empty string', () => {
		expect(typeof INLINE_EDIT_SYSTEM_PROMPT).toBe('string');
		expect(INLINE_EDIT_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
	});

	it('documents the <replacement> / <insertion> / clarification contract', () => {
		expect(INLINE_EDIT_SYSTEM_PROMPT).toContain('<replacement>');
		expect(INLINE_EDIT_SYSTEM_PROMPT).toContain('<insertion>');
		expect(INLINE_EDIT_SYSTEM_PROMPT.toLowerCase()).toContain('clarif');
	});
});

describe('TEST-CA-021 buildInlineEditPrompt', () => {
	it('frames the instruction and the selected text', () => {
		const prompt = buildInlineEditPrompt('Hello world', 'translate to French');
		expect(prompt).toContain('translate to French');
		expect(prompt).toContain('Hello world');
	});

	it('includes the note path when supplied', () => {
		const prompt = buildInlineEditPrompt('Hello world', 'translate', 'notes/readme.md');
		expect(prompt).toContain('notes/readme.md');
	});

	it('is pure/total — never throws and the same inputs give the same output', () => {
		expect(() => buildInlineEditPrompt('', '')).not.toThrow();
		expect(buildInlineEditPrompt('a', 'b', 'c')).toBe(buildInlineEditPrompt('a', 'b', 'c'));
	});
});
