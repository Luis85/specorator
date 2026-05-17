/**
 * Tests for `MessageList.vue` — multi-turn message history rendering for the
 * dedicated agent sidepanel (IDEA-ASV-001, specs/agent-sidepanel-v2). Covers
 * the empty state, role-tagged rendering, the per-message trim notice, the
 * empty-text placeholder (assistant turn that produced only a proposal), and
 * thread isolation (a different `threadId` prop shows only that thread's
 * messages).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import MessageList from '@/ui/components/agent/MessageList.vue';
import { i18n } from '@/ui/i18n';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import { MessageListPO } from './MessageList.po';

function mountList(threadId: string | null) {
	const wrapper = mount(MessageList, {
		global: { plugins: [i18n] },
		props: { threadId },
	});
	return { wrapper, po: new MessageListPO(wrapper) };
}

/**
 * Returns the MessageList wrapper after configuring jsdom so the scroll
 * container reports a clientHeight/scrollHeight/scrollTop triple of our
 * choosing. jsdom omits layout, so we mock the geometry directly on the
 * element prototype slots that the component reads.
 *
 * When `lockScrollTop` is `true` (default) the setter is a no-op so the
 * component's rAF auto-scroll cannot pretend the user got back to the
 * bottom — useful for the "scrolled up" scenario where we need the
 * geometry to stay pinned.
 */
function mountWithScrollMetrics(
	threadId: string,
	metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
	options: { lockScrollTop?: boolean } = {},
) {
	const lockScrollTop = options.lockScrollTop ?? true;
	// Tests run in jsdom; `document.body` is the only mount target.
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- test-only mount
	const attachTarget = document.body;
	const wrapper = mount(MessageList, {
		global: { plugins: [i18n] },
		props: { threadId },
		attachTo: attachTarget,
	});
	const root = wrapper.find('[data-testid="agent-message-list"]').element as HTMLElement;
	Object.defineProperty(root, 'scrollHeight', {
		configurable: true,
		get: () => metrics.scrollHeight,
	});
	Object.defineProperty(root, 'clientHeight', {
		configurable: true,
		get: () => metrics.clientHeight,
	});
	Object.defineProperty(root, 'scrollTop', {
		configurable: true,
		get: () => metrics.scrollTop,
		set: (v: number) => {
			if (!lockScrollTop) metrics.scrollTop = v;
		},
	});
	return { wrapper, po: new MessageListPO(wrapper), metrics, root };
}

function msg(
	threadId: string,
	role: 'user' | 'assistant',
	overrides: Partial<ChatMessage> = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: overrides.text ?? `${role} text`,
		createdAt: overrides.createdAt ?? new Date().toISOString(),
		truncated: overrides.truncated,
	};
}

