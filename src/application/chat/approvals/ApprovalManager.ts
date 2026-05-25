/**
 * `ApprovalManager` — the P7 approval decision-flow use case (SPEC-AS-010/023/027/028,
 * ADR-AS-003). It sits behind the P4 `setApprovalCallback` seam and decides whether an
 * action auto-allows, auto-denies, or must surface the unchanged P4 inline block
 * (`'prompt'`). It holds the **per-surface in-memory session rules** (one instance per
 * `ChatSurface`, resolved open item #1); persisted rules are device-global and live in
 * the `ApprovalRuleStorePort` (SPEC-AS-006).
 *
 * Contract invariants:
 *  - **Mode-gate FIRST** — `yolo` auto-allows with no rule lookup; `plan` defers to the
 *    P4 exit-plan gate (`'prompt'`); `normal`/absent continues to load + match.
 *  - **Deny-wins** — any matching deny rule beats any matching allow.
 *  - **Fail-safe-to-prompt** — a store load `err` logs (NO rule content) + surfaces a
 *    non-blocking notice + returns `'prompt'`; it NEVER auto-allows (REQ-AS-054).
 *  - **Result-returning + never throws** across the approval-callback boundary
 *    (`tryAsync` around the store, the matcher is total — NFR-AS-004/009).
 *  - **No `providerId` branch** (SPEC-AS-023) — the SDK mapping stays in the runtime.
 *  - **No secret in a rule, the store, or a log** — a `{`-leading JSON-fallback pattern
 *    is persisted WITHOUT `actionPattern` (match-all for the tool, NFR-AS-002).
 *
 * No `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import { type Result, ok, err } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { ApprovalDecision } from '@/domain/chat/inline';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';
import { matchesRulePattern, ruleDedupeKey } from '@/domain/chat/approvals';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { ApprovalRuleStorePort } from '@/domain/ports';
import type { FeedbackService } from '@/application/shared/FeedbackService';

/** What `decide` resolves: an auto-decision, OR `'prompt'` meaning "surface the unchanged P4 block". */
export type ApprovalGateOutcome = ApprovalDecision | 'prompt';

/** The action identity the manager matches on — derived by the surface from the request (SPEC-AS-016). */
export interface ApprovalAction {
	readonly toolName: string;
	/** From `getActionPattern` (SPEC-AS-004); `null` ⇒ the action can't be determined. */
	readonly actionPattern: string | null;
}

export class ApprovalManager {
	/** Per-surface in-memory session rules, keyed by `ruleDedupeKey` (resolved open item #1). */
	private readonly sessionRules = new Map<string, ApprovalRule>();
	private sessionIdSeq = 0;

	constructor(
		private readonly store: ApprovalRuleStorePort,
		private readonly feedback: FeedbackService,
		/** The resolved `agent.chat.approvals.storeError` notice (the UI resolves the i18n key, SPEC-AS-022). */
		private readonly storeErrorMessage: string,
	) {}

	/**
	 * Decide whether `action` (for the active tab's `mode`) auto-allows, auto-denies,
	 * or must `'prompt'`. Mode-gate-FIRST → load (persisted ∪ session) → match
	 * (deny-wins) → auto OR `'prompt'`. Awaits the store load before resolving (open
	 * item #4); a fresh `loadRules` runs per call (no stale snapshot, EC-AS-20). On a
	 * store load error: log (NO rule content) + the storeError notice + `'prompt'` —
	 * NEVER auto-allow (REQ-AS-054). Result-returning; never throws.
	 */
	async decide(action: ApprovalAction, mode: PermissionMode): Promise<Result<ApprovalGateOutcome>> {
		// 1. Mode gate FIRST (CLAR-AS-004).
		if (mode === 'yolo') {
			return ok('allow'); // auto-approve, no rule lookup (REQ-AS-004/024, EC-AS-3)
		}
		if (mode === 'plan') {
			// The surface routes the agent's edit attempt through the P4 exit-plan block;
			// the manager defers (plan-gating is owned by the P4 callback, REQ-AS-005).
			return ok('prompt');
		}

		// 2. Load the persisted rules (await). A store fault fails safe to prompt.
		const loaded = await tryAsync(async () => {
			const result = await this.store.loadRules();
			if (!result.ok) throw result.error;
			return result.value;
		});
		if (!loaded.ok) {
			// Log the failure with NO rule content; surface a non-blocking notice; fall through to prompt.
			this.feedback.debug('approvals: rule load failed; falling back to prompt');
			this.feedback.info(this.storeErrorMessage);
			return ok('prompt');
		}

		// 3. Match (deny-wins) over persisted ∪ session.
		const candidates = [...loaded.value, ...this.sessionRules.values()];
		let hasAllow = false;
		for (const rule of candidates) {
			if (rule.toolName !== action.toolName) continue;
			if (!matchesRulePattern(action.toolName, action.actionPattern, rule.actionPattern)) continue;
			if (rule.decision === 'deny') {
				return ok('deny'); // deny-wins (REQ-AS-021/023, EC-AS-5/11)
			}
			hasAllow = true;
		}
		if (hasAllow) {
			return ok('allow'); // a matching allow, no matching deny (REQ-AS-020, EC-AS-20)
		}
		return ok('prompt'); // no match → the unchanged P4 block (REQ-AS-022/052, EC-AS-1)
	}

