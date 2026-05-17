/**
 * Reads, writes, lists, and removes vault-relative file and folder paths.
 * All paths are vault-relative (no leading slash). Implementations are
 * responsible for normalising path separators.
 *
 * `appendFile` is the O(1)-per-call tail-append surface added in WP-5 (ADR-008
 * port extension). Adapters are expected to favour a native append API when
 * available (Obsidian's `Vault.adapter.append`) and fall back to a
 * read+concat+write internally when the underlying storage cannot append.
 * If the target path does not yet exist, `appendFile` MUST create it with the
 * given content — matching the semantics of POSIX append-on-open. This keeps
 * the application layer's `SessionLogWriter` free of the create-vs-modify
 * branching that the adapters already handle for `writeFile`.
 */
export interface VaultPort {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	appendFile(path: string, content: string): Promise<void>
	deleteFile(path: string): Promise<void>
	listFiles(folder: string): Promise<string[]>
	listFolders(parent: string): Promise<string[]>
	fileExists(path: string): Promise<boolean>
	createFolder(path: string): Promise<void>
}
