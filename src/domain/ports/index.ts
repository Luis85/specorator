/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * P0 reboot (SPEC-PSR-009): the six core ports, plus the `TranslationPort` seam
 * (P7) and the `Unsubscriber` primitive. P1 (chat-core, SPEC-CC-009) regrows the
 * `ChatRuntimePort` + `MarkdownRenderPort` and re-exports the chat domain types
 * here for one-stop import. The MCP/canvas/icon/secret ports stay deleted and
 * regrow per consumer in a later phase. Do NOT compose two or more of these into
 * a new aggregate — interface segregation is the point of this directory;
 * `ChatRuntimePort` is one port for one consumer (the turn path), per ADR-CC-001 §5.
 */
export type { SettingsPort } from './SettingsPort';
export type { VaultPort } from './VaultPort';
export type { WorkspacePort } from './WorkspacePort';
export type { NotificationPort } from './NotificationPort';
export type { LoggerPort } from './LoggerPort';
export type { CommunityPluginPort } from './CommunityPluginPort';
export type { TranslationPort } from './TranslationPort';
export type { Unsubscriber } from './shared';

// P1 chat-core ports (SPEC-CC-001, SPEC-CC-007, SPEC-CC-009).
// P3 (SPEC-TS-003) appends `RuntimeCapabilities` alongside the additive
// ChatRuntimePort members.
// P6 (SPEC-TC-005) appends `ToolbarCapabilities` alongside the additive
// `getToolbarCapabilities()` member on `ChatRuntimePort`.
export type { ChatRuntimePort, RuntimeCapabilities, ToolbarCapabilities } from './ChatRuntimePort';
export type {
	MarkdownRenderPort,
	MarkdownNode,
	MarkdownInline,
	SafeRenderResult,
} from './MarkdownRenderPort';
// P2 rich-rendering icon seam (SPEC-RR-009, ADR-RR-001 §4) — the P0-deleted
// icon port regrows here. Declarative DTO only; never a DOM mutator.
export type { IconPort, IconNode } from './IconPort';
// P3 threads-sessions history seam (SPEC-TS-001, ADR-TS-001 §2). One port, one
// consumer (the history/resume/fork use cases) — no aggregate.
export type { ProviderHistoryPort } from './ProviderHistoryPort';
export { HistoryError } from './ProviderHistoryPort';
export type {
	ConversationRecord,
	ConversationMeta,
	ProviderSessionState,
	ClaudeProviderState,
	ForkPlan,
} from '@/domain/chat/ConversationRecord';
export { CONVERSATION_RECORD_VERSION } from '@/domain/chat/ConversationRecord';
// Re-export the chat domain types through the ports barrel for one-stop import.
export type { StreamChunk } from '@/domain/chat/StreamChunk';
export type { ChatMessage } from '@/domain/chat/ChatMessage';
export type { UsageInfo } from '@/domain/chat/UsageInfo';
export type {
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
} from '@/domain/chat/ChatTurn';
export type { ProviderId } from '@/domain/chat/ProviderId';

// P4 composer-power ports (SPEC-CP-003/005, ADR-CP-002). Three new narrow ports +
// their value types; one consumer each, no aggregate. The inline-block DTOs the
// runtime callbacks + StreamChunk request members carry (SPEC-CP-004) are
// re-exported here for one-stop import.
export type {
	MentionDataProviderPort,
	MentionReferent,
	MentionReferentKind,
} from './MentionDataProviderPort';
export type {
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
} from './ProviderCommandCatalogPort';
export type { ShellExecPort, ShellExecRequest, ShellExecResult } from './ShellExecPort';
export type {
	AskUserQuestionOption,
	AskUserQuestionItem,
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalDecision,
	ApprovalOption,
	ApprovalRequest,
} from '@/domain/chat/inline';
// P4 composer-mode value types (SPEC-CP-006) re-exported for one-stop import.
export type { ComposerMode, ComposerModeKind, TriggerHit } from '@/domain/chat/composer/ComposerMode';

// P5 context-attachments ports (SPEC-CA-004/005, ADR-CA-002 §1 / ADR-CA-003 §1).
// One consumer kind each, no aggregate (ADR-008): AuxModelPort = a one-shot
// cold-start aux query; the two selection ports split capture from paint.
export type { AuxModelPort, AuxModelRunOptions } from './AuxModelPort';
export type { SelectionSourcePort } from './SelectionSourcePort';
export type { SelectionHighlightPort } from './SelectionHighlightPort';

// P6 toolbar-controls (SPEC-TC-002, ADR-TC-002 §2). The reasoning union the
// thinking selector folds, surfaced through the ports barrel for one-stop import.
export type { ReasoningChoice, ReasoningEffort } from '@/domain/chat/Reasoning';
// P6 toolbar-catalog port (SPEC-TC-004, ADR-TC-004 §1). One consumer (the toolbar
// view-model), one port — no aggregate. The descriptor DTOs it returns are
// re-exported from `@/domain/chat/toolbar` for one-stop import.
export type { ToolbarCatalogPort } from './ToolbarCatalogPort';
export type {
	ModelOption,
	ModeDescriptor,
	ReasoningDescriptor,
	ServiceTierDescriptor,
	ToolbarCatalog,
	TabControls,
} from '@/domain/chat/toolbar';

// P7 approvals-security (SPEC-AS-001/002/005/006, ADR-AS-001/002). The
// permission-mode union, the store-only `ApprovalRuleStorePort` (one consumer, no
// aggregate), and the rule DTOs it carries, surfaced through the ports barrel for
// one-stop import.
export type { PermissionMode } from '@/domain/chat/PermissionMode';
export type { ApprovalRuleStorePort } from './ApprovalRuleStorePort';
export type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';

// P8 mcp-client (SPEC-MC-007/008, ADR-MC-001/002). The two narrow MCP ports (one
// consumer each, no aggregate) + the connection handle, surfaced through the ports
// barrel for one-stop import alongside the MCP DTOs they carry.
export type { McpConfigStorePort } from './McpConfigStorePort';
export type { McpClientPort, McpConnection } from './McpClientPort';
export type {
	McpServerConfig,
	McpServerType,
	ManagedMcpServer,
	McpTool,
	McpTestResult,
	ParsedMcpConfig,
	EnabledMcpServers,
} from '@/domain/chat/mcp/McpTypes';
