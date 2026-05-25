/**
 * Provider command/skill catalog port (SPEC-CP-005, ADR-CP-002 §2). Supplies only
 * the PROVIDER (file-backed, lazily-loaded) entries — the six built-ins are a pure
 * application list (SPEC-CP-013), listed before provider entries, independent of
 * any catalog load (REQ-CP-003). Request-id guarding is the consumer's job
 * (SPEC-CP-018). Load-or-default: an unloaded/empty catalog returns `[]`, never
 * throws. No `obsidian`/`node:*`/Vue/class.
 */
export type CatalogEntryKind = 'command' | 'skill';

export interface CatalogEntry {
	readonly kind: CatalogEntryKind;
	/** Drives the REQ-CP-005 `prefix + name + space` insertion. */
	readonly prefix: '/' | '$';
	readonly name: string;
	readonly description?: string;
	/** Built-in → run an action (REQ-CP-006); provider entry → insert (REQ-CP-005). */
	readonly builtIn: boolean;
}

export interface ProviderCommandCatalogPort {
	/** Provider command/skill entries for the open palette. Load-or-default: `[]`. */
	getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]>;
}
