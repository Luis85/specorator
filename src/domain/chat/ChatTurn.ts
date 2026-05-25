/**
 * Turn request / prepared turn / query + ready options — mirrors claudian-main
 * `runtime/types.ts:45/56/64/73` (SPEC-CC-005, SPEC-CC-006). P1 carries the full
 * shapes for parity but only populates the marked fields.
 */
import type { AttachedFileRef, AttachedImage } from './attachments/Attachments';
import type {
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
} from './attachments/Selection';
import type { ReasoningChoice } from './Reasoning';
import type { PermissionMode } from './PermissionMode';

/** Turn request — mirrors `runtime/types.ts:45`. P1 uses `text` (+ optional `currentNotePath`). */
export interface ChatTurnRequest {
	text: string;
	/** P1 optional context hint; the rest of Claudian's request fields regrow P2+. */
	currentNotePath?: string;
	// --- P5 additive optional context fields (SPEC-CA-001, ADR-CA-001 §1). The P1
	// `text`/`currentNotePath` above stay byte-identical; a `{ text }`-only request
	// serialises identically to P1. `externalContextPaths?`/`enabledMcpServers?`
	// stay EXCLUDED (NG3 — regrow a later phase).
	/** Vault files attached as context chips (REQ-CA-001..006). */
	attachedFiles?: readonly AttachedFileRef[];
	/** Images attached to the turn, bounded base64 (REQ-CA-007..012). */
	images?: readonly AttachedImage[];
	/** A captured CM6 editor selection (REQ-CA-013/019). */
	editorSelection?: EditorSelectionContext;
	/** A captured canvas-node selection (REQ-CA-017/019). */
	canvasSelection?: CanvasSelectionContext;
	/** A capability-gated embedded-view selection (REQ-CA-018/019). */
	browserSelection?: BrowserSelectionContext;
}

/** Prepared turn — mirrors `runtime/types.ts:56`. */
export interface PreparedChatTurn {
	request: ChatTurnRequest;
	/** P1 = `request.text`. */
	persistedContent: string;
	/** P1 = `request.text`. */
	prompt: string;
	/** P1 = `false`. */
	isCompact: boolean;
	/** P1 = empty `Set`. */
	mcpMentions: Set<string>;
}

/** Query options — mirrors `runtime/types.ts:64`. */
export interface ChatRuntimeQueryOptions {
	/** P1 optional; allowedTools/mcpMentions/enabledMcpServers/externalContextPaths are P2+. */
	model?: string;
	/**
	 * P3 additive (SPEC-TS-003/009, ADR-TS-003 §1): when set, the runtime ignores
	 * any bound session for this single query (a cold-start / one-shot query, used
	 * by the title-gen side-query so it does not steer the tab's main stream).
	 */
	forceColdStart?: boolean;
	/**
	 * P4 additive (SPEC-CP-005/011, REQ-CP-018, R-CP-001): the persisted
	 * `customSystemPrompt` the instruction `#` flow appends to. When present and
	 * non-empty the runtime feeds it to the agent's system prompt (the CLI emits
	 * `--append-system-prompt <text>`; the parity counterpart of Claudian feeding
	 * `settings.systemPrompt` through `buildSystemPrompt` into the SDK). The store
	 * reads it from `SettingsPort` and threads it here, so instruction mode actually
	 * reaches the runtime instead of dead-ending in settings.
	 */
	appendSystemPrompt?: string;
	// ---- P6 additive (SPEC-TC-001, ADR-TC-002 §1) — all optional; an unset query
	// is byte-identical to P5 (NFR-TC-001). The P0–P5 members above stay
	// byte-identical; `enabledMcpServers?`/`externalContextPaths?` stay EXCLUDED. ----
	/** Mode selector (REQ-TC-014): the active/inactive mode descriptor value token. */
	mode?: string;
	/** Thinking selector (REQ-TC-018): the discriminated effort|budget choice (SPEC-TC-002). */
	reasoning?: ReasoningChoice;
	/** Service-tier toggle (REQ-TC-020): declared-now, emitted by a capable runtime in P9. */
	serviceTier?: string;
	// ---- P7 additive (SPEC-AS-002, ADR-AS-002 §1) — optional; an unset query is
	// byte-identical to P6 (NFR-AS-001). The fold writes it ONLY for a non-`normal`
	// mode (SPEC-AS-011), so a `normal`/absent tab folds nothing. ----
	/** Permission mode (REQ-AS-002): absent ⇒ the runtime's default (`'normal'`). */
	permissionMode?: PermissionMode;
}

/** Ensure-ready options — mirrors `runtime/types.ts:73`. */
export interface ChatRuntimeEnsureReadyOptions {
	allowSessionCreation?: boolean;
	force?: boolean;
}
