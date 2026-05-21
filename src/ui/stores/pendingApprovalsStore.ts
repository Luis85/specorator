import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort'
import type { ProviderId } from '@/domain/chat/ProviderSelection'

/**
 * Decision the UI emits in response to a pending approval request.
 * Mirrors `ApprovalCard.vue`'s `decision` event payload.
 */
export type ApprovalDecisionKind = 'deny' | 'allow-once' | 'always'

/**
 * One in-flight approval request awaiting a user decision. Owns the
 * resolver callback handed in by `ChatTurnOrchestrator.resolveApproval`
 * so the UI can settle the orchestrator's `approveTool` promise.
 */
export interface PendingApproval {
	/** Stable opaque id for the `:key` and decide lookup. */
	readonly id: string
	readonly request: ChatTransportApprovalRequest
	readonly providerId: ProviderId
	/** Resolver passed by the orchestrator — invoked once on `decide()`. */
	readonly resolve: (decision: { kind: ApprovalDecisionKind }) => void
}

/**
 * Pinia store for tool-approval requests awaiting the user's decision
 * (WS-9, REQ-MPS-045). Owns the FIFO list rendered by `MessageList.vue`
 * → `ApprovalCard.vue`.
 *
 * The orchestrator publishes a request via `publishPending(...)`; the UI
 * settles it via `decide(id, kind)`. After `decide` the entry is removed.
 *
 * Pure UI store: no `obsidian` imports.
 */
export const usePendingApprovalsStore = defineStore('pendingApprovals', () => {
	const pending = ref<PendingApproval[]>([])

	/**
	 * Add a new pending request. Returns the stable id assigned to the
	 * entry so the orchestrator can correlate decisions if needed.
	 */
	function publishPending(call: {
		request: ChatTransportApprovalRequest
		providerId: ProviderId
		resolve: (decision: { kind: ApprovalDecisionKind }) => void
	}): string {
		const id = mintPendingId()
		pending.value = [...pending.value, { id, ...call }]
		return id
	}

	/**
	 * Settle the entry with `id` and remove it from the list. Calls the
	 * stored resolver exactly once; subsequent calls with the same id are
	 * no-ops (the entry is gone).
	 */
	function decide(id: string, kind: ApprovalDecisionKind): void {
		const entry = pending.value.find((p) => p.id === id)
		if (entry === undefined) return
		pending.value = pending.value.filter((p) => p.id !== id)
		entry.resolve({ kind })
	}

	/** Clear all pending entries — used by test fixtures and thread reset. */
	function reset(): void {
		pending.value = []
	}

	return { pending, publishPending, decide, reset }
})

function mintPendingId(): string {
	const g = globalThis as { crypto?: { randomUUID?: () => string } }
	if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
	return `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
