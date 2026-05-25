/**
 * T-CA-002 (TEST-CA-001 + TEST-CA-002) — RED: `ChatTurnRequest` gains EXACTLY the
 * five additive optional context fields (`attachedFiles?` / `images?` /
 * `editorSelection?` / `canvasSelection?` / `browserSelection?`); the P1 `text` +
 * `currentNotePath` stay byte-identical; a `{ text }`-only request serialises
 * byte-identically to P1; `PreparedChatTurn` / `ChatRuntimeQueryOptions` /
 * `ChatRuntimeEnsureReadyOptions` unchanged (SPEC-CA-001/028, additivity).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-004 appends the five fields
 * (and T-CA-003 supplies the DTOs they reference).
 *
 * Traces: TEST-CA-001, TEST-CA-002, SPEC-CA-001, SPEC-CA-003, SPEC-CA-028,
 * REQ-CA-004/010/019, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
} from '@/domain/chat/ChatTurn';
import type {
	AttachedFileRef,
	AttachedImage,
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
} from '@/domain/chat/attachments';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- ChatTurnRequest gains EXACTLY the five additive optional fields ----
type ExpectedRequestKeys =
	// P1 members (byte-identical)
	| 'text'
	| 'currentNotePath'
	// the five P5 additive optional context fields
	| 'attachedFiles'
	| 'images'
	| 'editorSelection'
	| 'canvasSelection'
	| 'browserSelection';
const _exactKeys: Equals<keyof ChatTurnRequest, ExpectedRequestKeys> = true;
void _exactKeys;

// P1 members byte-identical.
const _text: Equals<ChatTurnRequest['text'], string> = true;
const _notePath: Equals<ChatTurnRequest['currentNotePath'], string | undefined> = true;
void _text;
void _notePath;

// Each additive field is optional and carries the DTO type.
const _attachedFiles: Equals<
	ChatTurnRequest['attachedFiles'],
	readonly AttachedFileRef[] | undefined
> = true;
const _images: Equals<ChatTurnRequest['images'], readonly AttachedImage[] | undefined> = true;
const _editorSel: Equals<
	ChatTurnRequest['editorSelection'],
	EditorSelectionContext | undefined
> = true;
const _canvasSel: Equals<
	ChatTurnRequest['canvasSelection'],
	CanvasSelectionContext | undefined
> = true;
const _browserSel: Equals<
	ChatTurnRequest['browserSelection'],
	BrowserSelectionContext | undefined
> = true;
void _attachedFiles;
void _images;
void _editorSel;
void _canvasSel;
void _browserSel;

// PreparedChatTurn / ChatRuntimeQueryOptions / ChatRuntimeEnsureReadyOptions stay byte-identical.
const _preparedKeys: Equals<
	keyof PreparedChatTurn,
	'request' | 'persistedContent' | 'prompt' | 'isCompact' | 'mcpMentions'
> = true;
const _queryKeys: Equals<
	keyof ChatRuntimeQueryOptions,
	'model' | 'forceColdStart' | 'appendSystemPrompt'
> = true;
const _ensureKeys: Equals<
	keyof ChatRuntimeEnsureReadyOptions,
	'allowSessionCreation' | 'force'
> = true;
void _preparedKeys;
void _queryKeys;
void _ensureKeys;

describe('ChatTurnRequest P5 additive context fields (TEST-CA-001)', () => {
	it('constructs a request with all five context fields', () => {
		const req: ChatTurnRequest = {
			text: 'hi',
			attachedFiles: [{ path: 'a.md', displayName: 'a' }],
			images: [{ path: 'i.png', mimeType: 'image/png', byteSize: 4, dataBase64: 'AAAA' }],
			editorSelection: {
				kind: 'editor',
				notePath: 'a.md',
				selectedText: 's',
				startLine: 0,
				lineCount: 1,
			},
			canvasSelection: { kind: 'canvas', canvasPath: 'b.canvas', nodeIds: ['n1'] },
			browserSelection: { kind: 'browser', source: 'w', selectedText: 's' },
		};
		expect(req.attachedFiles).toHaveLength(1);
		expect(req.images?.[0].mimeType).toBe('image/png');
	});
});

describe('ChatTurnRequest additivity / serialisation (TEST-CA-002)', () => {
	it('serialises a { text }-only request byte-identically to P1', () => {
		const p1: ChatTurnRequest = { text: 'hello' };
		// A text-only request carries no P5 context — the JSON is identical to P1.
		expect(JSON.parse(JSON.stringify(p1))).toEqual({ text: 'hello' });
		expect(Object.keys(p1)).toEqual(['text']);
	});

	it('serialises a { text, currentNotePath }-only request byte-identically to P1', () => {
		const p1: ChatTurnRequest = { text: 'hello', currentNotePath: 'note.md' };
		expect(JSON.parse(JSON.stringify(p1))).toEqual({ text: 'hello', currentNotePath: 'note.md' });
	});
});
