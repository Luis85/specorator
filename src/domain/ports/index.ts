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
export type { ChatRuntimePort } from './ChatRuntimePort';
export type {
	MarkdownRenderPort,
	MarkdownNode,
	MarkdownInline,
	SafeRenderResult,
} from './MarkdownRenderPort';
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
