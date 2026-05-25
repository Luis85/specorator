/**
 * T-TS-002 (TEST-TS-002) — RED: `ConversationRecord` / `ConversationMeta` /
 * `ProviderSessionState` / `ClaudeProviderState` / `ForkPlan` field shapes +
 * `CONVERSATION_RECORD_VERSION === 1`, and NO credential/secret field present.
 *
 * The compile-time `Equals<>`/`HasKey<>` asserts fail `vue-tsc -p tsconfig.lint.json`
 * until T-TS-003 declares the types. Pure type/shape contract (SPEC-TS-002).
 *
 * Traces: TEST-TS-002, SPEC-TS-002, REQ-TS-008/009/018, NFR-TS-013/014.
 */
import { describe, it, expect } from 'vitest';
import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
	type ConversationMeta,
	type ProviderSessionState,
	type ClaudeProviderState,
	type ForkPlan,
} from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type { ProviderId } from '@/domain/chat/ProviderId';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// ---- ConversationMeta field shapes ----
const _metaId: Equals<ConversationMeta['id'], string> = true;
const _metaTitle: Equals<ConversationMeta['title'], string> = true;
const _metaTitleManual: Equals<ConversationMeta['titleManual'], boolean> = true;
const _metaCreatedAt: Equals<ConversationMeta['createdAt'], number> = true;
const _metaUpdatedAt: Equals<ConversationMeta['updatedAt'], number> = true;
const _metaProviderId: Equals<ConversationMeta['providerId'], ProviderId> = true;
const _metaSessionId: Equals<ConversationMeta['sessionId'], string | null> = true;
void _metaId;
void _metaTitle;
void _metaTitleManual;
void _metaCreatedAt;
void _metaUpdatedAt;
void _metaProviderId;
void _metaSessionId;

// ---- ConversationRecord field shapes ----
const _recVersion: Equals<ConversationRecord['version'], number> = true;
const _recMeta: Equals<ConversationRecord['meta'], ConversationMeta> = true;
const _recMessages: Equals<ConversationRecord['messages'], ChatMessage[]> = true;
const _recProviderState: Equals<ConversationRecord['providerState'], ProviderSessionState> = true;
void _recVersion;
void _recMeta;
void _recMessages;
void _recProviderState;

// ---- ProviderSessionState is the opaque record bag ----
const _providerState: Equals<ProviderSessionState, Record<string, unknown>> = true;
void _providerState;

// ---- ClaudeProviderState documentary keys (all optional) ----
const _claudeSessionId: Equals<ClaudeProviderState['providerSessionId'], string | undefined> = true;
const _claudeForkSource: Equals<
	ClaudeProviderState['forkSource'],
	{ sessionId: string; resumeAt: string } | undefined
> = true;
const _claudePrev: Equals<
	ClaudeProviderState['previousProviderSessionIds'],
	string[] | undefined
> = true;
void _claudeSessionId;
void _claudeForkSource;
void _claudePrev;

// ---- ForkPlan field shapes ----
const _forkMessages: Equals<ForkPlan['messages'], ChatMessage[]> = true;
const _forkProviderState: Equals<ForkPlan['providerState'], ProviderSessionState> = true;
const _forkSourceTitle: Equals<ForkPlan['sourceTitle'], string> = true;
void _forkMessages;
void _forkProviderState;
void _forkSourceTitle;

// ---- NO credential/secret field anywhere (NFR-TS-013) ----
const _noApiKeyOnMeta: Equals<HasKey<ConversationMeta, 'apiKey'>, false> = true;
const _noTokenOnMeta: Equals<HasKey<ConversationMeta, 'token'>, false> = true;
const _noSecretOnMeta: Equals<HasKey<ConversationMeta, 'secret'>, false> = true;
const _noApiKeyOnRecord: Equals<HasKey<ConversationRecord, 'apiKey'>, false> = true;
const _noTokenOnRecord: Equals<HasKey<ConversationRecord, 'token'>, false> = true;
const _noSecretOnRecord: Equals<HasKey<ConversationRecord, 'secret'>, false> = true;
const _noCredentialsOnRecord: Equals<HasKey<ConversationRecord, 'credentials'>, false> = true;
void _noApiKeyOnMeta;
void _noTokenOnMeta;
void _noSecretOnMeta;
void _noApiKeyOnRecord;
void _noTokenOnRecord;
void _noSecretOnRecord;
void _noCredentialsOnRecord;

describe('ConversationRecord types (TEST-TS-002)', () => {
	it('exposes CONVERSATION_RECORD_VERSION === 1 as a constant', () => {
		expect(CONVERSATION_RECORD_VERSION).toBe(1);
	});

	it('constructs a valid record with a P1-shaped (no contentBlocks) transcript', () => {
		const record: ConversationRecord = {
			version: CONVERSATION_RECORD_VERSION,
			meta: {
				id: 'c1',
				title: 'A conversation',
				titleManual: false,
				createdAt: 1,
				updatedAt: 2,
				providerId: 'claude',
				sessionId: 'sess-1',
			},
			messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
			providerState: { providerSessionId: 'sess-1' },
		};
		expect(record.version).toBe(1);
		expect(record.meta.id).toBe('c1');
		expect(record.messages).toHaveLength(1);
		expect(record.messages[0]?.contentBlocks).toBeUndefined();
	});

	it('derives a ForkPlan with a forkSource providerState (not a transcript copy)', () => {
		const plan: ForkPlan = {
			messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
			providerState: { forkSource: { sessionId: 'sess-1', resumeAt: 'm1' } },
			sourceTitle: 'Source title',
		};
		const state = plan.providerState as ClaudeProviderState;
		expect(state.forkSource?.resumeAt).toBe('m1');
		expect(plan.sourceTitle).toBe('Source title');
	});
});
