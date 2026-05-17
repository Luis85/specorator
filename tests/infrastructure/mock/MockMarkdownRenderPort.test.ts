/**
 * Tests for `MockMarkdownRenderPort` (WP-4 markdown hardening). The mock
 * adapter writes DOM into the caller's container by delegating to the
 * shared pure parser; tests assert the rendered structure and the
 * disposer contract.
 *
 * jsdom test runner has no Obsidian popout windows, so the
 * `obsidianmd/prefer-active-doc` and `prefer-create-el` rules don't apply
 * here — `document` is the only DOM root in the test environment.
 */
/* eslint-disable obsidianmd/prefer-active-doc, obsidianmd/prefer-create-el */
import { describe, it, expect } from 'vitest';
import { MockMarkdownRenderPort } from '@/infrastructure/mock/MockMarkdownRenderPort';

describe('MockMarkdownRenderPort', () => {
	it('renders a paragraph into the provided container', async () => {
		const port = new MockMarkdownRenderPort();
		const container = document.createElement('div');
		const dispose = await port.render({ markdown: 'Hello.', container });
		expect(container.querySelector('p')?.textContent).toBe('Hello.');
		dispose();
		expect(container.querySelector('p')).toBeNull();
	});

	it('renders a fenced code block', async () => {
		const port = new MockMarkdownRenderPort();
		const container = document.createElement('div');
		await port.render({ markdown: '```ts\nconst x = 1;\n```', container });
		const code = container.querySelector('pre code');
		expect(code?.textContent).toBe('const x = 1;');
		expect(code?.getAttribute('data-lang')).toBe('ts');
	});

	it('drops unsafe link hrefs (javascript:)', async () => {
		const port = new MockMarkdownRenderPort();
		const container = document.createElement('div');
		await port.render({ markdown: '[bad](javascript:alert(1))', container });
		const a = container.querySelector('a');
		expect(a).not.toBeNull();
		expect(a?.hasAttribute('href')).toBe(false);
	});

	it('disposer only removes the wrapper, leaving sibling nodes intact', async () => {
		const port = new MockMarkdownRenderPort();
		const container = document.createElement('div');
		const sibling = document.createElement('span');
		sibling.textContent = 'keep me';
		container.appendChild(sibling);
		const dispose = await port.render({ markdown: 'text', container });
		expect(container.children).toHaveLength(2);
		dispose();
		expect(container.children).toHaveLength(1);
		expect(container.firstChild).toBe(sibling);
	});

	it('ignores sourcePath (not required for the mock adapter)', async () => {
		const port = new MockMarkdownRenderPort();
		const container = document.createElement('div');
		await port.render({ markdown: 'hi', container, sourcePath: 'specs/x.md' });
		expect(container.textContent).toContain('hi');
	});
});
