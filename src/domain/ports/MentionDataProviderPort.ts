/**
 * Mention data-provider port (SPEC-CP-003, ADR-CP-002 §1). One narrow port, one
 * consumer (the `@`-mention palette). A best-effort data seam: its only failure
 * mode is "no results" (`[]`), so it returns a bare array, NOT a `Result`
 * (parity with claudian's cache-backed `VaultMentionDataProvider`). The debounce
 * + request-guard live in the consumer (SPEC-CP-018); the `signal` lets the
 * consumer abort a stale query. No `obsidian`/`node:*`/Vue/class.
 */
export type MentionReferentKind = 'file' | 'folder' | 'subagent' | 'mcp-server' | 'external-dir';

export interface MentionReferent {
	readonly kind: MentionReferentKind;
	/** Display name (filename / agent name / server name). */
	readonly name: string;
	/** What `replaceTriggerToken` inserts (the resolved mention; SPEC-CP-014). */
	readonly mentionText: string;
	/** Path (files/folders) or description (subagent/MCP) — drives the 2-line row. */
	readonly detail?: string;
}

export interface MentionDataProviderPort {
	/**
	 * Filtered referents for the open palette. Case-insensitive substring match on
	 * `name`/`detail`; an empty filter returns the unfiltered (capped) list.
	 * Load-or-default: an empty/unwired source returns `[]` — never throws, never
	 * errors the palette (REQ-CP-012).
	 */
	query(filter: string, signal?: AbortSignal): Promise<MentionReferent[]>;
}
