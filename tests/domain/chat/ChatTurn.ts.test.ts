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
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { EnabledMcpServers } from '@/domain/chat/mcp';

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

// PreparedChatTurn / ChatRuntimeEnsureReadyOptions stay byte-identical (P5 + P6).
const _preparedKeys: Equals<
	keyof PreparedChatTurn,
	'request' | 'persistedContent' | 'prompt' | 'isCompact' | 'mcpMentions'
> = true;
const _ensureKeys: Equals<
	keyof ChatRuntimeEnsureReadyOptions,
	'allowSessionCreation' | 'force'
> = true;
void _preparedKeys;
void _ensureKeys;

// ---- T-TC-002 (TEST-TC-027 additivity leg, SPEC-TC-001/027) ----
// `ChatRuntimeQueryOptions` gains EXACTLY the three additive optional fields
// (`mode?`/`reasoning?`/`serviceTier?`) appended after `appendSystemPrompt`; the
// P0–P5 `model?`/`forceColdStart?`/`appendSystemPrompt?` stay byte-identical.
// ---- T-AS-002 (TEST-AS-002 type-shape leg, SPEC-AS-002/021) ----
// `ChatRuntimeQueryOptions` gains EXACTLY one further additive optional field
// `permissionMode?: PermissionMode` appended AFTER `serviceTier`; the P0–P6
// `model?`/`forceColdStart?`/`appendSystemPrompt?`/`mode?`/`reasoning?`/`serviceTier?`
// stay byte-identical.
// ---- T-MC-002 (TEST-MC-001 type-shape leg, SPEC-MC-002/022) ----
// `ChatRuntimeQueryOptions` gains EXACTLY one further additive optional field
// `enabledMcpServers?: EnabledMcpServers` appended AFTER `permissionMode`; the
// P0–P7 members stay byte-identical; `externalContextPaths?` stays EXCLUDED.
const _queryKeys: Equals<
	keyof ChatRuntimeQueryOptions,
	| 'model'
	| 'forceColdStart'
	| 'appendSystemPrompt'
	| 'mode'
	| 'reasoning'
	| 'serviceTier'
	| 'permissionMode'
	| 'enabledMcpServers'
> = true;
void _queryKeys;

// `externalContextPaths?` stays EXCLUDED (a later phase, NG3).
const _noExternalContext: Equals<
	'externalContextPaths' extends keyof ChatRuntimeQueryOptions ? true : false,
	false
> = true;
void _noExternalContext;

// The P7 additive field carries its contracted optional PermissionMode type.
const _qPermissionMode: Equals<
	ChatRuntimeQueryOptions['permissionMode'],
	PermissionMode | undefined
> = true;
void _qPermissionMode;

// The P8 additive field carries its contracted optional EnabledMcpServers type.
const _qEnabledMcp: Equals<
	ChatRuntimeQueryOptions['enabledMcpServers'],
	EnabledMcpServers | undefined
> = true;
void _qEnabledMcp;

// The P0–P5 members keep their exact types.
const _qModel: Equals<ChatRuntimeQueryOptions['model'], string | undefined> = true;
const _qForceCold: Equals<ChatRuntimeQueryOptions['forceColdStart'], boolean | undefined> = true;
const _qAppend: Equals<ChatRuntimeQueryOptions['appendSystemPrompt'], string | undefined> = true;
void _qModel;
void _qForceCold;
void _qAppend;

// The three P6 additive fields carry their contracted optional types.
const _qMode: Equals<ChatRuntimeQueryOptions['mode'], string | undefined> = true;
const _qReasoning: Equals<ChatRuntimeQueryOptions['reasoning'], ReasoningChoice | undefined> = true;
const _qServiceTier: Equals<ChatRuntimeQueryOptions['serviceTier'], string | undefined> = true;
void _qMode;
void _qReasoning;
void _qServiceTier;

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

