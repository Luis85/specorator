/**
 * T-CC-025 (RED) — `ChatSurface.vue` state wiring (TEST-CC-004/005/006/010/011 +
 * TEST-CC-013 A leg).
 *
 * SPEC-CC-018, EC-4/6/7/8. The container shows welcome vs message-list by isEmpty;
 * a busy indicator (`chat-busy`, aria-live=polite) while streaming; wires composer
 * submit→sendMessage, cancel→cancelTurn; accumulate observable per tick →
 * "Hello world" before done; done finalises + composer re-enabled; cancel marks
 * interrupted + idle; scripted error and ensureReady→false render inline / surface
 * a notice + idle, no blocking dialog / no innerHTML. The surface builds the
 * RunChatTurnUseCase from the injected runtime. Queried by `data-testid` only.
 *
 * Traces: REQ-CC-003, 005, 009, 010, 012.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import { i18n } from '@/ui/i18n';
import {
	CHAT_RUNTIME_PORT,
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
} from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { ChatRuntimePort, StreamChunk, NotificationPort, LoggerPort } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

/**
 * A step-gated runtime: each `yield` waits until the test calls `step()`, so the
 * surface's accumulate/cancel/error/done transitions are observable per tick.
 */
class ControllableRuntime extends MockChatRuntime {
	private gate: (() => void) | null = null;
	private readonly queued: StreamChunk[] = [];
	ready = true;

	constructor() {
		super([]);
	}

	override ensureReady(): Promise<boolean> {
		return Promise.resolve(this.ready);
	}

	override async *query(): AsyncGenerator<StreamChunk> {
		for (;;) {
			if (this.queued.length === 0) {
				await new Promise<void>((resolve) => (this.gate = resolve));
			}
			const chunk = this.queued.shift();
			if (chunk === undefined) continue;
			if (chunk.type === 'done') {
				yield chunk;
				return;
			}
			yield chunk;
		}
	}

	emit(chunk: StreamChunk): void {
		this.queued.push(chunk);
		this.gate?.();
		this.gate = null;
	}
}

function notifySpy(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function mountSurface(runtime: ChatRuntimePort, notify: NotificationPort = notifySpy()) {
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_PORT as symbol]: runtime,
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notify,
				[LOGGER_PORT as symbol]: logger,
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper), notify };
}

describe('ChatSurface (SPEC-CC-018)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('mounts with data-provider="claude" and shows the welcome state when empty', () => {
		const { po } = mountSurface(new ControllableRuntime());
		expect(po.exists()).toBe(true);
		expect(po.providerAttr()).toBe('claude');
		expect(po.showsWelcome()).toBe(true);
		expect(po.showsMessageList()).toBe(false);
	});

	it('TEST-CC-004/010: sending shows the message list + a busy indicator with aria-live=polite', async () => {
		const runtime = new ControllableRuntime();
		const { po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		await flushPromises();
		expect(po.showsWelcome()).toBe(false);
		expect(po.showsMessageList()).toBe(true);
		expect(po.showsBusy()).toBe(true);
		expect(po.busyAriaLive()).toBe('polite');
		expect(po.sendDisabled()).toBe(false); // stop control active while streaming
	});

	it('TEST-CC-005: accumulates text observably per tick before done', async () => {
		const runtime = new ControllableRuntime();
		const { wrapper, po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		runtime.emit({ type: 'text', content: 'Hello' });
		await flushPromises();
		expect(po.assistantText()).toContain('Hello');
		runtime.emit({ type: 'text', content: ' world' });
		await flushPromises();
		expect(po.assistantText()).toContain('Hello world');
		runtime.emit({ type: 'done' });
		await flushPromises();
		expect(wrapper.find('[data-testid="chat-busy"]').exists()).toBe(false);
	});

	it('TEST-CC-006: done finalises to idle and re-enables the composer', async () => {
		const runtime = new ControllableRuntime();
		const { po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		runtime.emit({ type: 'text', content: 'Reply' });
		runtime.emit({ type: 'done' });
		await flushPromises();
		expect(po.showsBusy()).toBe(false);
		expect(po.sendDisabled()).toBe(true); // idle + empty composer → send disabled
	});

	it('TEST-CC-011: cancel marks the partial assistant turn Interrupted and returns to idle', async () => {
		const runtime = new ControllableRuntime();
		const { po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		runtime.emit({ type: 'text', content: 'partial' });
		await flushPromises();
		await po.clickStop();
		await flushPromises();
		expect(po.hasInterruptedBadge()).toBe(true);
		expect(po.showsBusy()).toBe(false);
	});

	it('TEST-CC-013 A leg: a scripted error chunk renders inline and returns to idle', async () => {
		const runtime = new ControllableRuntime();
		const { wrapper, po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		runtime.emit({ type: 'text', content: 'partial' });
		runtime.emit({ type: 'error', content: ' [failed]' });
		runtime.emit({ type: 'done' });
		await flushPromises();
		expect(po.assistantText()).toContain('partial [failed]');
		expect(po.showsBusy()).toBe(false);
		// No blocking dialog / no raw HTML injection.
		expect(wrapper.html()).not.toContain('<script>');
	});

	it('REQ-RR-024: a usage chunk renders the turn-level UsageInfo in the surface footer', async () => {
		const runtime = new ControllableRuntime();
		const { po } = mountSurface(runtime);
		// No usage element before any usage chunk arrives (REQ-RR-024a / EC-RR-12).
		expect(po.showsUsage()).toBe(false);
		await po.typeAndSend('Hi');
		runtime.emit({ type: 'text', content: 'Reply' });
		runtime.emit({
			type: 'usage',
			usage: {
				model: 'mock',
				inputTokens: 12,
				contextWindow: 200000,
				contextTokens: 1234,
				percentage: 1,
			},
			sessionId: 'mock-session',
		});
		runtime.emit({ type: 'done' });
		await flushPromises();
		expect(po.showsUsage()).toBe(true);
		expect(po.usageText()).toContain('1234');
	});

	it('TEST-CC-013 A leg: ensureReady=false surfaces a sticky notice with no dangling live message', async () => {
		const runtime = new ControllableRuntime();
		runtime.ready = false;
		const { po, notify } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		await flushPromises();
		expect(notify.showError).toHaveBeenCalledTimes(1);
		expect(po.showsBusy()).toBe(false);
		// The user turn exists; no live assistant message dangles (no assistant turn).
		expect(po.hasInterruptedBadge()).toBe(false);
	});
});
