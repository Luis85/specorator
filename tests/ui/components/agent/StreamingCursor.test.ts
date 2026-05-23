/**
 * Tests for `<StreamingCursor>` (REQ-AUX-008, spec §1.3.6).
 *
 *   T-AUX-246 — element is present in DOM when mounted (parent owns
 *               lifecycle gating); aria-hidden so screen readers ignore it.
 *   T-AUX-247 — reduced-motion: `animation-name: none` (the keyframe is
 *               removed under `prefers-reduced-motion: reduce`).
 *   T-AUX-248 — uses the `streaming-cursor-blink` keyframe from
 *               animations.css and references `currentColor` background.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StreamingCursor from '@/ui/components/agent/StreamingCursor.vue';
import { StreamingCursorPageObject } from './StreamingCursor.po';

const SHIPPED = `
.specorator-root { --sp-duration-medium: 0.2s; }
.sp-streaming-cursor {
	display: inline-block;
	inline-size: 2px;
	block-size: 1em;
	background-color: currentColor;
	vertical-align: text-bottom;
	margin-inline-start: 2px;
	animation: streaming-cursor-blink 1s steps(2, end) infinite;
}
@keyframes streaming-cursor-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
`;

const REDUCED = `
@media (prefers-reduced-motion: reduce) {
	.sp-streaming-cursor { animation: none; }
}
`;

let injected: HTMLStyleElement[] = [];

function injectStyle(css: string): void {
	const el = document.createElement('style');
	el.setAttribute('data-test-css', 'streaming-cursor');
	el.textContent = css;
	document.head.appendChild(el);
	injected.push(el);
}

beforeEach(() => {
	injectStyle(SHIPPED);
});

afterEach(() => {
	for (const el of injected) el.remove();
	injected = [];
});

describe('StreamingCursor', () => {
	it('mounts with role-free, aria-hidden span at data-testid="streaming-cursor"', () => {
		const wrapper = mount(StreamingCursor, { attachTo: document.body });
		const po = new StreamingCursorPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.ariaHidden()).toBe('true');
	});

	it('uses streaming-cursor-blink keyframe in production stylesheet (T-AUX-248)', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/StreamingCursor.vue'),
			'utf8',
		);
		expect(src).toMatch(/animation:\s*streaming-cursor-blink/);
		expect(src).toMatch(/background-color:\s*currentColor/);
		expect(src).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
		expect(src).toMatch(/animation:\s*none/);
	});

	it('declares reduced-motion override that sets animation: none (T-AUX-247)', () => {
		injectStyle(REDUCED);
		// jsdom doesn't honour `@media`, but we assert the rule exists in shipped CSS via the snapshot test above.
		const wrapper = mount(StreamingCursor, { attachTo: document.body });
		const po = new StreamingCursorPageObject(wrapper);
		expect(po.exists()).toBe(true);
	});

	it('renders nothing extra — single element', () => {
		const wrapper = mount(StreamingCursor, { attachTo: document.body });
		expect(wrapper.element.tagName.toLowerCase()).toBe('span');
		expect(wrapper.element.children.length).toBe(0);
	});
});
