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
} from '@/ui/chat/modalSeam';
import type { AttachedImage } from '@/domain/chat/attachments';

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
