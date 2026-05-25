import { inject, type InjectionKey } from 'vue';
import type { ForkTarget } from '@/application/threads/chooseForkTarget';
import type { ChatRuntimePort } from '@/domain/ports';

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
 * Build one fresh `ChatRuntimePort` per tab (SPEC-TS-027, ADR-TS-002 §1). The
 * `tabsStore` calls this per `openTab` so each tab streams on its own runtime
 * (per-tab isolation). The mount points wrap `bridge.createChatRuntime`.
 */
export type ChatRuntimeFactory = () => ChatRuntimePort;

export const CONFIRM_DELETE: InjectionKey<ConfirmDeleteFn> = Symbol('ConfirmDelete');
export const CHOOSE_FORK_TARGET: InjectionKey<ChooseForkTargetFn> = Symbol('ChooseForkTarget');
export const CHAT_RUNTIME_FACTORY: InjectionKey<ChatRuntimeFactory> = Symbol('ChatRuntimeFactory');

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
			'ChatRuntimeFactory was not provided. Call app.provide(CHAT_RUNTIME_FACTORY, () => bridge.createChatRuntime()) before mounting.',
		);
	}
	return factory;
}
