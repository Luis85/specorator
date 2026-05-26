/**
 * `HomeFsPort` (P9, SPEC-PV-007, ADR-PV-003 §1). The narrow read-first beyond-vault
 * filesystem surface the non-Claude providers need (the Codex JSONL history read +
 * the consent gate). One port for one consumer kind; its own `HOME_FS_PORT` key +
 * `useHomeFsPort()` composable, no aggregate (ADR-008).
 *
 * **Read-first — NO write/delete method in P9 (REQ-PV-081).** Reads are scoped to
 * the declared `HOME_FS_ROOTS` resolved against `os.homedir()` at the infra
 * boundary; a path escaping a root → `Result.err` (the path-escape rule below). All
 * async methods are `Result`-typed (never throw). The real `node:fs` impl is
 * coverage-excluded; Mock/LS are inert. No `obsidian`/`node:*`/Vue.
 */
import type { Result } from '@/domain/shared/Result';

/**
 * The declared, allow-listed beyond-vault roots P9 may read (SPEC-PV-007,
 * REQ-PV-081). Resolved relative to `os.homedir()` at the infra boundary — i.e.
 * `~/.codex` and `~/.claude`. A resolved path that escapes both roots → `err`.
 */
export const HOME_FS_ROOTS = ['.codex', '.claude'] as const;

export interface HomeFsPort {
	/**
	 * Whether beyond-vault FS reads are available on this device (REQ-PV-083).
	 * Synchronous + total. Obsidian (Node) → true; Mock/LS → false (inert, NFR-PV-012).
	 */
	isAvailable(): boolean;
	/**
	 * Read a UTF-8 file under a declared root (REQ-PV-080). A path escaping a root →
	 * `err` (REQ-PV-081); not-found / read failure → `err`.
	 */
	readFile(relativePath: string): Promise<Result<string>>;
	/** Whether a path under a declared root exists (REQ-PV-080). A path escaping a root → `err`. */
	exists(relativePath: string): Promise<Result<boolean>>;
	/** List the folders under a declared root (REQ-PV-080). A path escaping a root → `err`. */
	listFolders(relativePath: string): Promise<Result<readonly string[]>>;
}
