/**
 * T-TS-002 (TEST-TS-004) — RED: `ChatMessage` gains optional
 * `userMessageId` / `assistantMessageId` / `resumeAtMessageId`; the six P1 + two
 * P2 fields stay intact; the still-excluded members (`images`, `currentNote`,
 * `isInterrupt`, `isRebuiltContext`, `durationFlavorWord`) stay absent.
 *
 * The compile-time `Equals<>` asserts on the three rewind ids fail
 * `vue-tsc -p tsconfig.lint.json` until T-TS-005 grows `ChatMessage`.
 *
 * Traces: TEST-TS-004, SPEC-TS-004, REQ-TS-019/021/028; ADR-TS-002 §4.
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

// ---- the two P2 fields intact ----
const _contentBlocks: Equals<ChatMessage['contentBlocks'], ContentBlock[] | undefined> = true;
const _toolCalls: Equals<ChatMessage['toolCalls'], ToolCall[] | undefined> = true;
void _contentBlocks;
void _toolCalls;

// ---- P3 additive: the three optional rewind ids ----
const _userMessageId: Equals<ChatMessage['userMessageId'], string | undefined> = true;
const _assistantMessageId: Equals<ChatMessage['assistantMessageId'], string | undefined> = true;
const _resumeAtMessageId: Equals<ChatMessage['resumeAtMessageId'], string | undefined> = true;
void _userMessageId;
void _assistantMessageId;
void _resumeAtMessageId;

// ---- still-excluded members (later-phase) ----
const _noImages: Equals<HasKey<ChatMessage, 'images'>, false> = true;
const _noCurrentNote: Equals<HasKey<ChatMessage, 'currentNote'>, false> = true;
const _noIsInterrupt: Equals<HasKey<ChatMessage, 'isInterrupt'>, false> = true;
const _noIsRebuiltContext: Equals<HasKey<ChatMessage, 'isRebuiltContext'>, false> = true;
const _noDurationFlavorWord: Equals<HasKey<ChatMessage, 'durationFlavorWord'>, false> = true;
void _noImages;
void _noCurrentNote;
void _noIsInterrupt;
void _noIsRebuiltContext;
void _noDurationFlavorWord;

describe('ChatMessage rewind-id growth (TEST-TS-004)', () => {
	it('renders a P1/P2-shaped message unchanged (no rewind ids)', () => {
		const msg: ChatMessage = { id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 };
		expect(msg.userMessageId).toBeUndefined();
		expect(msg.assistantMessageId).toBeUndefined();
		expect(msg.resumeAtMessageId).toBeUndefined();
	});

	it('carries the three rewind ids when present', () => {
		const msg: ChatMessage = {
			id: 'm2',
			role: 'assistant',
			content: 'reply',
			timestamp: 2,
			userMessageId: 'u1',
			assistantMessageId: 'a1',
			resumeAtMessageId: 'a0',
		};
		expect(msg.userMessageId).toBe('u1');
		expect(msg.assistantMessageId).toBe('a1');
		expect(msg.resumeAtMessageId).toBe('a0');
	});
});
