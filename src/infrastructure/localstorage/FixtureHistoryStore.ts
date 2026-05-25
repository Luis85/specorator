import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
} from '@/domain/chat/ConversationRecord';

/**
 * The fixture-seeded conversation records for the GitHub Pages demo (SPEC-TS-008).
 * Three canned conversations with distinct `updatedAt` so the history list shows a
 * populated, ordered set. No secret — provider-neutral metadata only (NFR-TS-013).
 */
const FIXTURE_RECORDS: readonly ConversationRecord[] = [
	{
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id: 'demo-001',
			title: 'Plan the rich-rendering demo',
			titleManual: false,
			createdAt: 1_700_000_000_000,
			updatedAt: 1_700_000_300_000,
			providerId: 'claude',
			sessionId: 'demo-session-001',
		},
		messages: [
			{ id: 'demo-001-u1', role: 'user', content: 'How do I preview the demo?', timestamp: 1_700_000_000_000 },
			{
				id: 'demo-001-a1',
				role: 'assistant',
				content: 'Open the standalone UI and pick a conversation from history.',
				timestamp: 1_700_000_010_000,
				assistantMessageId: 'demo-001-a1',
			},
		],
		providerState: { providerSessionId: 'demo-session-001' },
	},
	{
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id: 'demo-002',
			title: 'Explain the tabs store',
			titleManual: true,
			createdAt: 1_700_000_100_000,
			updatedAt: 1_700_000_200_000,
			providerId: 'claude',
			sessionId: 'demo-session-002',
		},
		messages: [
			{ id: 'demo-002-u1', role: 'user', content: 'What keeps tabs isolated?', timestamp: 1_700_000_100_000 },
			{
				id: 'demo-002-a1',
				role: 'assistant',
				content: 'One runtime instance per tab — streaming is isolated by construction.',
				timestamp: 1_700_000_110_000,
				assistantMessageId: 'demo-002-a1',
			},
		],
		providerState: { providerSessionId: 'demo-session-002' },
	},
	{
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id: 'demo-003',
			title: 'Fork an earlier turn',
			titleManual: false,
			createdAt: 1_700_000_050_000,
			updatedAt: 1_700_000_100_000,
			providerId: 'claude',
			sessionId: 'demo-session-003',
		},
		messages: [
			{ id: 'demo-003-u1', role: 'user', content: 'Can I branch this conversation?', timestamp: 1_700_000_050_000 },
			{
				id: 'demo-003-a1',
				role: 'assistant',
				content: 'Yes — fork derives a new conversation from the chosen turn.',
				timestamp: 1_700_000_060_000,
				assistantMessageId: 'demo-003-a1',
			},
		],
		providerState: { providerSessionId: 'demo-session-003' },
	},
];

/**
 * Fixture-seeded `ProviderHistoryPort` for the GitHub Pages demo (SPEC-TS-008).
 * Backed by a `MockHistoryStore` seeded with {@link FIXTURE_RECORDS} so the demo
 * shows a populated, ordered history list. Writes are **non-durable** — they
 * mutate the in-memory store for the session but do not persist across reload
 * (correct for a stateless public demo, NFR-TS-002). A fresh instance re-seeds.
 */
export class FixtureHistoryStore extends MockHistoryStore {
	constructor() {
		super(FIXTURE_RECORDS);
	}
}
