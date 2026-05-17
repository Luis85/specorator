/**
 * Tests for the pure markdown parser extracted from `MarkdownBlock.vue`
 * (WP-4 markdown hardening). Covers parser semantics PLUS the hardened
 * `safeHref` allowlist (rejection table for `javascript:`, `data:`,
 * `file:`, `blob:`, `vbscript:`, `about:`, `chrome:`, `chrome-extension:`,
 * `obsidian:`, and protocol-relative `//host`).
 *
 * jsdom test runner has no Obsidian popout windows, so the
 * `obsidianmd/prefer-active-doc` and `prefer-create-el` rules don't apply
 * to the synthetic DOM helpers below — `document` is the only global, and
 * `document.createElement('div')` is the standard way to construct a
 * detached container for `renderMarkdownInto` to write into.
 */
/* eslint-disable obsidianmd/prefer-active-doc, obsidianmd/prefer-create-el */
import { describe, it, expect } from 'vitest';
import {
	parseBlocks,
	parseInline,
	renderBlock,
	renderInline,
	renderMarkdownInto,
	safeHref,
} from '@/ui/components/agent/internal/markdown-parser';

describe('parseBlocks', () => {
	it('treats a blank-line separated text as multiple paragraphs', () => {
		const blocks = parseBlocks('First.\n\nSecond.');
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toEqual({ type: 'paragraph', text: 'First.' });
		expect(blocks[1]).toEqual({ type: 'paragraph', text: 'Second.' });
	});

	it('captures a fenced code block with a language hint', () => {
		const blocks = parseBlocks('```ts\nconst x = 1;\n```');
		expect(blocks).toEqual([{ type: 'code', lang: 'ts', text: 'const x = 1;' }]);
	});

	it('captures a fenced code block without a language hint', () => {
		const blocks = parseBlocks('```\nplain\n```');
		expect(blocks).toEqual([{ type: 'code', lang: null, text: 'plain' }]);
	});

	it('captures a blockquote across multiple lines', () => {
		const blocks = parseBlocks('> a quote\n> continues');
		expect(blocks).toEqual([{ type: 'blockquote', text: 'a quote\ncontinues' }]);
	});

	it('captures an unordered list', () => {
		const blocks = parseBlocks('- one\n- two\n- three');
		expect(blocks).toEqual([
			{ type: 'list', ordered: false, items: ['one', 'two', 'three'] },
		]);
	});

	it('captures an ordered list', () => {
		const blocks = parseBlocks('1. first\n2. second');
		expect(blocks).toEqual([{ type: 'list', ordered: true, items: ['first', 'second'] }]);
	});

	it('handles CRLF line endings', () => {
		const blocks = parseBlocks('First.\r\n\r\nSecond.');
		expect(blocks).toHaveLength(2);
		expect(blocks[0].type).toBe('paragraph');
		expect(blocks[1].type).toBe('paragraph');
	});

	it('returns an empty array for an empty source', () => {
		expect(parseBlocks('')).toEqual([]);
	});
});

describe('parseInline', () => {
	it('returns a single text token for plain text', () => {
		expect(parseInline('hello')).toEqual([{ type: 'text', text: 'hello' }]);
	});

	it('captures **bold** as a bold token', () => {
		const tokens = parseInline('a **strong** b');
		expect(tokens).toHaveLength(3);
		expect(tokens[1]).toMatchObject({ type: 'bold' });
	});

	it('captures *italic* as an italic token', () => {
		const tokens = parseInline('a *em* b');
		expect(tokens[1]).toMatchObject({ type: 'italic' });
	});

	it('captures `code` as a code token', () => {
		const tokens = parseInline('a `code` b');
		expect(tokens[1]).toEqual({ type: 'code', text: 'code' });
	});

	it('captures a link with balanced-paren URL', () => {
		const tokens = parseInline('see [label](https://example.com/x(y)) end');
		const linkTok = tokens.find((t) => t.type === 'link');
		expect(linkTok).toBeDefined();
		if (linkTok?.type !== 'link') throw new Error('expected link token');
		expect(linkTok.href).toBe('https://example.com/x(y)');
	});
});

