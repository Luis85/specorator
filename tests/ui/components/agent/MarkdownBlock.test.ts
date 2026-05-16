/**
 * Tests for `MarkdownBlock.vue` (PR-ASV-7, agent-sidepanel-v2 D-ASV-5). Covers
 * each supported markdown construct (paragraph, bold, italic, inline code,
 * fenced code, links, lists, blockquote) plus XSS-safety: embedded HTML must
 * be escaped, never executed. The component is mounted directly because it
 * has no i18n / store dependencies.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';
import { MarkdownBlockPO } from './MarkdownBlock.po';

function mountBlock(text: string) {
	const wrapper = mount(MarkdownBlock, { props: { text } });
	return { wrapper, po: new MarkdownBlockPO(wrapper) };
}

describe('MarkdownBlock', () => {
	it('renders an empty wrapper for empty text', () => {
		const { po } = mountBlock('');
		expect(po.root.exists()).toBe(true);
		expect(po.paragraphs()).toHaveLength(0);
		expect(po.codeBlocks()).toHaveLength(0);
	});

	it('renders a plain paragraph', () => {
		const { po } = mountBlock('Hello, world.');
		expect(po.paragraphs()).toHaveLength(1);
		expect(po.paragraphs()[0].text()).toBe('Hello, world.');
	});

	it('renders two blank-line separated paragraphs', () => {
		const { po } = mountBlock('First.\n\nSecond.');
		expect(po.paragraphs()).toHaveLength(2);
		expect(po.paragraphs()[0].text()).toBe('First.');
		expect(po.paragraphs()[1].text()).toBe('Second.');
	});

	it('renders **bold** spans inside paragraphs', () => {
		const { po } = mountBlock('Make it **really** clear.');
		expect(po.strongs()).toHaveLength(1);
		expect(po.strongs()[0].text()).toBe('really');
	});

	it('renders *italic* spans inside paragraphs', () => {
		const { po } = mountBlock('A *small* aside.');
		expect(po.ems()).toHaveLength(1);
		expect(po.ems()[0].text()).toBe('small');
	});

	it('renders `inline code` spans', () => {
		const { po } = mountBlock('Run `npm test` to verify.');
		const codes = po.inlineCodes();
		expect(codes).toHaveLength(1);
		expect(codes[0].text()).toBe('npm test');
	});

	it('renders fenced ``` code blocks with their language hint', () => {
		const { po } = mountBlock('```ts\nconst x = 1;\n```');
		const blocks = po.codeBlocks();
		expect(blocks).toHaveLength(1);
		const codeEl = blocks[0].find('code');
		expect(codeEl.exists()).toBe(true);
		expect(codeEl.text()).toBe('const x = 1;');
		expect(codeEl.attributes('data-lang')).toBe('ts');
	});

	it('renders fenced code blocks without a language hint', () => {
		const { po } = mountBlock('```\nplain\n```');
		const blocks = po.codeBlocks();
		expect(blocks).toHaveLength(1);
		const codeEl = blocks[0].find('code');
		expect(codeEl.attributes('data-lang')).toBeUndefined();
	});

	it('does NOT reparse markdown inside fenced code blocks', () => {
		const { po } = mountBlock('```\n**not bold**\n```');
		expect(po.strongs()).toHaveLength(0);
		expect(po.codeBlocks()[0].text()).toContain('**not bold**');
	});

	it('renders links with a safe href and noopener rel', () => {
		const { po } = mountBlock('See [docs](https://example.com).');
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].text()).toBe('docs');
		expect(links[0].attributes('href')).toBe('https://example.com');
		expect(links[0].attributes('rel')).toBe('noopener noreferrer');
		expect(links[0].attributes('target')).toBe('_blank');
	});

	it('drops the href on links with a javascript: URI', () => {
		const { po } = mountBlock('[bad](javascript:alert(1))');
		const links = po.links();
		expect(links).toHaveLength(1);
		expect(links[0].attributes('href')).toBeUndefined();
		expect(links[0].text()).toBe('bad');
	});

	it('renders an unordered list', () => {
		const { po } = mountBlock('- one\n- two\n- three');
		expect(po.unorderedLists()).toHaveLength(1);
		expect(po.orderedLists()).toHaveLength(0);
		const items = po.listItems();
		expect(items).toHaveLength(3);
		expect(items[0].text()).toBe('one');
	});

	it('renders an ordered list', () => {
		const { po } = mountBlock('1. first\n2. second');
		expect(po.orderedLists()).toHaveLength(1);
		expect(po.listItems()).toHaveLength(2);
		expect(po.listItems()[1].text()).toBe('second');
	});

	it('renders a blockquote', () => {
		const { po } = mountBlock('> a quote\n> continues');
		expect(po.blockquotes()).toHaveLength(1);
		expect(po.blockquotes()[0].text()).toContain('a quote');
		expect(po.blockquotes()[0].text()).toContain('continues');
	});

	it('escapes embedded <script> tags as literal text', () => {
		const { po } = mountBlock('<script>alert(1)</script>');
		// No actual <script> element should be present in the rendered HTML.
		expect(po.root.findAll('script')).toHaveLength(0);
		// And the rendered HTML must show escaped angle brackets.
		const html = po.html();
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	it('does NOT execute an <img onerror> payload', () => {
		const { po } = mountBlock('<img src=x onerror=alert(1)>');
		// No <img> element should be created — markdown does not parse raw HTML.
		expect(po.root.findAll('img')).toHaveLength(0);
		const html = po.html();
		expect(html).toContain('&lt;img');
		expect(html).not.toContain('<img src');
	});

	it('escapes angle brackets inside fenced code blocks too', () => {
		const { po } = mountBlock('```\n<script>alert(1)</script>\n```');
		expect(po.root.findAll('script')).toHaveLength(0);
		const html = po.html();
		expect(html).toContain('&lt;script&gt;');
	});
});