describe('ChatRuntimeQueryOptions P6 additivity / serialisation (TEST-TC-002/027)', () => {
	it('serialises a P5-shaped query (no new field) byte-identically to P5', () => {
		const p5: ChatRuntimeQueryOptions = {
			model: 'sonnet',
			forceColdStart: false,
			appendSystemPrompt: 'be terse',
		};
		// No `mode`/`reasoning`/`serviceTier` present — the JSON is identical to P5.
		expect(JSON.parse(JSON.stringify(p5))).toEqual({
			model: 'sonnet',
			forceColdStart: false,
			appendSystemPrompt: 'be terse',
		});
		expect(Object.keys(p5)).toEqual(['model', 'forceColdStart', 'appendSystemPrompt']);
	});

	it('serialises an empty query byte-identically to P5', () => {
		const empty: ChatRuntimeQueryOptions = {};
		expect(JSON.parse(JSON.stringify(empty))).toEqual({});
		expect(Object.keys(empty)).toEqual([]);
	});

	it('carries the three additive fields when present', () => {
		const reasoning: ReasoningChoice = { kind: 'effort', value: 'high' };
		const full: ChatRuntimeQueryOptions = {
			model: 'opus',
			mode: 'acceptEdits',
			reasoning,
			serviceTier: 'priority',
		};
		expect(full.mode).toBe('acceptEdits');
		expect(full.reasoning).toEqual({ kind: 'effort', value: 'high' });
		expect(full.serviceTier).toBe('priority');
	});
});

describe('ChatRuntimeQueryOptions P7 additivity / serialisation (TEST-AS-002)', () => {
	it('serialises a P6-shaped query (no permissionMode) byte-identically to P6', () => {
		const p6: ChatRuntimeQueryOptions = {
			model: 'sonnet',
			mode: 'acceptEdits',
			reasoning: { kind: 'effort', value: 'high' },
			serviceTier: 'priority',
		};
		// No `permissionMode` present — the JSON is identical to P6.
		expect(JSON.parse(JSON.stringify(p6))).toEqual({
			model: 'sonnet',
			mode: 'acceptEdits',
			reasoning: { kind: 'effort', value: 'high' },
			serviceTier: 'priority',
		});
		expect(Object.keys(p6)).toEqual(['model', 'mode', 'reasoning', 'serviceTier']);
	});

	it('carries permissionMode when present', () => {
		const mode: PermissionMode = 'yolo';
		const query: ChatRuntimeQueryOptions = { model: 'opus', permissionMode: mode };
		expect(query.permissionMode).toBe('yolo');
	});
});

describe('ChatRuntimeQueryOptions P8 additivity / serialisation (TEST-MC-082)', () => {
	it('serialises a P7-shaped query (no enabledMcpServers) byte-identically to P7', () => {
		const p7: ChatRuntimeQueryOptions = {
			model: 'sonnet',
			mode: 'acceptEdits',
			reasoning: { kind: 'effort', value: 'high' },
			serviceTier: 'priority',
			permissionMode: 'plan',
		};
		// No `enabledMcpServers` present — the JSON is identical to P7.
		expect(JSON.parse(JSON.stringify(p7))).toEqual({
			model: 'sonnet',
			mode: 'acceptEdits',
			reasoning: { kind: 'effort', value: 'high' },
			serviceTier: 'priority',
			permissionMode: 'plan',
		});
		expect(Object.keys(p7)).toEqual([
			'model',
			'mode',
			'reasoning',
			'serviceTier',
			'permissionMode',
		]);
	});

	it('an empty query folds nothing (byte-identical to a P7 no-servers turn)', () => {
		const empty: ChatRuntimeQueryOptions = {};
		expect(JSON.parse(JSON.stringify(empty))).toEqual({});
		expect(Object.keys(empty)).toEqual([]);
	});

	it('carries enabledMcpServers when present', () => {
		const enabled: EnabledMcpServers = {
			servers: { fs: { command: 'npx', args: ['-y', 'server-filesystem'] } },
			disallowedTools: ['mcp__fs__write'],
		};
		const query: ChatRuntimeQueryOptions = { model: 'opus', enabledMcpServers: enabled };
		expect(query.enabledMcpServers?.servers).toHaveProperty('fs');
		expect(query.enabledMcpServers?.disallowedTools).toEqual(['mcp__fs__write']);
	});
});

// PreparedChatTurn.mcpMentions stays the empty Set seam (P8 NG3 — no mention extractor).
const _mcpMentions: Equals<PreparedChatTurn['mcpMentions'], Set<string>> = true;
void _mcpMentions;
