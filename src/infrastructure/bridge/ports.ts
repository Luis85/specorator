import type { InjectionKey } from 'vue';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ChatRuntimePort,
	MarkdownRenderPort,
	IconPort,
	ProviderHistoryPort,
	MentionDataProviderPort,
	ProviderCommandCatalogPort,
	ShellExecPort,
	AuxModelPort,
	SelectionSourcePort,
	SelectionHighlightPort,
	ToolbarCatalogPort,
	ApprovalRuleStorePort,
	McpConfigStorePort,
	McpClientPort,
} from '@/domain/ports';

/**
 * Per-port InjectionKeys (ADR-008). P0 reboot (SPEC-PSR-009): the six core
 * ports. P1 chat-core (SPEC-CC-008) regrows two more — `CHAT_RUNTIME_PORT` and
 * `MARKDOWN_RENDER_PORT` — alongside them. There is no aggregate key: each port
 * is injected on its own (ADR-CC-001 §5). P2 rich-rendering (SPEC-RR-009)
 * regrows the icon seam — `ICON_PORT` joins the list below (still no aggregate).
 * The remaining MCP/canvas/secret InjectionKeys stay deleted and regrow per
 * consumer in a later phase.
 */
export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort');
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort');
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort');
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort');
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort');
export const COMMUNITY_PLUGIN_PORT: InjectionKey<CommunityPluginPort> =
	Symbol('CommunityPluginPort');

// P1 chat-core ports (SPEC-CC-008, REQ-CC-002, REQ-CC-015).
export const CHAT_RUNTIME_PORT: InjectionKey<ChatRuntimePort> = Symbol('ChatRuntimePort');
export const MARKDOWN_RENDER_PORT: InjectionKey<MarkdownRenderPort> = Symbol('MarkdownRenderPort');

// P2 rich-rendering icon seam (SPEC-RR-009, ADR-RR-001 §4, T-RR-007).
export const ICON_PORT: InjectionKey<IconPort> = Symbol('IconPort');

// P3 threads-sessions history seam (SPEC-TS-001, ADR-TS-001 §2). Own key, no
// aggregate — injected on its own per ADR-008/ADR-CC-001 §5.
export const PROVIDER_HISTORY_PORT: InjectionKey<ProviderHistoryPort> =
	Symbol('ProviderHistoryPort');

// P4 composer-power ports (SPEC-CP-005, ADR-CP-002 §4). Own keys, no aggregate —
// mention/catalog are per-mount factories, ShellExec is stateless (the bridge IS
// the port).
export const MENTION_DATA_PROVIDER_PORT: InjectionKey<MentionDataProviderPort> =
	Symbol('MentionDataProviderPort');
export const PROVIDER_COMMAND_CATALOG_PORT: InjectionKey<ProviderCommandCatalogPort> =
	Symbol('ProviderCommandCatalogPort');
export const SHELL_EXEC_PORT: InjectionKey<ShellExecPort> = Symbol('ShellExecPort');

// P5 context-attachments ports (SPEC-CA-004/005, ADR-CA-002 §1 / ADR-CA-003 §1).
// Own keys, no aggregate — AuxModelPort is the one-shot cold-start aux query;
// the two selection ports split capture (source) from paint (highlight).
export const AUX_MODEL_PORT: InjectionKey<AuxModelPort> = Symbol('AuxModelPort');
export const SELECTION_SOURCE_PORT: InjectionKey<SelectionSourcePort> =
	Symbol('SelectionSourcePort');
export const SELECTION_HIGHLIGHT_PORT: InjectionKey<SelectionHighlightPort> =
	Symbol('SelectionHighlightPort');

// P6 toolbar-controls (SPEC-TC-004, ADR-TC-004 §1). Own key, no aggregate — one
// consumer (the toolbar view-model) reads the per-provider option lists +
// descriptors through it.
export const TOOLBAR_CATALOG_PORT: InjectionKey<ToolbarCatalogPort> =
	Symbol('ToolbarCatalogPort');

// P7 approvals-security (SPEC-AS-006, ADR-AS-001 §2). Own key, no aggregate — one
// consumer (the approvals use cases) reads the persisted rule set through it; the
// three bridges back it device-local / scriptable in-memory / browser-localStorage.
export const APPROVAL_RULE_STORE_PORT: InjectionKey<ApprovalRuleStorePort> =
	Symbol('ApprovalRuleStorePort');

// P8 mcp-client (SPEC-MC-007/008, ADR-MC-001 §2 / ADR-MC-002 §1). Own keys, no
// aggregate — one consumer each (the `McpServerManager` reads the config store; the
// tester reads the client). The three bridges back them vault-`.claude/mcp.json` +
// real SDK transports / scriptable in-memory / browser-localStorage + inert.
export const MCP_CONFIG_STORE_PORT: InjectionKey<McpConfigStorePort> =
	Symbol('McpConfigStorePort');
export const MCP_CLIENT_PORT: InjectionKey<McpClientPort> = Symbol('McpClientPort');
