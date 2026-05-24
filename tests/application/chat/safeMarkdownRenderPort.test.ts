/**
 * T-CC-015 — `MarkdownRenderPort` adapter wrapping `safeMarkdownRender`.
 *
 * SPEC-CC-015 / SPEC-CC-007: the P1 markdown port `render(md)` delegates to `safeMarkdownRender`
 * — the resolved result is deep-equal to calling the transform directly. This is the object the
 * bridges return (SPEC-CC-013).
 *
 * ADR-RR-002 (supersedes ADR-RR-001 §3): `MarkdownRenderPort.render` is now **async**
 * (`Promise<SafeRenderResult>`) so the production Obsidian backing can `await` Obsidian's async
 * `MarkdownRenderer.render`. The pure `safeMarkdownRender` transform STAYS synchronous — the port
 * wrapper resolves `Promise.resolve(safeMarkdownRender(...))`.
 *
 * Traces: SPEC-CC-015, SPEC-CC-007, SPEC-CC-014, SPEC-RR-010/011, REQ-CC-006, NFR-CC-008, ADR-RR-002.
 */
import { describe, it, expect } from 'vitest';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { safeMarkdownRender } from '@/application/chat/safeMarkdownRender';

describe('safeMarkdownRenderPort (T-CC-015)', () => {
	it('implements the MarkdownRenderPort render method', () => {
		expect(typeof safeMarkdownRenderPort.render).toBe('function');
	});

	it('render(md) resolves deep-equal to safeMarkdownRender(md)', async () => {
		const inputs = ['', '   ', 'plain text', 'a `code` span\nbreak', 'one\n\ntwo', '<&>`'];
		for (const md of inputs) {
			expect(await safeMarkdownRenderPort.render(md)).toEqual(safeMarkdownRender(md));
		}
	});

	it('render(md) returns a Promise (ADR-RR-002 async seam)', () => {
		expect(safeMarkdownRenderPort.render('x')).toBeInstanceOf(Promise);
	});

	it('the pure safeMarkdownRender stays synchronous (not a Promise)', () => {
		expect(safeMarkdownRender('x')).not.toBeInstanceOf(Promise);
		expect(safeMarkdownRender('x').nodes).toBeInstanceOf(Array);
	});

	it('never rejects and never holds HTML in any output field', async () => {
		const result = await safeMarkdownRenderPort.render('<script>alert(1)</script> & `x`');
		const text = result.nodes
			.filter((n) => n.kind === 'paragraph')
			.flatMap((n) => n.spans.filter((s) => s.kind === 'text' || s.kind === 'code'))
			.map((s) => s.value)
			.join(' ');
		expect(text).toContain('<script>');
		expect(text).not.toContain('&lt;');
		await expect(safeMarkdownRenderPort.render('`')).resolves.toBeDefined();
	});
});
