import type { PlanApprovalRequest, PlanDecision } from '@/domain/chat/PlanApproval';

/**
 * Narrow port for human-in-the-loop approval requests (PR-ASV-2-plan-mode).
 * The Vue layer registers a handler via this port; the SDK callback
 * dispatches to it when the model emits `ExitPlanMode`.
 *
 * Why a port? `InlinePlanApprovalCard.vue` is Pinia-aware, but the SDK
 * callback fires from outside the Vue mount (it's wired in
 * `AgentSidepanelView.onOpen`). The port lets us inject a no-op /
 * scripted mock for tests and the eventual SDK-driven implementation
 * for production. Single method today; future increments may add
 * `requestToolApproval` etc.
 *
 * Domain layer — no `obsidian` imports.
 */
export interface ApprovalPort {
	requestPlanApproval(request: PlanApprovalRequest): Promise<PlanDecision>;
}
