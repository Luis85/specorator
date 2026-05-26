import { inject, type InjectionKey } from 'vue';
import type { ForkTarget } from '@/application/threads/chooseForkTarget';
import type { ChatRuntimePort } from '@/domain/ports';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import type { Result } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The plugin-owned modal-launch seam (SPEC-TS-023/024, NFR-TS-007). The Obsidian
 * `ForkTargetModal` / `DeleteConfirmModal` subclasses import `obsidian`, so they
 * live with the view (`src/plugin/`), NOT under `src/ui/**`. The Vue components
 * launch them through these injected function handles — a thin seam so the
 * components stay free of `obsidian` and never call `window.confirm`/`prompt`/
 * `alert`. The standalone entry provides browser-safe stand-ins (no `window.*`).
 */

/** Confirm a destructive delete; resolves `true` to proceed (SPEC-TS-024). */
export type ConfirmDeleteFn = (message: string) => Promise<boolean>;

/** Choose where a fork lands; resolves `null` on dismiss (SPEC-TS-023). */
export type ChooseForkTargetFn = () => Promise<ForkTarget | null>;

/**
 * Build one fresh `ChatRuntimePort` per tab for a provider (SPEC-TS-027/PV-005,
 * ADR-TS-002 §1 / ADR-PV-001 §2). The `tabsStore` calls this per `openTab` so each
 * tab streams on its own runtime (per-tab isolation). The mount points wrap
 * `bridge.createChatRuntime(providerId)`.
 *
 * **WIDENED in P9 (was `() => ChatRuntimePort`):** the construction is now
 * parameterised by provider and returns a `Result` — a no-key / no-CLI /
 * transport-unavailable construction → `Result.err`, never a throw (REQ-PV-011).
 * Every provide-site + the tabs store passes the resolved active provider (default
 * `'claude'`); a Claude-only configuration yields `ok` with the SAME runtime as P8
 * (byte-identical, NFR-PV-001, SPEC-PV-031).
 */
export type ChatRuntimeFactory = (providerId: ProviderId) => Result<ChatRuntimePort>;

/**
 * Confirm an instruction before it is appended to the custom system prompt;
 * resolves the decision or `null` on dismiss (SPEC-CP-027, REQ-CP-017). The real
 * launcher opens the Obsidian `InstructionConfirmModal` (`src/plugin/modals/`);
 * the standalone entry provides a browser-safe stand-in (no `window.*`).
 */
export type InstructionConfirmResult =
	| { kind: 'accept'; instruction: string } // accept (possibly edited) → append
	| { kind: 'reject' }; // reject → persist nothing

export type InstructionConfirmFn = (
	instruction: string,
) => Promise<InstructionConfirmResult | null>;

export const CONFIRM_DELETE: InjectionKey<ConfirmDeleteFn> = Symbol('ConfirmDelete');
export const CHOOSE_FORK_TARGET: InjectionKey<ChooseForkTargetFn> = Symbol('ChooseForkTarget');
export const CHAT_RUNTIME_FACTORY: InjectionKey<ChatRuntimeFactory> = Symbol('ChatRuntimeFactory');
export const INSTRUCTION_CONFIRM: InjectionKey<InstructionConfirmFn> = Symbol('InstructionConfirm');

/** Inject the confirm-delete launcher; falls back to an auto-decline when absent. */
export function useConfirmDelete(): ConfirmDeleteFn {
	return inject(CONFIRM_DELETE, () => Promise.resolve(false));
}

/** Inject the fork-target chooser; falls back to a dismiss when absent. */
export function useChooseForkTarget(): ChooseForkTargetFn {
	return inject(CHOOSE_FORK_TARGET, () => Promise.resolve(null));
}

/** Inject the per-tab runtime factory; throws when absent (the surface needs it). */
export function useChatRuntimeFactory(): ChatRuntimeFactory {
	const factory = inject(CHAT_RUNTIME_FACTORY);
	if (factory === undefined) {
		throw new Error(
			'ChatRuntimeFactory was not provided. Call app.provide(CHAT_RUNTIME_FACTORY, (providerId) => bridge.createChatRuntime(providerId)) before mounting.',
		);
	}
	return factory;
}

/**
 * Inject the instruction-confirm launcher; falls back to an AUTO-REJECT when
 * absent (SPEC-CP-027) — a missing launcher must never silently persist an
 * instruction (REQ-CP-017). Mirrors `useConfirmDelete`'s auto-decline fallback.
 */
export function useInstructionConfirm(): InstructionConfirmFn {
	return inject(INSTRUCTION_CONFIRM, () => Promise.resolve<InstructionConfirmResult>({ kind: 'reject' }));
}

// ── P5 context-attachments seam additions (SPEC-CA-023, ADR-CA-004 §1) ───────────
// Additive — the four P3/P4 handles above stay byte-identical. The real launchers
// open the Obsidian `InlineEditModal` / `ImagePreviewModal` (`src/plugin/modals/`);
// the standalone entry provides browser-safe stand-ins (no `window.*`).

/** The inline-edit decision the modal resolves (REQ-CA-024/025); null on dismiss → reject (note unchanged). */
export type InlineEditDecision =
	| { kind: 'accept'; editedText: string } // apply the (insertion-or-replacement) edited text (REQ-CA-024)
	| { kind: 'reject' }; // note unchanged, highlight restored (REQ-CA-025)

/** Open the inline-edit modal, pre-bound to the selection; resolves the decision or null on dismiss. */
export type OpenInlineEditFn = (
	selectedText: string,
	notePath?: string,
) => Promise<InlineEditDecision | null>;

