/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * Consumers depend on one port at a time. Do NOT introduce a new
 * interface that composes two or more of these ports — interface
 * segregation is the whole point of this directory. If a consumer
 * appears to need a "VaultAndNotificationPort", it needs two
 * dependencies, not a new aggregate type.
 */
export type { SettingsPort } from './SettingsPort';
export type { VaultPort } from './VaultPort';
export type { WorkspacePort, ActiveFileSnapshot } from './WorkspacePort';
export type { NotificationPort } from './NotificationPort';
export type { LoggerPort } from './LoggerPort';
export type { TranslationPort } from './TranslationPort';
export type { Unsubscriber } from './shared';
export type { MetadataCachePort, FileMetadataSnapshot } from './MetadataCachePort';
export type { CanvasPort, JsonCanvasData } from './CanvasPort';
export type { ObsidianMcpServerPort, McpConnectionConfig } from './ObsidianMcpServerPort';
export type { CommunityPluginPort } from './CommunityPluginPort';
export type {
	ClaudeCliPort,
	ClaudeCliQueryOptions,
	ClaudeCliStreamOptions,
	ClaudeCliErrorCode,
	StreamDelta,
} from './ClaudeCliPort';
export { ClaudeCliError, streamFromQuery } from './ClaudeCliPort';
export type { ConfirmModalPort, ConfirmModalRequest } from './ConfirmModalPort';
export type { SecretStorePort } from './SecretStorePort';
export { SECRET_ID_ANTHROPIC } from './SecretStorePort';
