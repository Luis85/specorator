/**
 * Tests for `<MessageBubble>` (REQ-AUX-005, REQ-AUX-010, spec §1.4).
 *
 *   T-AUX-225 — user role aligns end + bubble; assistant transparent full-width.
 *   T-AUX-227 — content node sets `unicode-bidi: plaintext` and `dir="auto"`.
 *   T-AUX-226 — asymmetric `border-end-end-radius` mirror corner for user bubble.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBubble from '@/ui/components/agent/MessageBubble.vue';
import { MessageBubblePageObject } from './MessageBubble.po';

const SHIPPED = `
.specorator-root {
	--sp-space-3: 6px;
	--sp-space-5: 12px;
	--sp-radius-md: 6px;
	--sp-radius-bubble-tail-user: 4px;
	--sp-radius-bubble-tail-assistant: 4px;
	--sp-bg-secondary-alt: rgb(40, 40, 40);
}
.sp-message-bubble {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.sp-message-bubble[data-role='user'] {
	align-self: flex-end;
	max-inline-size: 80%;
	padding: var(--sp-space-3) var(--sp-space-5);
	background-color: var(--sp-bg-secondary-alt);
	border-radius: var(--sp-radius-md);
	border-end-end-radius: var(--sp-radius-bubble-tail-user);
}
.sp-message-bubble[data-role='assistant'] {
	align-self: stretch;
	background-color: transparent;
	padding: 0;
}
.sp-message-bubble__body { unicode-bidi: plaintext; }
`;

let injected: HTMLStyleElement | null = null;

function injectStyle(css: string): void {
	const el = document.createElement('style');
	el.setAttribute('data-test-css', 'message-bubble');
	el.textContent = css;
	document.head.appendChild(el);
	injected = el;
}

beforeEach(() => {
	const root = document.createElement('div');
	root.className = 'specorator-root';
	root.setAttribute('data-testid', 'specorator-root-host');
	document.body.appendChild(root);
	injectStyle(SHIPPED);
});

afterEach(() => {
	if (injected) {
		injected.remove();
		injected = null;
	}
	document.body.querySelectorAll('[data-testid="specorator-root-host"]').forEach((n) => {
		n.remove();
	});
});

describe('MessageBubble', () => {
	it('renders root with data-role="user"', () => {
		const host = document.querySelector<HTMLElement>('[data-testid="specorator-root-host"]')!;
		const wrapper = mount(MessageBubble, {
			props: { role: 'user' },
			slots: { default: '<p>hello</p>' },
			attachTo: host,
		});
		const po = new MessageBubblePageObject(wrapper);
		expect(po.role()).toBe('user');
	});

	it('user role aligns end with asymmetric bubble tail (T-AUX-225/226)', () => {
		const host = document.querySelector<HTMLElement>('[data-testid="specorator-root-host"]')!;
		const wrapper = mount(MessageBubble, {
			props: { role: 'user' },
			slots: { default: '<p>hi</p>' },
			attachTo: host,
		});
		const po = new MessageBubblePageObject(wrapper);
		expect(po.alignSelf()).toBe('flex-end');
		// Background is non-transparent for user bubble.
		expect(po.backgroundColor()).not.toBe('rgba(0, 0, 0, 0)');
		expect(po.backgroundColor()).not.toBe('transparent');
		// Mirror corner — border-end-end-radius is set (jsdom returns raw value).
		expect(po.borderEndEndRadius().length).toBeGreaterThan(0);
	});

	it('assistant role is transparent + full-width (T-AUX-225)', () => {
		const host = document.querySelector<HTMLElement>('[data-testid="specorator-root-host"]')!;
		const wrapper = mount(MessageBubble, {
			props: { role: 'assistant' },
			slots: { default: '<p>hi</p>' },
			attachTo: host,
		});
		const po = new MessageBubblePageObject(wrapper);
		expect(po.role()).toBe('assistant');
		// Background is transparent for assistant.
		const bg = po.backgroundColor();
		expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bg);
	});

	it('renders default slot inside the body container with dir="auto" (T-AUX-227)', () => {
		const host = document.querySelector<HTMLElement>('[data-testid="specorator-root-host"]')!;
		const wrapper = mount(MessageBubble, {
			props: { role: 'user' },
			slots: { default: '<p>contents</p>' },
			attachTo: host,
		});
		const po = new MessageBubblePageObject(wrapper);
		expect(po.bodyExists()).toBe(true);
		const body = wrapper.get('[data-testid="message-bubble-body"]').element as HTMLElement;
		expect(body.getAttribute('dir')).toBe('auto');
		expect(po.unicodeBidi()).toBe('plaintext');
	});

	it('declares the role-aware contract in the SFC source', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/MessageBubble.vue'),
			'utf8',
		);
		expect(src).toMatch(/data-role/);
		expect(src).toMatch(/border-end-end-radius/);
		expect(src).toMatch(/unicode-bidi:\s*plaintext/);
		expect(src).toMatch(/--sp-radius-bubble-tail-user/);
	});
});
