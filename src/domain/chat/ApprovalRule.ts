import type { ProviderId } from '@/domain/chat/ProviderSelection'

/**
 * `ApprovalRule` — a user-saved authorisation for a `(providerId, tool, scope)`
 * triple. Persisted under `_storedData.specorator.approvalRules` and consumed
 * by `useApprovalRulesStore.findMatching()` so the second time a tool request
 * arrives with the same triple it auto-resolves without user prompting.
 *
 * Satisfies REQ-MPS-046 (persistent per-(provider, tool, scope) approvals)
 * and REQ-MPS-047 (Settings tab lists + removes rules).
 *
 * Scope semantics (SPEC-MPS-001 §7.5):
 *   - For `tool === 'Bash'`, `scope` is a command-name prefix
 *     (e.g. `git` matches `git status`, `git push`, bare `git`).
 *   - For every other tool, `scope` is a glob string supporting `*`
 *     (single-segment wildcard) and `**` (cross-segment wildcard).
 *
 * Domain layer (ADR-008): no `obsidian` imports.
 */
export interface ApprovalRule {
	/** Stable opaque id. Used as the React-like `:key` and the remove handle. */
	readonly id: string
	/** Provider this rule applies to. */
	readonly providerId: ProviderId
	/**
	 * Tool name from `ChatTransportApprovalRequest.tool` (e.g. `'Write'`,
	 * `'Edit'`, `'Bash'`, or any provider-specific string).
	 */
	readonly tool: string
	/**
	 * Path glob (non-Bash) or command-name prefix (Bash). See module comment
	 * for the matching contract.
	 */
	readonly scope: string
	/** ISO-8601 UTC creation timestamp. */
	readonly createdAt: string
}
