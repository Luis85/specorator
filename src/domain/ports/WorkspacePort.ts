/**
 * Opens a vault-relative file in the host workspace (Obsidian tab,
 * standalone harness route, etc.). Implementations decide how the open
 * action manifests in their environment.
 */
export interface WorkspacePort {
	openFile(path: string): Promise<void>
}
