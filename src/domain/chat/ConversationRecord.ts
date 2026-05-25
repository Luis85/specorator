import type { ChatMessage } from './ChatMessage';
import type { ProviderId } from './ProviderId';

/**
 * Persisted conversation types (SPEC-TS-002, ADR-TS-001 §2). Mirrors the
 * provider-neutral metadata of claudian-main's `SharedAppStorage`
 * (`core/bootstrap/storage.ts`) kept distinct from the provider-native
 * transcript (`providers/claude/history/sdkHistoryTypes.ts`).
 *
 * Pure interfaces only — no `obsidian`, no `node:*`, no Vue, no class (ADR-001).
 * **No credential/secret field is ever present** (NFR-TS-013). **No migration**
 * (NFR-TS-014): `version` is a forward-proofing tag the reader tolerates under
 * load-or-default, never a switch it branches on.
 */

/** Forward-proofing tag — a CONSTANT, not a migration mechanism (NFR-TS-014, resolved item #3). */
export const CONVERSATION_RECORD_VERSION = 1 as const;

export interface ConversationRecord {
	/** Always 1 in P3; the reader load-or-defaults any/missing value (SPEC-TS-010). */
	readonly version: number;
	readonly meta: ConversationMeta;
	readonly messages: ChatMessage[]; // P1/P2 transcript DTOs (load-or-default — EC-RR-13)
	readonly providerState: ProviderSessionState;
}

export interface ConversationMeta {
	readonly id: string; // record key — crypto.randomUUID(); non-empty
	readonly title: string; // fallback | AI | manual (ADR-TS-003); MAY be empty pre-first-turn
	readonly titleManual: boolean; // manual-rename precedence (REQ-TS-011/024)
	readonly createdAt: number; // finite epoch ms, set at creation
	readonly updatedAt: number; // finite epoch ms — listSessions orders DESC by this
	readonly providerId: ProviderId; // 'claude' in P3; NEVER branched on (REQ-TS-026)
	readonly sessionId: string | null; // resolvable session id, or null when none yet
}

/** Opaque, provider-owned. Claude carries the (optional) lineage/fork/resume keys below. NO secret. */
export type ProviderSessionState = Record<string, unknown>;

/** The Claude-shaped keys carried inside ProviderSessionState (documentary; the bag stays opaque). */
export interface ClaudeProviderState {
	providerSessionId?: string;
	forkSource?: { sessionId: string; resumeAt: string }; // resumeAt = the source assistant/turn id
	previousProviderSessionIds?: string[];
}

export interface ForkPlan {
	readonly messages: ChatMessage[]; // source transcript truncated to the chosen point
	readonly providerState: ProviderSessionState; // DERIVED { forkSource } bag — not a copy (REQ-TS-018)
	readonly sourceTitle: string;
}
