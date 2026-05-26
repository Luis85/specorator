/**
 * T-CP-043 (RED) — instruction-confirm seam handle (TEST-CP-011 confirm leg).
 *
 * SPEC-CP-027. The additive `modalSeam.ts` handle: `InstructionConfirmFn`,
 * `InstructionConfirmResult`, the `INSTRUCTION_CONFIRM` InjectionKey, and
 * `useInstructionConfirm()` falling back to an AUTO-REJECT when absent (no
 * provided launcher → no persistence write). Mirrors the P3 `useConfirmDelete`
 * /`useChooseForkTarget` auto-decline fallback.
 *
 * T-CA-037 (RED) — the P5 inline-edit + image-preview seam handles (TEST-CA-020
 * fallback leg, SPEC-CA-023): `OpenInlineEditFn` / `OpenImagePreviewFn`, the
 * `OPEN_INLINE_EDIT` / `OPEN_IMAGE_PREVIEW` keys, `useOpenInlineEdit()` falling
 * back to an AUTO-REJECT (`null`) when absent (no silent apply), and
 * `useOpenImagePreview()` falling back to a no-op resolve. The four P3/P4 handles
 * stay byte-identical (additivity).
 *
 * Traces: REQ-CP-017, REQ-CA-008/020, NFR-CP-003, NFR-CA-003.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
	INSTRUCTION_CONFIRM,
	useInstructionConfirm,
	type InstructionConfirmFn,
	type InstructionConfirmResult,
	OPEN_INLINE_EDIT,
	OPEN_IMAGE_PREVIEW,
	useOpenInlineEdit,
	useOpenImagePreview,
	type OpenInlineEditFn,
	type OpenImagePreviewFn,
	type InlineEditDecision,
	PICK_ATTACHMENT,
	usePickAttachment,
	type PickAttachmentFn,
	type PickedAttachment,
	OPEN_MCP_SERVER_MODAL,
	OPEN_MCP_TEST_MODAL,
	useOpenMcpServerModal,
	useOpenMcpTestModal,
	type OpenMcpServerModalFn,
	type OpenMcpTestModalFn,
} from '@/ui/chat/modalSeam';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

/** Mount a probe component that calls `useInstructionConfirm()` under a provide. */
function probe(provided?: InstructionConfirmFn): InstructionConfirmFn {
	let captured!: InstructionConfirmFn;
	const Probe = defineComponent({
		setup() {
			captured = useInstructionConfirm();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [INSTRUCTION_CONFIRM as symbol]: provided } } : {},
	});
	return captured;
}

describe('useInstructionConfirm (TEST-CP-011 confirm leg, SPEC-CP-027)', () => {
	it('returns the provided launcher when INSTRUCTION_CONFIRM is provided', async () => {
		const result: InstructionConfirmResult = { kind: 'accept', instruction: 'be concise' };
		const fn = probe(() => Promise.resolve(result));
		await expect(fn('be concise')).resolves.toEqual(result);
	});

	it('falls back to an auto-reject when no launcher was provided', async () => {
		const fn = probe();
		await expect(fn('anything')).resolves.toEqual({ kind: 'reject' });
	});
});

/** Mount a probe that calls `useOpenInlineEdit()` under an optional provide. */
function probeInlineEdit(provided?: OpenInlineEditFn): OpenInlineEditFn {
	let captured!: OpenInlineEditFn;
	const Probe = defineComponent({
		setup() {
			captured = useOpenInlineEdit();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [OPEN_INLINE_EDIT as symbol]: provided } } : {},
	});
	return captured;
}

/** Mount a probe that calls `useOpenImagePreview()` under an optional provide. */
function probeImagePreview(provided?: OpenImagePreviewFn): OpenImagePreviewFn {
	let captured!: OpenImagePreviewFn;
	const Probe = defineComponent({
		setup() {
			captured = useOpenImagePreview();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [OPEN_IMAGE_PREVIEW as symbol]: provided } } : {},
	});
	return captured;
}

const sampleImage: AttachedImage = {
	path: 'a/x.png',
	mimeType: 'image/png',
	byteSize: 4,
	dataBase64: 'AAA',
};

describe('useOpenInlineEdit (TEST-CA-020 fallback leg, SPEC-CA-023)', () => {
	it('returns the provided launcher when OPEN_INLINE_EDIT is provided', async () => {
		const decision: InlineEditDecision = { kind: 'accept', editedText: 'Bonjour' };
		const fn = probeInlineEdit(() => Promise.resolve(decision));
		await expect(fn('Hello', 'notes/a.md')).resolves.toEqual(decision);
	});

	it('falls back to an AUTO-REJECT (null) when no launcher was provided (no silent apply)', async () => {
		const fn = probeInlineEdit();
		await expect(fn('Hello')).resolves.toBeNull();
	});
});

