/**
 * Narrow workspace port (ADR-008). P0 reboot (SPEC-PSR-009 / OC-PSR-1) reverts
 * this to the original `openFile`-only surface; the chat-era extensions
 * (`getActiveFile`, `onActiveFileChanged`, `getActiveFilePath`,
 * `getActiveSelection`, `getVaultName`, `getMarkdownFileCount`) and the
 * `ActiveFileSnapshot` interface are dropped with the chat surfaces that used
 * them. They regrow per consumer in a later phase.
 */
export interface WorkspacePort {
	openFile(path: string): Promise<void>
}
