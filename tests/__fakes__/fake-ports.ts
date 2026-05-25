import { vi } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import type {
	MockSelectionSource,
	MockSelectionHighlight,
} from '@/infrastructure/mock/MockSelectionPorts';
import type { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import type { MockApprovalRuleStore } from '@/infrastructure/mock/MockApprovalRuleStore';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	TranslationPort,
	MentionDataProviderPort,
	ProviderCommandCatalogPort,
	ShellExecPort,
} from '@/domain/ports';
import { createEventBus } from '@/domain/shared/event-bus';
import type { EventBus } from '@/domain/shared/event-bus';

/**
 * Standard test seam (ADR-009): the six core ports backed by a single MockBridge,
 * plus a fresh EventBus, a `vi.fn()` spy LoggerPort, and a TranslationPort stub.
 * P3 (SPEC-TS-007, T-TS-010) adds the `providerHistory` member — the mount's
 * stable `MockHistoryStore` (over a fresh `Map`) with mutations visible across
 * the factory's ports.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 */
export interface FakePorts {
	readonly settings: SettingsPort;
	readonly vault: VaultPort;
	readonly workspace: WorkspacePort;
	readonly notifications: NotificationPort;
	readonly logger: LoggerPort;
	readonly communityPluginPort: CommunityPluginPort;
	readonly providerHistory: MockHistoryStore;
	readonly bus: EventBus;
	readonly t: TranslationPort;
	readonly bridge: MockBridge;
	// P4 composer-power ports (SPEC-CP-009, T-CP-008). Fixture mention/catalog
	// providers + the scripted-echo ShellExec, all over the same MockBridge.
	readonly mentionData: MentionDataProviderPort;
	readonly commandCatalog: ProviderCommandCatalogPort;
	readonly shellExec: ShellExecPort;
	/**
	 * A scriptable `MockChatRuntime` whose inline-block capability flags toggle the
	 * capable / non-capable transport branches (TEST-CP-020 vs TEST-CP-024). Defaults
	 * capable; call `mockRuntime.setSupportsInlineResponse(false)` for the gated branch.
	 */
	readonly mockRuntime: MockChatRuntime;
	/**
	 * The scriptable Mock `AuxModelPort` (SPEC-CA-008, T-CA-008). The re-pointed
	 * title/refine tests (SPEC-CA-018) + the inline-edit tests (SPEC-CA-017) inject
	 * this aux stub instead of a runtime — `setAuxResponse`/`setAuxError`/`setAuxEmpty`.
	 */
	readonly auxModel: MockAuxModel;
	/**
	 * The inert-but-scriptable Mock `SelectionSourcePort` (SPEC-CA-008, T-CA-013).
	 * `setSelection(captured)` drives the editor/canvas capture path for the
	 * `CaptureSelectionUseCase` tests (SPEC-CA-016).
	 */
	readonly selectionSource: MockSelectionSource;
	/**
	 * The recording no-op Mock `SelectionHighlightPort` (SPEC-CA-008, T-CA-013).
	 * `show`/`clear` calls are recorded on `.calls` for assertion (TEST-CA-014/015).
	 */
	readonly selectionHighlight: MockSelectionHighlight;
	/**
	 * The scriptable Mock `ToolbarCatalogPort` (SPEC-TC-008, T-TC-010). The toolbar
	 * view-model + widget tests inject every catalog shape via `setToolbarCatalog`
	 * (custom/grouped models, effort/budget reasoning, empty-list degrade) without a
	 * real provider.
	 */
	readonly toolbarCatalog: MockToolbarCatalog;
	/**
	 * The scriptable Mock `ApprovalRuleStorePort` (SPEC-AS-008, T-AS-014). The
	 * `ApprovalManager` + `ApprovalsPanel` tests inject it via `seedRules` (pre-seed
	 * persisted rules) + `setFailMode` (force the fail-safe-to-prompt path,
	 * TEST-AS-054) without a real provider.
	 */
	readonly approvalRuleStore: MockApprovalRuleStore;
}

export function fakeModulePorts(): FakePorts {
	const bridge = new MockBridge();
	return {
		settings: bridge,
		vault: bridge,
		workspace: bridge,
		notifications: bridge,
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
		communityPluginPort: bridge,
		providerHistory: bridge.createProviderHistoryPort(),
		bus: createEventBus(),
		t: { t: vi.fn((key: string) => key) },
		bridge,
		mentionData: bridge.createMentionDataProvider(),
		commandCatalog: bridge.createProviderCommandCatalog(),
		shellExec: bridge.shellExec,
		mockRuntime: new MockChatRuntime(),
		auxModel: bridge.auxModel,
		selectionSource: bridge.selectionSource,
		selectionHighlight: bridge.selectionHighlight,
		toolbarCatalog: bridge.toolbarCatalog,
		approvalRuleStore: bridge.approvalRuleStore,
	};
}
