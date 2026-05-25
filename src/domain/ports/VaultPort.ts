/**
 * Reads, writes, lists, and removes vault-relative file and folder paths.
 * All paths are vault-relative (no leading slash). Implementations are
 * responsible for normalising path separators.
 */
export interface VaultPort {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	deleteFile(path: string): Promise<void>
	listFiles(folder: string): Promise<string[]>
	listFolders(parent: string): Promise<string[]>
	fileExists(path: string): Promise<boolean>
	createFolder(path: string): Promise<void>
	// ---- P5 additive (SPEC-CA-006, ADR-CA-001 §3) ----
	/** Read a vault file's raw bytes (the binary counterpart of readFile) — image read for base64 encode. */
	readBinary(path: string): Promise<Uint8Array>
}
