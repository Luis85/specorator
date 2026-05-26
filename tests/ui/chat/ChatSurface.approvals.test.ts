/**
 * T-AS-028 (RED) — `ChatSurface.vue` approval-callback → `ApprovalManager` wiring +
 * the approvals view-model (TEST-AS-020/021/022/025/040/042/043 surface legs).
 *
 * SPEC-AS-016/017/023/028. The surface injects `APPROVAL_RULE_STORE_PORT` OPTIONALLY
 * and, when present alongside the composer ports, constructs ONE per-surface
 * `ApprovalManager`, gates the active runtime's approval callback through it
 * (`decide`): an auto `allow`/`deny` resolves the callback WITHOUT rendering the inline
 * block; a `prompt` renders the unchanged P4 `InlinePlanApproval` and feeds the user's
 * decision back through `applyDecision`. The surface owns the approvals view-model
 * (`rules` from `listRules()` + the active mode) → `ApprovalsPanel`, wires its `remove`
 * to `store.removeRule(id)` then refreshes, and wires the `PermissionToggle`'s `set` to
 * `tabs.setControl('permissionMode', mode)`. With NO store port the surface degrades to
 * always-prompt (the byte-identical P4 path). No `providerId` branch. Queried by
 * `data-testid` only (ADR-009).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import { i18n } from '@/ui/i18n';
import {
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	PROVIDER_HISTORY_PORT,
	ICON_PORT,
	TOOLBAR_CATALOG_PORT,
	APPROVAL_RULE_STORE_PORT,
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import { MockApprovalRuleStore } from '@/infrastructure/mock/MockApprovalRuleStore';
import type { NotificationPort, LoggerPort, ApprovalRequest } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

const APPROVAL: ApprovalRequest = {
	requestId: 'a1',
	tool: 'Bash',
	context: 'git status',
	options: [
		{ decision: 'allow', label: 'Allow once' },
		{ decision: 'allow-always', label: 'Always allow' },
		{ decision: 'deny', label: 'Deny once' },
		{ decision: 'deny-always', label: 'Always deny' },
	],
};

async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

function mountSurface(opts: { store?: MockApprovalRuleStore | null } = {}) {
	const store = opts.store === undefined ? new MockApprovalRuleStore() : opts.store;
	const created: MockChatRuntime[] = [];
	const provide: Record<symbol, unknown> = {
		[CHAT_RUNTIME_FACTORY as symbol]: () => {
			const r = new MockChatRuntime([]);
			created.push(r);
			return r;
		},
		[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
		[NOTIFICATION_PORT as symbol]: notifySpy(),
		[LOGGER_PORT as symbol]: logger,
		[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
		[ICON_PORT as symbol]: bridge.createIconPort(),
		[TOOLBAR_CATALOG_PORT as symbol]: new MockToolbarCatalog(),
		[MENTION_DATA_PROVIDER_PORT as symbol]: bridge.createMentionDataProvider(),
		[PROVIDER_COMMAND_CATALOG_PORT as symbol]: bridge.createProviderCommandCatalog(),
		[SHELL_EXEC_PORT as symbol]: bridge.shellExec,
	};
	if (store !== null) provide[APPROVAL_RULE_STORE_PORT as symbol] = store;
	const wrapper = mount(ChatSurface, { global: { plugins: [i18n], provide } });
	return { wrapper, po: new ChatSurfacePageObject(wrapper), created, store };
}

describe('ChatSurface P7 approvals wiring (SPEC-AS-016)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('mounts the approvals panel + the live permission toggle when the store is provided', async () => {
		const { wrapper } = mountSurface();
		await settle();
		expect(wrapper.find('[data-testid="approvals-panel"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="toolbar-permission-option"]').exists()).toBe(true);
	});

	it('TEST-AS-020: a seeded matching allow rule auto-allows with NO inline block', async () => {
		const store = new MockApprovalRuleStore();
		store.seedRules([
			{
				id: 'r1',
				toolName: 'Bash',
				actionPattern: 'git *',
				decision: 'allow',
				lifetime: 'persisted',
				createdAt: 1,
			},
		]);
		const { wrapper, created } = mountSurface({ store });
		await settle();
		const decision = await created[0].emitApprovalRequest(APPROVAL);
		await settle();
		expect(decision).toBe('allow');
		expect(wrapper.find('[data-testid="inline-plan-approval"]').exists()).toBe(false);
	});

	it('TEST-AS-021/022: an unmatched action renders the unchanged P4 inline block (prompt)', async () => {
		const { wrapper, created } = mountSurface();
		await settle();
		void created[0].emitApprovalRequest(APPROVAL);
		await settle();
		expect(wrapper.find('[data-testid="inline-plan-approval"]').exists()).toBe(true);
	});

	it('TEST-AS-025: cancelling the prompt resolves null (deny + interrupt)', async () => {
		const { wrapper, created } = mountSurface();
		await settle();
		const pending = created[0].emitApprovalRequest(APPROVAL);
		await settle();
		const root = wrapper.get('[data-testid="inline-plan-approval"]');
		root.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await settle();
		expect(await pending).toBeNull();
	});

	it('TEST-AS-040/043: the approvals panel reflects seeded persisted rules', async () => {
		const store = new MockApprovalRuleStore();
		store.seedRules([
			{
				id: 'r9',
				toolName: 'Write',
				actionPattern: '/a/b',
				decision: 'deny',
				lifetime: 'persisted',
				createdAt: 2,
			},
		]);
		const { wrapper } = mountSurface({ store });
		await settle();
		expect(wrapper.findAll('[data-testid="approvals-rule"]')).toHaveLength(1);
		expect(wrapper.find('[data-testid="approvals-rule"]').text()).toContain('Write');
	});

	it('degrades to always-prompt when the store port is absent (byte-identical P4)', async () => {
		const { wrapper, created } = mountSurface({ store: null });
		await settle();
		expect(wrapper.find('[data-testid="approvals-panel"]').exists()).toBe(false);
		void created[0].emitApprovalRequest(APPROVAL);
		await settle();
		expect(wrapper.find('[data-testid="inline-plan-approval"]').exists()).toBe(true);
	});
});
