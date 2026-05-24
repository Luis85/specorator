/**
 * T-CC-015 — `MarkdownRenderPort` adapter wrapping `safeMarkdownRender`.
 *
 * SPEC-CC-015 / SPEC-CC-007: the P1 markdown port `render(md)` delegates to `safeMarkdownRender`
 * — the result is deep-equal to calling the transform directly. This is the object the bridges
 * return (SPEC-CC-013).
 *
 * Traces: SPEC-CC-015, SPEC-CC-007, SPEC-CC-014, REQ-CC-006, NFR-CC-008.
 */
import { describe, it, expect } from 'vitest';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { safeMarkdownRender } from '@/application/chat/safeMarkdownRender';

describe('safeMarkdownRenderPort (T-CC-015)', () => {
	it('implements the MarkdownRenderPort render method', () => {
		expect(typeof safeMarkdownRenderPort.render).toBe('function');
	});

	it('render(md) is deep-equal to safeMarkdownRender(md)', () => {
		const inputs = ['', '   ', 'plain text', 'a `code` span\nbreak', 'one\n\ntwo', '<&>`'];
		for (const md of inputs) {
			expect(safeMarkdownRenderPort.render(md)).toEqual(safeMarkdownRender(md));
		}
	});

	it('never throws and never holds HTML in any output field', () => {
		const result = safeMarkdownRenderPort.render('<script>alert(1)</script> & `x`');
		const text = result.nodes
			.filter((n) => n.kind === 'paragraph')
			.flatMap((n) => n.spans.filter((s) => s.kind === 'text' || s.kind === 'code'))
			.map((s) => s.value)
			.join(' ');
		expect(text).toContain('<script>');
		expect(text).not.toContain('&lt;');
		expect(() => safeMarkdownRenderPort.render('`')).not.toThrow();
	});
});
