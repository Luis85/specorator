/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * P0 reboot (SPEC-PSR-009): only the six core ports remain, plus the
 * `TranslationPort` seam (P7) and the `Unsubscriber` primitive. The
 * chat/MCP/canvas/icon/secret ports were deleted with their subsystems and
 * regrow per consumer in a later phase. Do NOT compose two or more of these
 * into a new aggregate — interface segregation is the point of this directory.
 */
export type { SettingsPort } from './SettingsPort';
export type { VaultPort } from './VaultPort';
export type { WorkspacePort } from './WorkspacePort';
export type { NotificationPort } from './NotificationPort';
export type { LoggerPort } from './LoggerPort';
export type { CommunityPluginPort } from './CommunityPluginPort';
export type { TranslationPort } from './TranslationPort';
export type { Unsubscriber } from './shared';