describe('MessageList', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders the empty-state copy when threadId is null', () => {
		const { po } = mountList(null);
		expect(po.empty.exists()).toBe(true);
		expect(po.root.exists()).toBe(false);
		expect(po.empty.text()).toContain('your conversation will appear here');
	});

	it('renders the empty-state copy when the thread has no messages', () => {
		const { po } = mountList('thread-empty');
		expect(po.empty.exists()).toBe(true);
		expect(po.root.exists()).toBe(false);
	});

	it('renders user and assistant turns for the active thread', async () => {
		const store = useMessagesStore();
		const tid = 'thread-1';
		store.appendMessage(msg(tid, 'user', { text: 'Hi there.' }));
		store.appendMessage(msg(tid, 'assistant', { text: 'Hello!' }));

		const { po } = mountList(tid);
		expect(po.root.exists()).toBe(true);
		expect(po.userMessages()).toHaveLength(1);
		expect(po.assistantMessages()).toHaveLength(1);
		expect(po.userMessages()[0].text()).toContain('Hi there.');
		expect(po.assistantMessages()[0].text()).toContain('Hello!');
	});

	it('renders the per-message trim notice when an assistant turn was truncated', () => {
		const store = useMessagesStore();
		const tid = 'thread-trim';
		store.appendMessage(msg(tid, 'user', { text: 'Q' }));
		store.appendMessage(msg(tid, 'assistant', { text: 'A', truncated: true }));

		const { po } = mountList(tid);
		expect(po.trimNotes()).toHaveLength(1);
	});

	it('renders the empty-text placeholder when an assistant turn has no body', () => {
		const store = useMessagesStore();
		const tid = 'thread-proposal-only';
		store.appendMessage(msg(tid, 'user', { text: 'Make me a file' }));
		store.appendMessage(msg(tid, 'assistant', { text: '' }));

		const { po } = mountList(tid);
		expect(po.emptyAssistantPlaceholders()).toHaveLength(1);
	});

	it('only renders messages from the active thread (isolation)', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('thread-a', 'user', { text: 'A-user' }));
		store.appendMessage(msg('thread-a', 'assistant', { text: 'A-assistant' }));
		store.appendMessage(msg('thread-b', 'user', { text: 'B-user' }));

		const { po } = mountList('thread-b');
		expect(po.userMessages()).toHaveLength(1);
		expect(po.assistantMessages()).toHaveLength(0);
		expect(po.userMessages()[0].text()).toContain('B-user');
	});

	it('renders bold markdown in an assistant turn (PR-ASV-7)', () => {
		const store = useMessagesStore();
		const tid = 'thread-bold';
		store.appendMessage(msg(tid, 'assistant', { text: 'Make it **really** clear.' }));
		const { po } = mountList(tid);
		const blocks = po.markdownBlocks();
		expect(blocks).toHaveLength(1);
		expect(blocks[0].findAll('strong')).toHaveLength(1);
		expect(blocks[0].find('strong').text()).toBe('really');
	});

	it('renders inline code from backticks (PR-ASV-7)', () => {
		const store = useMessagesStore();
		const tid = 'thread-inline-code';
		store.appendMessage(msg(tid, 'assistant', { text: 'Run `npm test` first.' }));
		const { po } = mountList(tid);
		const inline = po
			.markdownBlocks()[0]
			.findAll('code')
			.filter((c) => c.element.parentElement?.tagName !== 'PRE');
		expect(inline).toHaveLength(1);
		expect(inline[0].text()).toBe('npm test');
	});

	it('renders fenced code blocks from triple-backtick fences (PR-ASV-7)', () => {
		const store = useMessagesStore();
		const tid = 'thread-fence';
		store.appendMessage(msg(tid, 'assistant', { text: '```ts\nconst x = 1;\n```' }));
		const { po } = mountList(tid);
		const pre = po.markdownBlocks()[0].findAll('pre');
		expect(pre).toHaveLength(1);
		expect(pre[0].find('code').text()).toBe('const x = 1;');
	});

	it('escapes embedded HTML in message text (PR-ASV-7 XSS safety)', () => {
		const store = useMessagesStore();
		const tid = 'thread-xss';
		store.appendMessage(msg(tid, 'assistant', { text: '<script>alert(1)</script>' }));
		const { po } = mountList(tid);
		const html = po.markdownBlocks()[0].html();
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(po.markdownBlocks()[0].findAll('script')).toHaveLength(0);
	});

	it('exposes role="log" with the aria-live="polite" hint on the scroll container', () => {
		const store = useMessagesStore();
		const tid = 'thread-aria';
		store.appendMessage(msg(tid, 'user'));
		const { po } = mountList(tid);
		expect(po.root.attributes('role')).toBe('log');
		expect(po.root.attributes('aria-live')).toBe('polite');
	});

	describe('UX #8 (WP-8) — scroll-pin guard', () => {
		it('does not render the new-messages pill while the user is at the bottom', async () => {
			const store = useMessagesStore();
			const tid = 'thread-pin-bottom';
			store.appendMessage(msg(tid, 'user', { text: 'hi' }));
			// Start with metrics in "at the bottom" position. scrollTop is
			// at the maximum so the listener treats new content as auto-pin.
			const { po } = mountWithScrollMetrics(tid, {
				scrollHeight: 100,
				clientHeight: 100,
				scrollTop: 0,
			});
			store.appendMessage(msg(tid, 'assistant', { text: 'pong' }));
			await nextTick();
			expect(po.newMessagesPill.exists()).toBe(false);
		});

		it('shows the new-messages pill when content arrives while scrolled up', async () => {
			const store = useMessagesStore();
			const tid = 'thread-scrolled-up';
			store.appendMessage(msg(tid, 'user', { text: 'hello' }));
			store.appendMessage(msg(tid, 'assistant', { text: 'world' }));
			const { po, root } = mountWithScrollMetrics(tid, {
				scrollHeight: 1000,
				clientHeight: 200,
				scrollTop: 0, // scrolled way up
			});
			// Flush any rAF the watch may have queued on first mount.
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- jsdom-only test helper
			await new Promise<void>((resolve) => setTimeout(resolve, 32));
			// Re-assert the geometry survived the rAF (the setter is a
			// no-op so this should remain "scrolled up").
			expect(root.scrollTop).toBe(0);
			expect(root.scrollHeight).toBe(1000);
			expect(root.clientHeight).toBe(200);
			expect(root.scrollHeight - (root.scrollTop + root.clientHeight)).toBeGreaterThan(32);
			// Dispatch a native scroll event so the component caches the
			// "not at bottom" position. vue-test-utils' .trigger() doesn't
			// pass through to `@scroll.passive` reliably in jsdom.
			root.dispatchEvent(new Event('scroll'));
			await nextTick();
			store.appendMessage(msg(tid, 'assistant', { text: 'new content' }));
			// Two ticks: one for the watch callback to run, one for the
			// watch's own `await nextTick()` inside to flush.
			await nextTick();
			await nextTick();
			await nextTick();
			expect(po.newMessagesPill.exists()).toBe(true);
		});
	});

	describe('UX #11 (WP-8) — empty-state starter tiles', () => {
		it('renders four starter tiles in the empty state', () => {
			const { po } = mountList(null);
			expect(po.emptyTilesContainer.exists()).toBe(true);
			expect(po.emptyTiles()).toHaveLength(4);
		});

		it('emits tile-action with the tile key when a starter tile is clicked', async () => {
			const { wrapper, po } = mountList(null);
			await po.emptyTile('slash').trigger('click');
			const events = wrapper.emitted('tile-action')!;
			expect(events).toBeTruthy();
			expect(events[0]).toEqual(['slash']);
		});

		it('emits the correct key per tile (mention/send/escape)', async () => {
			const { wrapper, po } = mountList(null);
			await po.emptyTile('mention').trigger('click');
			await po.emptyTile('send').trigger('click');
			await po.emptyTile('escape').trigger('click');
			const events = wrapper.emitted('tile-action')!;
			expect(events.map((e) => e[0])).toEqual(['mention', 'send', 'escape']);
		});
	});
});
