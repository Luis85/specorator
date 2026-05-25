import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
	type ConversationMeta,
} from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * The pure, total, never-throwing (de)serialise boundary for a
 * `ConversationRecord` (SPEC-TS-010) — the unit-tested core of the vault-file
 * store, so the bridge I/O methods can be coverage-excluded infra while this
 * carries the weight.
 *
 * - `serialise` always stamps `version: 1` and writes exactly meta/messages/
 *   providerState, **stripping any non-contract field** (defence in depth so no
 *   stray secret a caller accidentally attached lands in a file — NFR-TS-013).
 * - `deserialise` is **load-or-default**: a record with any/missing `version` is
 *   accepted (the tag is not a migration switch — NFR-TS-014), and a corrupt /
 *   structurally-invalid input returns `{ ok: false, reason: 'corrupt' }` rather
 *   than throwing.
 */

export type ParseResult =
	| { ok: true; record: ConversationRecord }
	| { ok: false; reason: 'corrupt' };

/** Serialise a record to JSON, stamping version:1 and stripping non-contract fields. */
export function serialise(record: ConversationRecord): string {
	const clean: ConversationRecord = {
		version: CONVERSATION_RECORD_VERSION,
		meta: record.meta,
		messages: record.messages,
		providerState: record.providerState,
	};
	return JSON.stringify(clean);
}

/**
 * Parse raw JSON to a `ConversationRecord`. Total/never-throws: any parse failure
 * or structural invalidity → `{ ok: false, reason: 'corrupt' }`. Accepts any /
 * missing `version` (load-or-default). No migration branch.
 */
export function deserialise(raw: string): ParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: 'corrupt' };
	}
	if (!isRecordObject(parsed)) return { ok: false, reason: 'corrupt' };
	const meta = parsed.meta;
	if (!isValidMeta(meta)) return { ok: false, reason: 'corrupt' };
	if (!Array.isArray(parsed.messages)) return { ok: false, reason: 'corrupt' };

	const record: ConversationRecord = {
		// `version` is a tolerated tag — re-stamp to the current constant rather
		// than branching on the stored value (NFR-TS-014).
		version: CONVERSATION_RECORD_VERSION,
		meta,
		messages: parsed.messages as ChatMessage[],
		providerState: isPlainObject(parsed.providerState) ? parsed.providerState : {},
	};
	return { ok: true, record };
}

interface RawRecord {
	meta: unknown;
	messages: unknown;
	providerState: unknown;
}

function isRecordObject(value: unknown): value is RawRecord {
	return isPlainObject(value) && 'meta' in value && 'messages' in value;
}

function isValidMeta(value: unknown): value is ConversationMeta {
	return isPlainObject(value) && typeof value.id === 'string' && value.id.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
