/**
 * T-CC-021 (RED) — `ChatComposer.vue` keyboard contract + send/stop (TEST-CC-009).
 *
 * SPEC-CC-021, EC-1/2/3/4. Enter sends (no shift, no IME, non-empty) and prevents
 * the newline; Shift+Enter / IME-Enter / empty do not submit; Esc while streaming
 * cancels; the control is send while idle (disabled when empty/streaming) and a
 * stop control while streaming. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-007, 008, 009, 010.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import { i18n } from '@/ui/i18n';
import { ChatComposerPageObject } from './ChatComposer.po';

function mountComposer(props: { isStreaming?: boolean } = {}) {
	const wrapper = mount(ChatComposer, {
		props: { isStreaming: props.isStreaming ?? false },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ChatComposerPageObject(wrapper) };
}

describe('ChatComposer (TEST-CC-009)', () => {
	it('renders the composer wrapper, textarea, and send control', () => {
		const { po } = mountComposer();
		expect(po.exists()).toBe(true);
		// `get` throws if absent, so a non-throwing access proves the elements render.
		expect(po.textarea.element.tagName).toBe('TEXTAREA');
		expect(po.send.element.tagName).toBe('BUTTON');
	});

	it('Enter (no shift, no IME, non-empty) emits submit and prevents the newline', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		const event = await po.pressEnter();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
		expect(event.defaultPrevented).toBe(true);
	});

	it('EC-1: empty/whitespace value does not submit on Enter', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('   ');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('EC-3: Shift+Enter does not submit (allows the newline)', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		const event = await po.pressEnter({ shift: true });
		expect(wrapper.emitted('submit')).toBeUndefined();
		expect(event.defaultPrevented).toBe(false);
	});

	it('EC-2: Enter during IME composition does not submit', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		await po.pressEnter({ composing: true });
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('clears the textarea after a successful submit', async () => {
		const { po } = mountComposer();
		await po.setValue('Hello');
		await po.pressEnter();
		expect(po.value()).toBe('');
	});

	it('send is disabled when empty and enabled when non-empty (idle)', async () => {
		const { po } = mountComposer();
		expect(po.sendDisabled()).toBe(true);
		await po.setValue('Hello');
		expect(po.sendDisabled()).toBe(false);
	});

	it('clicking send emits submit with the value', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		await po.clickSend();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
	});

	it('EC-4: while streaming the control is a stop button that emits cancel (not submit)', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.setValue('Hello');
		expect(po.sendDisabled()).toBe(false); // the stop control is active while streaming
		await po.clickSend();
		expect(wrapper.emitted('cancel')).toHaveLength(1);
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('EC-4: Enter does not start a second turn while streaming', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.setValue('Hello');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('Esc while streaming emits cancel (REQ-CC-010)', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.pressEsc();
		expect(wrapper.emitted('cancel')).toHaveLength(1);
	});

	it('Esc while idle does not emit cancel', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: false });
		await po.pressEsc();
		expect(wrapper.emitted('cancel')).toBeUndefined();
	});
});
