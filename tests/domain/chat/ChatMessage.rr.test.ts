/**
 * T-RR-002 (TEST-RR-002) — RED: `ChatMessage` grows additively with
 * `contentBlocks?`/`toolCalls?` (claudian-main `chat.ts:46/47`), the six P1
 * fields stay byte-identical, and the still-excluded members (`images`, rewind
 * ids, `currentNote`, `isInterrupt`, `isRebuiltContext`, `durationFlavorWord`)
 * remain absent.
 *
 * The compile-time `Equals<>` asserts on `contentBlocks`/`toolCalls` fail
 * `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-006 grows
 * `ChatMessage`. (The six P1 fields stay green.)
 *
 * Traces: TEST-RR-002, SPEC-RR-008, REQ-RR-010; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type { ContentBlock } from '@/domain/chat/ContentBlock';
import type { ToolCall } from '@/domain/chat/ToolCall';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// ---- the six P1 fields intact ----
const _id: Equals<ChatMessage['id'], string> = true;
const _role: Equals<ChatMessage['role'], 'user' | 'assistant'> = true;
const _content: Equals<ChatMessage['content'], string> = true;
const _timestamp: Equals<ChatMessage['timestamp'], number> = true;
const _displayContent: Equals<ChatMessage['displayContent'], string | undefined> = true;
const _durationSeconds: Equals<ChatMessage['durationSeconds'], number | undefined> = true;
void _id;
void _role;
void _content;
void _timestamp;
void _displayContent;
void _durationSeconds;

// ---- P2 additive: contentBlocks? / toolCalls? ----
const _contentBlocks: Equals<ChatMessage['contentBlocks'], ContentBlock[] | undefined> = true;
const _toolCalls: Equals<ChatMessage['toolCalls'], ToolCall[] | undefined> = true;
void _contentBlocks;
void _toolCalls;

// ---- still-excluded members (later-phase) ----
const _noImages: Equals<HasKey<ChatMessage, 'images'>, false> = true;
const _noUserMessageId: Equals<HasKey<ChatMessage, 'userMessageId'>, false> = true;
const _noAssistantMessageId: Equals<HasKey<ChatMessage, 'assistantMessageId'>, false> = true;
const _noResumeAtMessageId: Equals<HasKey<ChatMessage, 'resumeAtMessageId'>, false> = true;
const _noCurrentNote: Equals<HasKey<ChatMessage, 'currentNote'>, false> = true;
const _noIsInterrupt: Equals<HasKey<ChatMessage, 'isInterrupt'>, false> = true;
const _noIsRebuiltContext: Equals<HasKey<ChatMessage, 'isRebuiltContext'>, false> = true;
const _noDurationFlavorWord: Equals<HasKey<ChatMessage, 'durationFlavorWord'>, false> = true;
void _noImages;
void _noUserMessageId;
void _noAssistantMessageId;
void _noResumeAtMessageId;
void _noCurrentNote;
void _noIsInterrupt;
void _noIsRebuiltContext;
void _noDurationFlavorWord;

describe('ChatMessage additive growth (TEST-RR-002)', () => {
	it('renders a P1-shaped message unchanged (no contentBlocks/toolCalls)', () => {
		const msg: ChatMessage = { id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 };
		expect(msg.contentBlocks).toBeUndefined();
		expect(msg.toolCalls).toBeUndefined();
	});

	it('carries ordered contentBlocks + tracked toolCalls when present', () => {
		const msg: ChatMessage = {
			id: 'm2',
			role: 'assistant',
			content: '',
			timestamp: 2,
			contentBlocks: [
				{ type: 'text', content: 'a' },
				{ type: 'tool_use', toolId: 't1' },
			],
			toolCalls: [{ id: 't1', name: 'Read', input: {}, status: 'completed' }],
		};
		expect(msg.contentBlocks).toHaveLength(2);
		expect(msg.toolCalls?.[0]?.id).toBe('t1');
	});
});
