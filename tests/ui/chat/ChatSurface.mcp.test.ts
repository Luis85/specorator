/**
 * T-MC-035 (RED) — `ChatSurface.vue` P8 MCP wiring (TEST-MC-052/065/071/072/082 +
 * the TEST-MC-081 wiring leg surface legs).
 *
 * SPEC-MC-020/026. The surface injects `MCP_CONFIG_STORE_PORT` + `MCP_CLIENT_PORT`
 * OPTIONALLY and, when the store is present, constructs ONE per-surface
 * `McpServerManager` (parity the per-surface P7 `ApprovalManager`), loads it on
 * mount, builds the `McpViewModel` (SPEC-MC-014) for the settings + selector, and on
 * turn submit folds `manager.getEnabledMcpServers(∅)` (SPEC-MC-013) into
 * `queryOptions.enabledMcpServers` ONLY when defined (TEST-MC-052/082). An MCP tool
 * call (`mcp__<server>__<tool>`) routes through the UNCHANGED P7 `ApprovalManager`
 * (TEST-MC-065, SPEC-MC-026) — no MCP special-case, no `providerId` branch. A
 * store/client `err` degrades gracefully (a non-blocking notice + the chat continues,
 * TEST-MC-071/072). With NO MCP ports the settings/selector keep the P6 empty seam and
 * the turn omits the field (TEST-MC-082 byte-identical). Queried by `data-testid`
 * only (ADR-009).
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
	MCP_CONFIG_STORE_PORT,
	MCP_CLIENT_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { ok } from '@/domain/shared/Result';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import { MockApprovalRuleStore } from '@/infrastructure/mock/MockApprovalRuleStore';
import { MockMcpConfigStore } from '@/infrastructure/mock/MockMcpConfigStore';
import { MockMcpClient } from '@/infrastructure/mock/MockMcpClient';
import type {
	NotificationPort,
	LoggerPort,
	ApprovalRequest,
	ChatRuntimeQueryOptions,
	ToolbarCapabilities,
} from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

/** A Claude-shaped capability set that ADVERTISES MCP (the surface shows the MCP surface). */
const MCP_CAPABLE: ToolbarCapabilities = {
	supportsMcpTools: true,
	reasoningControl: 'effort',
	hasServiceTier: false,
	hasModeToggle: true,
	permissionMode: 'normal',
};

const FS_SERVER: ManagedMcpServer = {
	name: 'fs',
	config: { command: 'mcp-fs' },
	enabled: true,
	contextSaving: false,
};

