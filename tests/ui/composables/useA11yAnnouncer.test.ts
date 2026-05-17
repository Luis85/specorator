/**
 * Tests for `useA11yAnnouncer` (WP-7, a11y P1 wave). Pinned to:
 *   - empty input is ignored,
 *   - non-empty input populates `message` on the next microtask,
 *   - consecutive identical announcements fire twice (the ref is cleared
 *     between writes so SRs observe a change),
 *   - `clear()` empties the ref,
 *   - unmount calls `clear()` (no pending timer leaks into a later test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useA11yAnnouncer, type UseA11yAnnouncer } from '@/ui/composables/useA11yAnnouncer';

function mountHarness(): {
	exposed: UseA11yAnnouncer;
	message: Readonly<Ref<string>>;
	unmount: () => void;
} {
	const captured: { value: UseA11yAnnouncer | null } = { value: null };
	const Host = defineComponent({
		setup() {
			captured.value = useA11yAnnouncer();
			return () => h('div');
		},
	});
	const wrapper = mount(Host);
	const exposed = captured.value;
	if (exposed === null) throw new Error('harness failed to capture useA11yAnnouncer');
	return {
		exposed,
		message: exposed.message,
		unmount: () => {
			wrapper.unmount();
		},
	};
}

describe('useA11yAnnouncer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts with an empty message', () => {
		const { message } = mountHarness();
		expect(message.value).toBe('');
	});

	it('ignores empty announcements', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('');
		exposed.announce('   ');
		vi.runAllTimers();
		expect(message.value).toBe('');
	});

	it('publishes a non-empty announcement on the next tick', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('Assistant replied.');
		// Cleared first so consecutive identical messages re-fire.
		expect(message.value).toBe('');
		vi.runAllTimers();
		expect(message.value).toBe('Assistant replied.');
	});

	it('re-fires the same message text twice (clears between writes)', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('Stream complete.');
		vi.runAllTimers();
		expect(message.value).toBe('Stream complete.');

		exposed.announce('Stream complete.');
		expect(message.value).toBe('');
		vi.runAllTimers();
		expect(message.value).toBe('Stream complete.');
	});

	it('replaces a pending announcement when a new one arrives before the timer fires', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('first');
		exposed.announce('second');
		vi.runAllTimers();
		expect(message.value).toBe('second');
	});

	it('clear() empties the message and cancels any pending timer', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('pending');
		exposed.clear();
		vi.runAllTimers();
		expect(message.value).toBe('');
	});

	it('unmount clears the message', () => {
		const { exposed, message, unmount } = mountHarness();
		exposed.announce('about to unmount');
		unmount();
		vi.runAllTimers();
		expect(message.value).toBe('');
	});

	it('trims whitespace from the published text', () => {
		const { exposed, message } = mountHarness();
		exposed.announce('   padded   ');
		vi.runAllTimers();
		expect(message.value).toBe('padded');
	});
});
