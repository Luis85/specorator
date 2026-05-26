/**
 * Per-tab control selections (P6, SPEC-TC-006, ADR-TC-001 §1). Plain DTO — crosses
 * the Pinia store boundary (NFR-TC-005). Mirrors claudian-main's per-tab draft
 * model + reasoning + mode.
 */
import type { ReasoningChoice } from '../Reasoning';
import type { PermissionMode } from '../PermissionMode';

/**
 * The per-tab control selections the surface folds into the next turn. Every member
 * is **optional**; an absent member means "no explicit user choice — the runtime
 * applies its own default", so an untouched toolbar yields a byte-identical turn
 * (NFR-TC-001). `model`/`mode`/`serviceTier` are non-empty strings when present.
 * The seam widgets (permission/MCP/external) write **nothing** here.
 */
export interface TabControls {
	/** Model selector → {@link import('../ChatTurn').ChatRuntimeQueryOptions.model}. */
	model?: string;
	/** Mode selector → `.mode` (REQ-TC-014). */
	mode?: string;
	/** Thinking selector → `.reasoning` (REQ-TC-018). */
	reasoning?: ReasoningChoice;
	/** Service-tier toggle → `.serviceTier` (REQ-TC-020). */
	serviceTier?: string;
	/**
	 * Permission-mode toggle → {@link import('../ChatTurn').ChatRuntimeQueryOptions.permissionMode}
	 * (P7 additive, SPEC-AS-002). Per-tab draft state; `freshTab()` seeds `controls: {}`
	 * so an unset member ⇒ `'normal'` (REQ-AS-006, not persisted across a reload).
	 */
	permissionMode?: PermissionMode;
}
