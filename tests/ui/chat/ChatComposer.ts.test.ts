/**
 * T-CP-045 (RED) — `ChatComposer.vue` P4 extension (TEST-CP-023).
 *
 * SPEC-CP-019, SPEC-CP-031. The keydown handler first calls
 * `useComposerMode().handleKeydown(event)` and only falls through to the
 * unchanged P1 Enter/Shift+Enter/IME logic when it returns `false` &&
 * `kind==='default'` (default-Enter sends; `/` opens the palette and send does
 * NOT fire; Escape restores `look at @no` intact, EC-CP-4). The textarea gains
 * the combobox ARIA + mode-border classes from `mode.kind`/`planActive`;
 * `inline-block` mode hides the textarea+toolbar and renders the active block
 * sibling, the composer restored after the last resolves (REQ-CP-027); bang-bash
 * mode switches to monospace + the run-command placeholder. Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-020/021/027/029/034/035/036, NFR-CP-008/009.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import { i18n } from '@/ui/i18n';
import { useComposerMode, type ComposerModeApi } from '@/ui/chat/composer/useComposerMode';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import { SubmitBangBashUseCase } from '@/application/chat/composer/SubmitBangBashUseCase';
import { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import {
	MockMentionDataProvider,
	MockProviderCommandCatalog,
	MockShellExec,
} from '@/infrastructure/mock/MockComposerPorts';
import type { NotificationPort } from '@/domain/ports';
import { ChatComposerPageObject } from './ChatComposer.po';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

/**
 * Build a real arbiter wired so the composer can drive it. `getValue`/`getCaret`
 * read a mutable holder the test updates as it types (the composer mirrors them).
 */
function buildArbiter(runtime: MockChatRuntime) {
	const holder = { value: '', caret: 0 };
	const arbiter = useComposerMode({
		runCommand: new RunCommandUseCase(),
		resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
		submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
		catalog: new MockProviderCommandCatalog(),
		runtime,
		onInsert: (value, caret) => {
			holder.value = value;
			holder.caret = caret;
		},
		onAction: vi.fn(),
		onBangBashOutput: vi.fn(),
		getValue: () => holder.value,
		getCaret: () => holder.caret,
	});
	return { arbiter, holder };
}

function mountComposer(opts: {
	isStreaming?: boolean;
	arbiter?: ComposerModeApi;
	respond?: RespondToInlineBlockUseCase;
	supportsInlineResponse?: boolean;
	notify?: NotificationPort;
} = {}) {
	const wrapper = mount(ChatComposer, {
		props: {
			isStreaming: opts.isStreaming ?? false,
			composer: opts.arbiter,
			respond: opts.respond,
			supportsInlineResponse: opts.supportsInlineResponse,
			notify: opts.notify,
		},
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ChatComposerPageObject(wrapper) };
}

describe('ChatComposer P4 extension — send gate (TEST-CP-023, EC-CP-4)', () => {
	it('default-Enter still sends (P1 contract preserved)', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { wrapper, po } = mountComposer({ arbiter });
		await po.setValue('Hello');
		const event = await po.pressEnter();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
		expect(event.defaultPrevented).toBe(true);
	});

	it('"/" opens the palette and Enter does NOT send (send suppressed)', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { wrapper, po } = mountComposer({ arbiter });
		await po.typeValue('/');
		expect(po.hasDropdown()).toBe(true);
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('combobox ARIA: the textarea advertises role + aria-expanded when a palette is open', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { po } = mountComposer({ arbiter });
		expect(po.textareaRole()).toBe('combobox');
		await po.typeValue('/');
		expect(po.ariaExpanded()).toBe('true');
	});

	it('EC-CP-4: Escape closes the palette and leaves "look at @no" intact', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { po } = mountComposer({ arbiter });
		await po.typeValue('look at @no');
		expect(po.hasDropdown()).toBe(true);
		await po.textarea.trigger('keydown', { key: 'Escape' });
		expect(po.hasDropdown()).toBe(false);
		expect(po.value()).toBe('look at @no');
	});
});

describe('ChatComposer P4 extension — mode borders + bang-bash (TEST-CP-023)', () => {
	it('plan-mode toggles the PLAN indicator on a capable runtime (Shift+Tab)', async () => {
		const runtime = new MockChatRuntime([]);
		runtime.setSupportsPlanMode(true);
		const { arbiter } = buildArbiter(runtime);
		const { po } = mountComposer({ arbiter });
		await po.textarea.trigger('keydown', { key: 'Tab', shiftKey: true });
		expect(po.hasPlanIndicator()).toBe(true);
		expect(po.composerClasses()).toContain('sp-chat-composer--plan');
	});

	it('bang-bash mode switches the textarea to monospace + the run-command placeholder', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { po } = mountComposer({ arbiter });
		await po.typeValue('!');
		expect(po.composerClasses()).toContain('sp-chat-composer--bang-bash');
	});

	it('instruction mode sets the instruction-mode border', async () => {
		const runtime = new MockChatRuntime([]);
		const { arbiter } = buildArbiter(runtime);
		const { po } = mountComposer({ arbiter });
		await po.typeValue('#');
		expect(po.composerClasses()).toContain('sp-chat-composer--instruction');
	});
});

describe('ChatComposer P4 extension — inline-block hide/restore (REQ-CP-027)', () => {
	it('hides the textarea while an inline block is active and renders the block', async () => {
		const runtime = new MockChatRuntime([]);
		runtime.setSupportsInlineResponse(true);
		const { arbiter } = buildArbiter(runtime);
		const respond = new RespondToInlineBlockUseCase(runtime);
		const notify = fakeNotify();
		const { po, wrapper } = mountComposer({
			arbiter,
			respond,
			supportsInlineResponse: true,
			notify,
		});
		arbiter.enqueueInlineBlock({
			kind: 'ask_user_question',
			request: {
				requestId: 'r1',
				questions: [{ id: 'q', question: 'Pick', options: [{ id: 'a', label: 'A' }] }],
			},
		});
		await wrapper.vm.$nextTick();
		expect(po.hasInlineAsk()).toBe(true);
		expect(po.textareaExists()).toBe(false);
		// Restored after the block resolves.
		arbiter.resolveInlineBlock();
		await wrapper.vm.$nextTick();
		expect(po.hasInlineAsk()).toBe(false);
		expect(po.textareaExists()).toBe(true);
	});
});

describe('ChatComposer P1 contract still holds without an arbiter', () => {
	it('mounts pure-P1 with no composer prop and sends on Enter', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
	});
});