/** Open the full-size image preview; resolves when dismissed (REQ-CA-008). */
export type OpenImagePreviewFn = (image: AttachedImage) => Promise<void>;

export const OPEN_INLINE_EDIT: InjectionKey<OpenInlineEditFn> = Symbol('OpenInlineEdit');
export const OPEN_IMAGE_PREVIEW: InjectionKey<OpenImagePreviewFn> = Symbol('OpenImagePreview');

/**
 * Inject the inline-edit launcher; falls back to an AUTO-REJECT (`null`) when
 * absent (SPEC-CA-023) — a missing launcher must NEVER silently apply an edit
 * (REQ-CA-008/020, NFR-CA-003). Mirrors `useInstructionConfirm`'s auto-reject.
 */
export function useOpenInlineEdit(): OpenInlineEditFn {
	return inject(OPEN_INLINE_EDIT, () => Promise.resolve(null));
}

/** Inject the image-preview launcher; falls back to a no-op resolve when absent (SPEC-CA-023). */
export function useOpenImagePreview(): OpenImagePreviewFn {
	return inject(OPEN_IMAGE_PREVIEW, () => Promise.resolve());
}

// ── FIX-2.2: the paperclip attach-picker seam (SPEC-CA-022/026, R-CA-002) ────────
// The vault file/image picker is Obsidian-specific (a `SuggestModal`/file picker),
// so the real launcher lives in `src/plugin/**` (coverage-excluded, manual leg);
// the Vue layer only injects this handle and never imports `obsidian`. The
// standalone entry provides a browser-safe stand-in.

/** A picked vault attachment: its vault-relative path + whether to treat it as an image. */
export interface PickedAttachment {
	readonly kind: 'file' | 'image';
	readonly path: string;
}

/** Open the vault file/image picker; resolves the picked attachment or `null` on dismiss. */
export type PickAttachmentFn = () => Promise<PickedAttachment | null>;

export const PICK_ATTACHMENT: InjectionKey<PickAttachmentFn> = Symbol('PickAttachment');

/**
 * Inject the attach-picker launcher; falls back to a no-op resolving `null` when
 * absent (SPEC-CA-022/026) — an unwired picker attaches nothing. Mirrors the
 * `useChooseForkTarget` dismiss fallback.
 */
export function usePickAttachment(): PickAttachmentFn {
	return inject(PICK_ATTACHMENT, () => Promise.resolve(null));
}

// ── P8 MCP modal-seam launchers (SPEC-MC-023, ADR-MC-003) ────────────────────────
// Additive — the P3/P4/P5 handles above stay byte-identical. The real Obsidian
// `Modal` hosts (`McpServerModal` / `McpTestModal`) import `obsidian`, so they live
// with the view (`src/plugin/**`), NOT under `src/ui/**`. The Vue settings surface
// launches them through these handles; the standalone entry provides browser-safe
// stand-ins (no `window.*`).

/** Open the add/edit server modal (add when `input` absent, edit when present); resolves the draft or `null` on dismiss (REQ-MC-010/012/042). */
export type OpenMcpServerModalFn = (input?: McpServerDraft) => Promise<McpServerDraft | null>;

/** Open the test-result modal (owns its own probe + per-tool toggle lifecycle); resolves when dismissed (REQ-MC-044). */
export type OpenMcpTestModalFn = (server: ManagedMcpServer) => Promise<void>;

export const OPEN_MCP_SERVER_MODAL: InjectionKey<OpenMcpServerModalFn> =
	Symbol('OpenMcpServerModal');
export const OPEN_MCP_TEST_MODAL: InjectionKey<OpenMcpTestModalFn> = Symbol('OpenMcpTestModal');

/**
 * Inject the add/edit-server-modal launcher; falls back to an AUTO-DISMISS (`null`)
 * when absent (SPEC-MC-023) — a missing launcher adds nothing (REQ-MC-042). Mirrors
 * `useOpenInlineEdit`'s auto-reject fallback.
 */
export function useOpenMcpServerModal(): OpenMcpServerModalFn {
	return inject(OPEN_MCP_SERVER_MODAL, () => Promise.resolve(null));
}

/** Inject the test-modal launcher; falls back to a no-op resolve when absent (SPEC-MC-023). */
export function useOpenMcpTestModal(): OpenMcpTestModalFn {
	return inject(OPEN_MCP_TEST_MODAL, () => Promise.resolve());
}

// ── P9 provider beyond-vault consent seam (SPEC-PV-005, ADR-PV-003 §2) ───────────────
// Additive — every P3..P8 handle above stays byte-identical. The real Obsidian `Modal`
// host lives in `src/plugin/**` (the modal seam target); the standalone entry provides
// a browser-safe stand-in (no `window.*`).

/** Open the one-time beyond-vault consent modal for `providerId`; resolves the user's choice (REQ-PV-082). */
export type OpenProviderConsentFn = (providerId: ProviderId) => Promise<boolean>;

export const OPEN_PROVIDER_CONSENT: InjectionKey<OpenProviderConsentFn> =
	Symbol('OpenProviderConsent');

/**
 * Inject the beyond-vault consent launcher; falls back to an AUTO-DECLINE (`false`)
 * when absent (SPEC-PV-005) — a missing launcher must NEVER silently read beyond the
 * vault (REQ-PV-082/113). Mirrors `useConfirmDelete`'s auto-decline fallback.
 */
export function useOpenProviderConsent(): OpenProviderConsentFn {
	return inject(OPEN_PROVIDER_CONSENT, () => Promise.resolve(false));
}
