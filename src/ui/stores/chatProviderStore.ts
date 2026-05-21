import { defineStore } from 'pinia';
import { ref } from 'vue';

import {
	type ProviderSelection,
	type ExplicitSelection,
	isExplicit,
} from '@/domain/chat/ProviderSelection';
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry';

/** Mirror of `TransportResolution['resolved']` — kept private to avoid an
 * application-layer import cycle. */
export type ResolvedSelection = ExplicitSelection | 'degraded';

/**
 * Pinia store backing the active provider/mode selection (REQ-MPS-007).
 *
 * - `activeSelection` is the user-facing choice. It can be an explicit
 *   `{ provider, mode }` pair, or a `{ forced: 'auto' | 'degraded' }`
 *   directive that delegates resolution to the selector.
 * - `resolved` mirrors the runtime resolution (after the selector runs).
 *   UI uses this to render the badge state without re-running the selector.
 *
 * `setActiveSelection` validates explicit choices against the registry
 * supplied via `setRegistry`. Invalid choices throw synchronously — the UI
 * is expected to disable affordances that would produce invalid input.
 *
 * Satisfies REQ-MPS-006, REQ-MPS-007 (UI surface).
 */
export const useChatProviderStore = defineStore('chatProvider', () => {
	const activeSelection = ref<ProviderSelection>({ forced: 'auto' });
	const resolved = ref<ResolvedSelection>('degraded');
	const registry = ref<ProviderRegistry | null>(null);

	function setRegistry(r: ProviderRegistry | null): void {
		registry.value = r;
	}

	function setActiveSelection(s: ProviderSelection): void {
		if (isExplicit(s)) {
			const r = registry.value;
			if (r !== null) {
				const entry = r.getProvider(s.provider);
				if (entry === undefined) {
					throw new Error(`Unknown provider: ${s.provider}`);
				}
				if (!entry.capabilities.modes.includes(s.mode)) {
					throw new Error(`Provider ${s.provider} does not support mode ${s.mode}`);
				}
			}
		}
		activeSelection.value = s;
	}

	function setResolved(r: ResolvedSelection): void {
		resolved.value = r;
	}

	return {
		activeSelection,
		resolved,
		registry,
		setRegistry,
		setActiveSelection,
		setResolved,
	};
});