	/**
	 * Apply a PROMPTED user decision: `'allow'`/`'deny'` → a SESSION rule (in-memory,
	 * REQ-AS-031); `'allow-always'`/`'deny-always'` → `store.addRule(persisted)`
	 * (REQ-AS-030); `null` (cancel) → no rule (REQ-AS-025). A persist `err` surfaces the
	 * storeError notice but the returned concrete decision still stands (the user's
	 * allow/deny is honoured this turn). Returns the concrete `ApprovalDecision` the
	 * callback resolves to (`'allow-always'`→`'allow'`, `'deny-always'`→`'deny'`; the
	 * `*-always` is the persistence flavour), or `null` for cancel.
	 */
	async applyDecision(
		action: ApprovalAction,
		decision: ApprovalDecision | null,
	): Promise<Result<ApprovalDecision | null>> {
		if (decision === null) {
			return ok(null); // cancel → no rule (EC-AS-12)
		}

		const pattern = this.persistablePattern(action.actionPattern);

		if (decision === 'allow' || decision === 'deny') {
			this.addSessionRule(action.toolName, pattern, decision);
			return ok(decision);
		}

		// '*-always' → persist a rule; the concrete on-the-wire decision is allow/deny.
		const concrete: ApprovalDecision = decision === 'allow-always' ? 'allow' : 'deny';
		const input: ApprovalRuleInput = {
			toolName: action.toolName,
			actionPattern: pattern,
			decision: concrete,
			lifetime: 'persisted',
		};
		const persisted = await tryAsync(async () => {
			const result = await this.store.addRule(input);
			if (!result.ok) throw result.error;
			return result.value;
		});
		if (!persisted.ok) {
			// The persist failed — surface the notice, but the user's decision still stands this turn.
			this.feedback.debug('approvals: rule persist failed; decision still honoured for the turn');
			this.feedback.info(this.storeErrorMessage);
		}
		return ok(concrete);
	}

	/** The current rule view for the panel: persisted (loaded) ∪ session (in-memory). Result-typed. */
	async listRules(): Promise<Result<readonly ApprovalRule[]>> {
		const loaded = await this.store.loadRules();
		if (!loaded.ok) return err(loaded.error);
		return ok([...loaded.value, ...this.sessionRules.values()]);
	}

	/**
	 * Normalise the action pattern for storage (open item #3 / NFR-AS-002): a `{`-leading
	 * `JSON.stringify(input)` fallback pattern is stored as `undefined` (match-all for the
	 * tool) so no serialised input lands in a rule; a `null` action also stores as
	 * match-all. Otherwise the pattern is kept verbatim.
	 */
	private persistablePattern(actionPattern: string | null): string | undefined {
		if (actionPattern === null || actionPattern === '') return undefined;
		if (actionPattern.startsWith('{')) return undefined;
		return actionPattern;
	}

	private addSessionRule(
		toolName: string,
		actionPattern: string | undefined,
		decision: 'allow' | 'deny',
	): void {
		const key = ruleDedupeKey({ toolName, actionPattern, decision });
		const existing = this.sessionRules.get(key);
		if (existing !== undefined) return; // dedupe — same triple is a no-op
		this.sessionRules.set(key, {
			id: `session-rule-${(this.sessionIdSeq += 1)}`,
			toolName,
			actionPattern,
			decision,
			lifetime: 'session',
			createdAt: Date.now(),
		});
	}
}
