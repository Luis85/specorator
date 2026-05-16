import type { ApprovalPort } from '@/domain/ports/ApprovalPort';
import type { PlanApprovalRequest, PlanDecision } from '@/domain/chat/PlanApproval';

/**
 * Field-driven mock for `ApprovalPort`. Mirrors the project's
 * MockBridge convention: settable canned outcome, request log for test
 * assertions, optional delay for race-condition tests.
 */
export class MockApprovalPort implements ApprovalPort {
	/** Decision the next `requestPlanApproval` call resolves with. */
	cannedDecision: PlanDecision = { type: 'cancel' };

	/** Append-only log of every request received. */
	readonly requestLog: PlanApprovalRequest[] = [];

	/** Artificial delay before resolving (milliseconds). */
	delayMs = 0;

	async requestPlanApproval(request: PlanApprovalRequest): Promise<PlanDecision> {
		this.requestLog.push(request);
		if (this.delayMs > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
		}
		return this.cannedDecision;
	}
}
