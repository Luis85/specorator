import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * `transportStatusStore` — surfaces transport-layer health for the agent
 * sidepanel. Drives `<TransportStatusPill>` at the top of `MessageList`.
 *
 * Spec §1.3.10 / §1.6 — `agent.transport.*` microcopy. Satisfies REQ-AUX-016.
 *
 * The store is intentionally dormant: it starts at `'idle'` and stays there
 * until the orchestration layer signals a non-idle transport state. The
 * dormant `ChatDegradedState` component (in `src/ui/components/chat/`)
 * continues to handle the "feature unavailable" branches; this store covers
 * the in-flight transport-health pulse (connecting / degraded / offline).
 */
export type TransportStatusKind = 'idle' | 'connecting' | 'degraded' | 'offline';

export const useTransportStatusStore = defineStore('transportStatus', () => {
	const kind = ref<TransportStatusKind>('idle');
	/** Optional diagnostic appended to the pill (e.g. `ECONNREFUSED`). */
	const diagnostic = ref<string>('');

	function setKind(next: TransportStatusKind): void {
		kind.value = next;
	}

	function setDiagnostic(next: string): void {
		diagnostic.value = next;
	}

	function reset(): void {
		kind.value = 'idle';
		diagnostic.value = '';
	}

	return { kind, diagnostic, setKind, setDiagnostic, reset };
});