/** An MCP tool approval request (`mcp__<server>__<tool>`) — the P7-gate flow-through. */
const MCP_APPROVAL: ApprovalRequest = {
	requestId: 'm1',
	tool: 'mcp__fs__read',
	context: '{"path":"/a"}',
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

interface MountOpts {
	/** `undefined` ⇒ a fresh empty store; `null` ⇒ omit the MCP ports entirely (degrade). */
	store?: MockMcpConfigStore | null;
	client?: MockMcpClient;
	approvalStore?: MockApprovalRuleStore;
	/** Capabilities the created runtime reports (default advertises MCP). */
	caps?: ToolbarCapabilities;
}

function mountSurface(opts: MountOpts = {}) {
	const store = opts.store === undefined ? new MockMcpConfigStore() : opts.store;
	const client = opts.client ?? new MockMcpClient();
	const caps = opts.caps ?? MCP_CAPABLE;
	const created: MockChatRuntime[] = [];
	const provide: Record<symbol, unknown> = {
		[CHAT_RUNTIME_FACTORY as symbol]: () => {
			const r = new MockChatRuntime([]);
			r.setToolbarCapabilities(caps);
			created.push(r);
			return ok(r);
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
		[APPROVAL_RULE_STORE_PORT as symbol]: opts.approvalStore ?? new MockApprovalRuleStore(),
	};
	if (store !== null) {
		provide[MCP_CONFIG_STORE_PORT as symbol] = store;
		provide[MCP_CLIENT_PORT as symbol] = client;
	}
	const wrapper = mount(ChatSurface, { global: { plugins: [i18n], provide } });
	return { wrapper, po: new ChatSurfacePageObject(wrapper), created, store, client };
}

describe('ChatSurface P8 MCP wiring (SPEC-MC-020)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('TEST-MC-081 (wiring): mounts the MCP settings surface when the store is provided + MCP is supported', async () => {
		const store = new MockMcpConfigStore();
		store.seedMcpServers([FS_SERVER]);
		const { po } = mountSurface({ store });
		await settle();
		expect(po.hasMcpSettings()).toBe(true);
		expect(po.mcpServerRowCount()).toBe(1);
	});

	it('TEST-MC-050 (selector): the toolbar MCP selector shows the manager-driven live list', async () => {
		const store = new MockMcpConfigStore();
		store.seedMcpServers([FS_SERVER]);
		const { po } = mountSurface({ store });
		await settle();
		// The expanded selector renders (the P6 empty seam is replaced by the live list).
		expect(po.hasMcpSelector()).toBe(true);
		expect(po.mcpSelectorBadge()).toContain('1');
	});

	it('TEST-MC-052/082: a turn folds enabledMcpServers ONLY when an enabled server is active', async () => {
		const store = new MockMcpConfigStore();
		store.seedMcpServers([FS_SERVER]);
		const { po, created } = mountSurface({ store });
		await settle();
		const captured: (ChatRuntimeQueryOptions | undefined)[] = [];
		const original = created[0].query.bind(created[0]);
		vi.spyOn(created[0], 'query').mockImplementation((turn, history, queryOptions) => {
			captured.push(queryOptions);
			return original(turn, history, queryOptions);
		});
		await po.typeAndSend('use the fs server');
		await settle();
		expect(captured).toHaveLength(1);
		expect(captured[0]?.enabledMcpServers).toBeDefined();
		expect(captured[0]?.enabledMcpServers?.servers).toHaveProperty('fs');
	});

	it('TEST-MC-082 (no-servers): a turn with no enabled server omits enabledMcpServers (byte-identical)', async () => {
		// A store with no servers → the fold returns undefined.
		const { po, created } = mountSurface({ store: new MockMcpConfigStore() });
		await settle();
		const captured: (ChatRuntimeQueryOptions | undefined)[] = [];
		const original = created[0].query.bind(created[0]);
		vi.spyOn(created[0], 'query').mockImplementation((turn, history, queryOptions) => {
			captured.push(queryOptions);
			return original(turn, history, queryOptions);
		});
		await po.typeAndSend('a plain turn');
		await settle();
		expect(captured).toHaveLength(1);
		expect(captured[0]?.enabledMcpServers).toBeUndefined();
	});

	it('TEST-MC-065: an MCP tool call routes through the UNCHANGED P7 ApprovalManager (no special-case)', async () => {
		const approvalStore = new MockApprovalRuleStore();
		approvalStore.seedRules([
			{
				id: 'r1',
				toolName: 'mcp__fs__read',
				actionPattern: '*',
				decision: 'allow',
				lifetime: 'persisted',
				createdAt: 1,
			},
		]);
		const store = new MockMcpConfigStore();
		store.seedMcpServers([FS_SERVER]);
		const { wrapper, created } = mountSurface({ store, approvalStore });
		await settle();
		const decision = await created[0].emitApprovalRequest(MCP_APPROVAL);
		await settle();
		// The seeded allow rule auto-allows the MCP tool with NO inline block (the P7 gate
		// handled the `mcp__`-prefixed tool name with no MCP-specific branch).
		expect(decision).toBe('allow');
		expect(wrapper.find('[data-testid="inline-plan-approval"]').exists()).toBe(false);
	});

	it('TEST-MC-071/072: a store load failure degrades gracefully (a notice + the chat continues)', async () => {
		const store = new MockMcpConfigStore();
		store.setMcpStoreFailMode('load');
		const { po } = mountSurface({ store });
		await settle();
		// One bad store never crashes the view — the surface still renders + the settings
		// fall back to the empty seam (no servers loaded).
		expect(po.exists()).toBe(true);
		expect(po.hasMcpSettings()).toBe(true);
		expect(po.mcpServerRowCount()).toBe(0);
		// The chat still streams a turn (the failure is non-blocking).
		await po.typeAndSend('still works');
		await settle();
		expect(po.showsMessageList()).toBe(true);
	});

	it('TEST-MC-082 (degrade): with NO MCP ports the settings/selector stay absent + the turn omits the field', async () => {
		const { po, created } = mountSurface({ store: null });
		await settle();
		// No store port → no settings surface, the toolbar keeps the P6 empty seam.
		expect(po.hasMcpSettings()).toBe(false);
		const captured: (ChatRuntimeQueryOptions | undefined)[] = [];
		const original = created[0].query.bind(created[0]);
		vi.spyOn(created[0], 'query').mockImplementation((turn, history, queryOptions) => {
			captured.push(queryOptions);
			return original(turn, history, queryOptions);
		});
		await po.typeAndSend('a no-mcp turn');
		await settle();
		expect(captured[0]?.enabledMcpServers).toBeUndefined();
	});
});
