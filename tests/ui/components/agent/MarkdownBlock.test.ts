/**
 * Tests for `MarkdownBlock.vue` (PR-ASV-7 + WP-4 markdown hardening). The
 * component now requires `MARKDOWN_RENDER_PORT` to be provided (WP-4 port-
 * only invariant); the in-component fallback parser is gone. The unit
 * tests wire `MockMarkdownRenderPort`, which delegates to the same pure
 * parser the SFC used to embed — so the user-facing markdown output is
 * unchanged for completed turns.
 *
 * Streaming-bypass coverage (WP-4): when `:streaming="true"`, the
 * component renders `text` as raw `<pre>` content with no port round-trip
 * — closes the audit's per-token native-renderer flicker.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { MockMarkdownRenderPort } from '@/infrastructure/mock/MockMarkdownRenderPort';
import { MarkdownBlockPO } from './MarkdownBlock.po';

function mountBlock(text: string, options: { streaming?: boolean } = {}) {
	const wrapper = mount(MarkdownBlock, {
		props: { text, streaming: options.streaming ?? false },
		global: {
			provide: {
				[MARKDOWN_RENDER_PORT as symbol]: new MockMarkdownRenderPort(),
			},
		},
	});
	return { wrapper, po: new MarkdownBlockPO(wrapper) };
}

async function flushPortRender(): Promise<void> {
	// Several ticks: the `flush: 'post'` watcher fires after mount, dispatches
	// `renderPort.render` (async — Promise<() => void>), and only then does
	// the awaited disposer-returning microtask land DOM into the container.
	await nextTick();
	await nextTick();
	await nextTick();
	await nextTick();
}

describe('MarkdownBlock — port-only path', () => {
	it('renders an empty wrapper for empty text', async () => {
		const { po } = mountBlock('');
		await flushPortRender();
		expect(po.root.exists()).toBe(true);
		expect(po.paragraphs()).toHaveLength(0);
		expect(po.codeBlocks()).toHaveLength(0);
	});

	it('renders a plain paragraph', async () => {
		const { po } = mountBlock('Hello, world.');
		await flushPortRender();
		expect(po.paragraphs()).toHaveLength(1);
		expect(po.paragraphs()[0].text()).toBe('Hello, world.');
	});

	it('renders two blank-line separated paragraphs', async () => {
		const { po } = mountBlock('First.\n\nSecond.');
		await flushPortRender();
		expect(po.paragraphs()).toHaveLength(2);
		expect(po.paragraphs()[0].text()).toBe('First.');
		expect(po.paragraphs()[1].text()).toBe('Second.');
	});

	it('renders **bold** spans inside paragraphs', async () => {
		const { po } = mountBlock('Make it **really** clear.');
		await flushPortRender();
		expect(po.strongs()).toHaveLength(1);
		expect(po.strongs()[0].text()).toBe('really');
	});

	it('renders *italic* spans inside paragraphs', async () => {
		const { po } = mountBlock('A *small* aside.');
		await flushPortRender();
		expect(po.ems()).toHaveLength(1);
		expect(po.ems()[0].text()).toBe('small');
	});

	it('renders `inline code` spans', async () => {
		const { po } = mountBlock('Run `npm test` to verify.');
		await flushPortRender();
		const codes = po.inlineCodes();
		expect(codes).toHaveLength(1);
		expect(codes[0].text()).toBe('npm test');
	});

	it('renders fenced ``` code blocks with their language hint', async () => {
		const { po } = mountBlock('```ts\nconst x = 1;\n```');
		await flushPortRender();
		const blocks = po.codeBlocks();
		expect(blocks).toHaveLength(1);
		const codeEl = blocks[0].find('code');
		expect(codeEl.exists()).toBe(true);
		expect(codeEl.text()).toBe('const x = 1;');
		expect(codeEl.attributes('data-lang')).toBe('ts');
	});

	it('renders fenced code blocks without a language hint', async () => {
		const { po } = mountBlock('```\nplain\n```');
		await flushPortRender();
		const blocks = po.codeBlocks();
		expect(blocks).toHaveLength(1);
		const codeEl = blocks[0].find('code');
		expect(codeEl.attributes('data-lang')).toBeUndefined();
	});

	it('does NOT reparse markdown inside fenced code blocks', async () => {
		const { po } = mountBlock('```\n**not bold**\n```');
		await flushPortRender();
		expect(po.strongs()).toHaveLength(0);
		expect(po.codeBlocks()[0].text()).toContain('**not bold**');
	});

	it('renders links with a safe href and noopener rel', async () => {
		const { po } = mountBlock('See [docs](https://example.com).');
		await flushPortRender();
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].text()).toBe('docs');
		expect(links[0].attributes('href')).toBe('https://example.com');
		expect(links[0].attributes('rel')).toBe('noopener noreferrer');
		expect(links[0].attributes('target')).toBe('_blank');
	});

	it('drops the href on links with a javascript: URI', async () => {
		const { po } = mountBlock('[bad](javascript:alert(1))');
		await flushPortRender();
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].attributes('href')).toBeUndefined();
		expect(links[0].text()).toBe('bad');
	});

	it('parses balanced parentheses inside a link URL', async () => {
		const { po } = mountBlock('See [spec](https://example.com/foo(bar)) here.');
		await flushPortRender();
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].text()).toBe('spec');
		expect(links[0].attributes('href')).toBe('https://example.com/foo(bar)');
	});

	it('parses nested balanced parens inside a link URL', async () => {
		const { po } = mountBlock(
			'Read [it](https://en.wikipedia.org/wiki/Foo_(disambiguation)) now.',
		);
		await flushPortRender();
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].attributes('href')).toBe(
			'https://en.wikipedia.org/wiki/Foo_(disambiguation)',
		);
	});

	it('renders an unordered list', async () => {
		const { po } = mountBlock('- one\n- two\n- three');
		await flushPortRender();
		expect(po.unorderedLists()).toHaveLength(1);
		expect(po.orderedLists()).toHaveLength(0);
		const items = po.listItems();
		expect(items).toHaveLength(3);
		expect(items[0].text()).toBe('one');
	});

	it('renders an ordered list', async () => {
		const { po } = mountBlock('1. first\n2. second');
		await flushPortRender();
		expect(po.orderedLists()).toHaveLength(1);
		expect(po.listItems()).toHaveLength(2);
		expect(po.listItems()[1].text()).toBe('second');
	});

	it('renders a blockquote', async () => {
		const { po } = mountBlock('> a quote\n> continues');
		await flushPortRender();
		expect(po.blockquotes()).toHaveLength(1);
		expect(po.blockquotes()[0].text()).toContain('a quote');
		expect(po.blockquotes()[0].text()).toContain('continues');
	});

	it('escapes embedded <script> tags as literal text', async () => {
		const { po } = mountBlock('<script>alert(1)</script>');
		await flushPortRender();
		expect(po.root.findAll('script')).toHaveLength(0);
		const html = po.html();
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	it('does NOT execute an <img onerror> payload', async () => {
		const { po } = mountBlock('<img src=x onerror=alert(1)>');
		await flushPortRender();
		expect(po.root.findAll('img')).toHaveLength(0);
		const html = po.html();
		expect(html).toContain('&lt;img');
		expect(html).not.toContain('<img src');
	});

	it('escapes angle brackets inside fenced code blocks too', async () => {
		const { po } = mountBlock('```\n<script>alert(1)</script>\n```');
		await flushPortRender();
		expect(po.root.findAll('script')).toHaveLength(0);
		const html = po.html();
		expect(html).toContain('&lt;script&gt;');
	});

	it('throws at mount when MARKDOWN_RENDER_PORT is not provided', () => {
		expect(() => mount(MarkdownBlock, { props: { text: 'hi' } })).toThrow(
			/MarkdownBlock requires MARKDOWN_RENDER_PORT/,
		);
	});
});

describe('MarkdownBlock — streaming bypass', () => {
	it('renders <pre> raw text and skips the port while streaming', async () => {
		const { wrapper, po } = mountBlock('partial **markdown** here', { streaming: true });
		await flushPortRender();
		// <pre> root, not the port container.
		expect(po.root.element.tagName).toBe('PRE');
		// No markdown parsing while streaming — `**markdown**` survives as text.
		expect(po.root.text()).toContain('**markdown**');
		expect(po.strongs()).toHaveLength(0);
		// No port-rendered <p>/<a> nodes either.
		expect(po.paragraphs()).toHaveLength(0);
		expect(wrapper.findAll('a')).toHaveLength(0);
	});

	it('flips to port-rendered DOM once streaming completes', async () => {
		const { wrapper, po } = mountBlock('Hello **world**.', { streaming: true });
		await flushPortRender();
		expect(po.root.element.tagName).toBe('PRE');
		await wrapper.setProps({ streaming: false });
		await flushPortRender();
		// Now the port branch is mounted as a <div>; strong markup is parsed.
		expect(po.root.element.tagName).toBe('DIV');
		expect(po.strongs()).toHaveLength(1);
		expect(po.strongs()[0].text()).toBe('world');
	});
});
