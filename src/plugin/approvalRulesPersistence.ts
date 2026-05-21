import type { ApprovalRule } from '@/domain/chat/ApprovalRule'
import type { ProviderId } from '@/domain/chat/ProviderSelection'
import type { LoggerPort } from '@/domain/ports/LoggerPort'

/**
 * Pure helpers for the `approvalRules` plugin-data blob (WS-9,
 * SPEC-MPS-001 §7.5 / REQ-MPS-046 / REQ-MPS-047). The blob lives under
 * `_storedData.specorator.approvalRules` and serialises an array of
 * `ApprovalRule` records.
 *
 * Malformed entries are dropped at decode time and logged at `warn`,
 * mirroring the `chatThreadsPersistence` contract.
 */

const PROVIDER_IDS: ReadonlySet<string> = new Set(['claude', 'cursor'])

interface SerialisedApprovalRule {
	readonly id: string
	readonly providerId: ProviderId
	readonly tool: string
	readonly scope: string
	readonly createdAt: string
}

/** Return the first invalid field of a candidate record, or `null` when shape is OK. */
function findApprovalRuleDefect(r: Record<string, unknown>): string | null {
	if (typeof r.id !== 'string' || r.id.length === 0) return 'id'
	if (typeof r.providerId !== 'string' || !PROVIDER_IDS.has(r.providerId)) return 'providerId'
	if (typeof r.tool !== 'string' || r.tool.length === 0) return 'tool'
	if (typeof r.scope !== 'string' || r.scope.length === 0) return 'scope'
	if (typeof r.createdAt !== 'string') return 'createdAt'
	return null
}

/** Type-guard parsing of one raw record. Returns `null` (and logs once) on a bad shape. */
export function parseApprovalRule(raw: unknown, logger: LoggerPort): ApprovalRule | null {
	if (raw === null || typeof raw !== 'object') {
		logger.warn('[approvalRules] dropped non-object record', { raw })
		return null
	}
	const r = raw as Record<string, unknown>
	const defect = findApprovalRuleDefect(r)
	if (defect !== null) {
		logger.warn(`[approvalRules] dropped record (invalid ${defect})`, {
			id: typeof r.id === 'string' ? r.id : undefined,
		})
		return null
	}
	return {
		id: r.id as string,
		providerId: r.providerId as ProviderId,
		tool: r.tool as string,
		scope: r.scope as string,
		createdAt: r.createdAt as string,
	}
}

/**
 * Decode the raw `approvalRules` blob (typically `_storedData.specorator.approvalRules`)
 * into a clean `ApprovalRule[]`. Accepts the canonical array shape; treats
 * any other shape as empty (with one `warn`).
 */
export function decodeApprovalRulesBlob(raw: unknown, logger: LoggerPort): ApprovalRule[] {
	if (raw === undefined || raw === null) return []
	if (!Array.isArray(raw)) {
		logger.warn('[approvalRules] blob is not an array — treating as empty', { typeofRaw: typeof raw })
		return []
	}
	const out: ApprovalRule[] = []
	for (const entry of raw) {
		const rule = parseApprovalRule(entry, logger)
		if (rule !== null) out.push(rule)
	}
	return out
}

/** Encode an `ApprovalRule[]` into the JSON-friendly array blob shape. */
export function encodeApprovalRulesBlob(rules: ReadonlyArray<ApprovalRule>): SerialisedApprovalRule[] {
	const out: SerialisedApprovalRule[] = []
	for (const rule of rules) {
		if (!PROVIDER_IDS.has(rule.providerId)) continue
		out.push({
			id: rule.id,
			providerId: rule.providerId,
			tool: rule.tool,
			scope: rule.scope,
			createdAt: rule.createdAt,
		})
	}
	return out
}