describe('useOpenImagePreview (TEST-CA-020 fallback leg, SPEC-CA-023)', () => {
	it('returns the provided launcher when OPEN_IMAGE_PREVIEW is provided', async () => {
		let seen: AttachedImage | null = null;
		const fn = probeImagePreview((img) => {
			seen = img;
			return Promise.resolve();
		});
		await fn(sampleImage);
		expect(seen).toEqual(sampleImage);
	});

	it('falls back to a no-op resolve when no launcher was provided', async () => {
		const fn = probeImagePreview();
		await expect(fn(sampleImage)).resolves.toBeUndefined();
	});
});

// ── FIX-2.2 (was R-CA-002): the paperclip attach-picker seam (SPEC-CA-022/026) ───
// The vault file/image picker is Obsidian-specific → a modal-seam launcher
// (`PickAttachmentFn`) resolving the picked path + kind, or null on dismiss. The
// real picker lives in `src/plugin/**` (coverage-excluded, manual leg); the
// fallback is a no-op resolving null (no attach when unwired).

/** Mount a probe that calls `usePickAttachment()` under an optional provide. */
function probePickAttachment(provided?: PickAttachmentFn): PickAttachmentFn {
	let captured!: PickAttachmentFn;
	const Probe = defineComponent({
		setup() {
			captured = usePickAttachment();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [PICK_ATTACHMENT as symbol]: provided } } : {},
	});
	return captured;
}

describe('usePickAttachment (FIX-2.2 fallback leg, SPEC-CA-022/026)', () => {
	it('returns the provided launcher when PICK_ATTACHMENT is provided', async () => {
		const picked: PickedAttachment = { kind: 'image', path: 'img/x.png' };
		const fn = probePickAttachment(() => Promise.resolve(picked));
		await expect(fn()).resolves.toEqual(picked);
	});

	it('falls back to a no-op resolving null when no launcher was provided (no attach)', async () => {
		const fn = probePickAttachment();
		await expect(fn()).resolves.toBeNull();
	});
});

// ── T-MC-024 (RED): the P8 MCP modal-seam launchers (SPEC-MC-023) ─────────────────
// Additive — the P3/P4/P5 handles above stay byte-identical. The real Obsidian Modal
// hosts (McpServerModal / McpTestModal) live in src/plugin/**; the standalone entry
// provides browser-safe stand-ins. `useOpenMcpServerModal()` falls back to an
// AUTO-DISMISS (null) when absent (a missing launcher adds nothing, mirroring
// `useOpenInlineEdit`); `useOpenMcpTestModal()` falls back to a no-op resolve.

/** Mount a probe that calls `useOpenMcpServerModal()` under an optional provide. */
function probeMcpServerModal(provided?: OpenMcpServerModalFn): OpenMcpServerModalFn {
	let captured!: OpenMcpServerModalFn;
	const Probe = defineComponent({
		setup() {
			captured = useOpenMcpServerModal();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [OPEN_MCP_SERVER_MODAL as symbol]: provided } } : {},
	});
	return captured;
}

/** Mount a probe that calls `useOpenMcpTestModal()` under an optional provide. */
function probeMcpTestModal(provided?: OpenMcpTestModalFn): OpenMcpTestModalFn {
	let captured!: OpenMcpTestModalFn;
	const Probe = defineComponent({
		setup() {
			captured = useOpenMcpTestModal();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [OPEN_MCP_TEST_MODAL as symbol]: provided } } : {},
	});
	return captured;
}

const sampleDraft: McpServerDraft = {
	name: 'fs',
	config: { command: 'mcp-fs' },
	contextSaving: false,
};

const sampleServer: ManagedMcpServer = {
	name: 'fs',
	config: { command: 'mcp-fs' },
	enabled: true,
	contextSaving: false,
};

describe('useOpenMcpServerModal (TEST-MC-042 seam leg, SPEC-MC-023)', () => {
	it('returns the provided launcher when OPEN_MCP_SERVER_MODAL is provided', async () => {
		const fn = probeMcpServerModal((input) => Promise.resolve(input ?? sampleDraft));
		await expect(fn(sampleDraft)).resolves.toEqual(sampleDraft);
		await expect(fn()).resolves.toEqual(sampleDraft);
	});

	it('falls back to an AUTO-DISMISS (null) when no launcher was provided (no add)', async () => {
		const fn = probeMcpServerModal();
		await expect(fn(sampleDraft)).resolves.toBeNull();
		await expect(fn()).resolves.toBeNull();
	});
});

describe('useOpenMcpTestModal (TEST-MC-044 seam leg, SPEC-MC-023)', () => {
	it('returns the provided launcher when OPEN_MCP_TEST_MODAL is provided', async () => {
		let seen: ManagedMcpServer | null = null;
		const fn = probeMcpTestModal((server) => {
			seen = server;
			return Promise.resolve();
		});
		await fn(sampleServer);
		expect(seen).toEqual(sampleServer);
	});

	it('falls back to a no-op resolve when no launcher was provided', async () => {
		const fn = probeMcpTestModal();
		await expect(fn(sampleServer)).resolves.toBeUndefined();
	});
});
