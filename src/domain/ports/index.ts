/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * Consumers depend on one port at a time. Do NOT introduce a new
 * interface that composes two or more of these ports — interface
 * segregation is the whole point of this directory. If a consumer
 * appears to need a "VaultAndNotificationPort", it needs two
 * dependencies, not a new aggregate type.
 */
export type { SettingsPort } from './SettingsPort'
export type { VaultPort } from './VaultPort'
export type { WorkspacePort } from './WorkspacePort'
export type { NotificationPort } from './NotificationPort'
export type { LoggerPort } from './LoggerPort'
