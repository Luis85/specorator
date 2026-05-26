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
 * T-PV-010 (RED → green) — the P9 widened `CHAT_RUNTIME_FACTORY` + the
 * `OPEN_PROVIDER_CONSENT` seam (TEST-PV-010/011/082/113/114, SPEC-PV-005/031):
 * `ChatRuntimeFactory` widens to `(providerId: ProviderId) => Result<ChatRuntimePort>`
 * (the construct-fail path is `Result.err`, not a throw); `useChatRuntimeFactory()`
 * still throws-when-absent (the surface needs it); the appended `OpenProviderConsentFn`
 * = `(providerId) => Promise<boolean>` + `OPEN_PROVIDER_CONSENT` key;
 * `useOpenProviderConsent()` falls back to an AUTO-DECLINE (`false`) when absent (a
 * missing launcher must never silently read beyond the vault — mirrors
 * `useConfirmDelete`). The P3–P8 handles stay byte-identical (additivity).
 *
 * Traces: REQ-CP-017, REQ-CA-008/020, NFR-CP-003, NFR-CA-003,
 * REQ-PV-010/011/012/082/113/114, NFR-PV-001/008.
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
	CHAT_RUNTIME_FACTORY,
	useChatRuntimeFactory,
	type ChatRuntimeFactory,
	OPEN_PROVIDER_CONSENT,
	useOpenProviderConsent,
	type OpenProviderConsentFn,
} from '@/ui/chat/modalSeam';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import type { ChatRuntimePort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';

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

// ── T-PV-010 (RED → green): the P9 widened factory + consent seam (SPEC-PV-005/031) ──
// `ChatRuntimeFactory` widens to `(providerId) => Result<ChatRuntimePort>`. The
// construct-fail path is a `Result.err`, not a throw (REQ-PV-011). `OPEN_PROVIDER_CONSENT`
// is the beyond-vault consent launcher; `useOpenProviderConsent()` auto-declines
// (`false`) when absent (REQ-PV-082/113) — a missing launcher never silently reads
// beyond the vault.

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The widened factory signature (TEST-PV-114 compile leg, SPEC-PV-005) ----
const _factorySig: Equals<
	ChatRuntimeFactory,
	(providerId: ProviderId) => Result<ChatRuntimePort>
> = true;
void _factorySig;

// ---- The consent fn signature (SPEC-PV-005) ----
const _consentSig: Equals<OpenProviderConsentFn, (providerId: ProviderId) => Promise<boolean>> =
	true;
void _consentSig;

/** A throwaway stub runtime — only its identity matters for the factory leg. */
const stubRuntime = { providerId: 'claude' } as unknown as ChatRuntimePort;

/** Mount a probe calling `useChatRuntimeFactory()` under an optional provide. */
function probeFactory(provided?: ChatRuntimeFactory): ChatRuntimeFactory {
	let captured!: ChatRuntimeFactory;
	const Probe = defineComponent({
		setup() {
			captured = useChatRuntimeFactory();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [CHAT_RUNTIME_FACTORY as symbol]: provided } } : {},
	});
	return captured;
}

/** Mount a probe calling `useOpenProviderConsent()` under an optional provide. */
function probeConsent(provided?: OpenProviderConsentFn): OpenProviderConsentFn {
	let captured!: OpenProviderConsentFn;
	const Probe = defineComponent({
		setup() {
			captured = useOpenProviderConsent();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [OPEN_PROVIDER_CONSENT as symbol]: provided } } : {},
	});
	return captured;
}

describe('useChatRuntimeFactory widened (TEST-PV-010/011/114, SPEC-PV-005/031)', () => {
	it('returns the provided widened factory; a registered provider → Result.ok(runtime)', () => {
		const factory: ChatRuntimeFactory = () => ({ ok: true, value: stubRuntime });
		const fn = probeFactory(factory);
		const result = fn('claude');
		expect(result.ok).toBe(true);
		expect(result.ok && result.value).toBe(stubRuntime);
	});

	it('the construct-fail path is a Result.err, never a throw (REQ-PV-011)', () => {
		const factory: ChatRuntimeFactory = () => ({ ok: false, error: new Error('no key') });
		const fn = probeFactory(factory);
		const result = fn('codex');
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error.message).toBe('no key');
	});

	it('still throws-when-absent (the surface needs it, byte-identical to P3-P8)', () => {
		expect(() => probeFactory()).toThrow(/ChatRuntimeFactory was not provided/);
	});
});

describe('useOpenProviderConsent (TEST-PV-082/113, SPEC-PV-005)', () => {
	it('returns the provided launcher when OPEN_PROVIDER_CONSENT is provided', async () => {
		let seen: ProviderId | null = null;
		const fn = probeConsent((providerId) => {
			seen = providerId;
			return Promise.resolve(true);
		});
		await expect(fn('codex')).resolves.toBe(true);
		expect(seen).toBe('codex');
	});

	it('falls back to an AUTO-DECLINE (false) when absent (no silent beyond-vault read)', async () => {
		const fn = probeConsent();
		await expect(fn('codex')).resolves.toBe(false);
	});
});