describe('renderBlock + renderInline', () => {
	it('renders a paragraph into a <p> element via real DOM', () => {
		const block = { type: 'paragraph', text: 'Hello.' } as const;
		const el = renderBlock(document, block);
		expect(el.tagName).toBe('P');
		expect(el.className).toBe('sp-markdown__p');
		expect(el.textContent).toBe('Hello.');
	});

	it('renders a fenced code block into <pre><code data-lang>', () => {
		const el = renderBlock(document, {
			type: 'code',
			lang: 'ts',
			text: 'const x = 1;',
		});
		expect(el.tagName).toBe('PRE');
		const code = el.querySelector('code');
		expect(code).not.toBeNull();
		expect(code?.getAttribute('data-lang')).toBe('ts');
		expect(code?.textContent).toBe('const x = 1;');
	});

	it('renders an unsafe link without an href attribute', () => {
		const nodes = renderInline(document, [
			{
				type: 'link',
				href: 'javascript:alert(1)',
				children: [{ type: 'text', text: 'bad' }],
			},
		]);
		expect(nodes).toHaveLength(1);
		const a = nodes[0] as HTMLAnchorElement;
		expect(a.tagName).toBe('A');
		expect(a.hasAttribute('href')).toBe(false);
		expect(a.textContent).toBe('bad');
	});

	it('renders a safe link with href + rel="noopener noreferrer"', () => {
		const nodes = renderInline(document, [
			{
				type: 'link',
				href: 'https://example.com',
				children: [{ type: 'text', text: 'ok' }],
			},
		]);
		const a = nodes[0] as HTMLAnchorElement;
		expect(a.getAttribute('href')).toBe('https://example.com');
		expect(a.getAttribute('rel')).toBe('noopener noreferrer');
		expect(a.getAttribute('target')).toBe('_blank');
	});

	it('text nodes carry raw text (HTML is not parsed)', () => {
		const nodes = renderInline(document, [{ type: 'text', text: '<script>x</script>' }]);
		expect(nodes).toHaveLength(1);
		expect(nodes[0].nodeType).toBe(document.TEXT_NODE);
		expect(nodes[0].textContent).toBe('<script>x</script>');
	});
});

describe('renderMarkdownInto', () => {
	it('appends a wrapper subtree and the disposer removes it', () => {
		const container = document.createElement('div');
		const dispose = renderMarkdownInto({ source: 'Hello.', container });
		expect(container.querySelector('.sp-markdown')).not.toBeNull();
		expect(container.querySelector('p')).not.toBeNull();
		dispose();
		expect(container.querySelector('.sp-markdown')).toBeNull();
		expect(container.children).toHaveLength(0);
	});

	it('renders multiple blocks (paragraph + code fence)', () => {
		const container = document.createElement('div');
		renderMarkdownInto({
			source: 'First.\n\n```\nx\n```',
			container,
		});
		expect(container.querySelector('p')?.textContent).toBe('First.');
		expect(container.querySelector('pre code')?.textContent).toBe('x');
	});

	it('does not inject <script> elements for embedded HTML in source', () => {
		const container = document.createElement('div');
		renderMarkdownInto({ source: '<script>alert(1)</script>', container });
		expect(container.querySelectorAll('script')).toHaveLength(0);
		// The text survives as raw character data, escaped on serialisation.
		expect(container.textContent).toContain('<script>alert(1)</script>');
	});
});

describe('safeHref — rejection table (WP-4 hardening)', () => {
	const REJECTED: ReadonlyArray<{ scheme: string; href: string }> = [
		{ scheme: 'javascript:', href: 'javascript:alert(1)' },
		{ scheme: 'JAVASCRIPT: (uppercase)', href: 'JAVASCRIPT:alert(1)' },
		{ scheme: '\\tjavascript: (leading whitespace)', href: '\tjavascript:alert(1)' },
		{ scheme: 'data:', href: 'data:text/html,<script>1</script>' },
		{ scheme: 'file:', href: 'file:///etc/passwd' },
		{ scheme: 'blob:', href: 'blob:https://evil.example/x' },
		{ scheme: 'vbscript:', href: 'vbscript:msgbox(1)' },
		{ scheme: 'about:', href: 'about:blank' },
		{ scheme: 'chrome:', href: 'chrome://settings' },
		{ scheme: 'chrome-extension:', href: 'chrome-extension://abc/x' },
		{ scheme: 'obsidian:', href: 'obsidian://open?vault=x' },
		{ scheme: 'protocol-relative //host', href: '//evil.example.com/x' },
		{ scheme: 'bare hostname', href: 'evil.example.com' },
		{ scheme: 'empty', href: '' },
		{ scheme: 'whitespace-only', href: '   ' },
	];

	for (const { scheme, href } of REJECTED) {
		it(`rejects ${scheme}`, () => {
			expect(safeHref(href)).toBeNull();
		});
	}

	const ACCEPTED: ReadonlyArray<{ description: string; href: string; expected?: string }> = [
		{ description: 'https://', href: 'https://example.com' },
		{ description: 'http://', href: 'http://example.com' },
		{ description: 'mailto:', href: 'mailto:user@example.com' },
		{ description: 'HTTPS:// (uppercase)', href: 'HTTPS://example.com' },
		{ description: 'root-relative path', href: '/specs/foo' },
		{ description: 'fragment', href: '#section' },
		{
			description: 'leading whitespace around https',
			href: '  https://example.com  ',
			expected: 'https://example.com',
		},
	];

	for (const { description, href, expected } of ACCEPTED) {
		it(`accepts ${description}`, () => {
			expect(safeHref(href)).toBe(expected ?? href);
		});
	}
});
