import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ApprovalRule } from '@/domain/chat/ApprovalRule'
import type { ProviderId } from '@/domain/chat/ProviderSelection'

/**
 * Pinia store for inline-approval rules (WS-9, REQ-MPS-046 / REQ-MPS-047).
 *
 * Holds the list of `(providerId, tool, scope)` triples the user has
 * previously authorised via the "Always allow" button on `ApprovalCard`.
 * Mirrored to `_storedData.specorator.approvalRules` by the plugin host;
 * the view layer rehydrates via `setRules` on mount.
 *
 * `findMatching` follows the contract in SPEC-MPS-001 §7.5:
 *   - exact `(providerId, tool)` match;
 *   - for `Bash`, `scope` is a command-name prefix
 *     (`git` matches `git status`, `git push`, bare `git`);
 *   - for every other tool, `scope` is a glob with `*` and `**`.
 *
 * Pure UI store: no `obsidian` imports, no calls into application use cases.
 */
export const useApprovalRulesStore = defineStore('approvalRules', () => {
	const rules = ref<ApprovalRule[]>([])

	/**
	 * Append a new rule and return the persisted record (with `id` +
	 * `createdAt` populated). The caller is expected to mirror the change to
	 * `_storedData.specorator.approvalRules` via the plugin-host bridge.
	 */
	function addRule(input: Omit<ApprovalRule, 'id' | 'createdAt'>): ApprovalRule {
		const rule: ApprovalRule = {
			id: mintRuleId(),
			createdAt: new Date().toISOString(),
			providerId: input.providerId,
			tool: input.tool,
			scope: input.scope,
		}
		rules.value = [...rules.value, rule]
		return rule
	}

	/** Remove a rule by `id`. Unknown ids are a no-op. */
	function removeRule(id: string): void {
		const next = rules.value.filter((r) => r.id !== id)
		if (next.length !== rules.value.length) {
			rules.value = next
		}
	}

	/**
	 * Replace the in-memory rule list (hydration path used by the plugin host
	 * after reading `_storedData.specorator.approvalRules` on view mount).
	 */
	function setRules(next: ReadonlyArray<ApprovalRule>): void {
		rules.value = [...next]
	}

	/** Clear all rules — used by test fixtures. */
	function reset(): void {
		rules.value = []
	}

	/**
	 * Return the first rule that matches `(providerId, tool, scope)` per
	 * SPEC-MPS-001 §7.5. Returns `undefined` when no rule matches.
	 */
	function findMatching(
		providerId: ProviderId,
		tool: string,
		scope: string,
	): ApprovalRule | undefined {
		for (const rule of rules.value) {
			if (rule.providerId !== providerId) continue
			if (rule.tool !== tool) continue
			if (tool === 'Bash') {
				if (matchesBashPrefix(rule.scope, scope)) return rule
			} else {
				if (matchesGlob(rule.scope, scope)) return rule
			}
		}
		return undefined
	}

	return {
		rules,
		addRule,
		removeRule,
		setRules,
		reset,
		findMatching,
	}
})

/**
 * Bash matching: the rule's `scope` is a command-name *prefix*. To match,
 * the request's command string must either equal the prefix or have the
 * prefix followed by a whitespace boundary (so `git` matches `git status`
 * but NOT `github-cli status`).
 */
function matchesBashPrefix(rulePrefix: string, command: string): boolean {
	if (command === rulePrefix) return true
	if (!command.startsWith(rulePrefix)) return false
	const nextChar = command.charAt(rulePrefix.length)
	return nextChar === ' ' || nextChar === '\t'
}

/**
 * Glob matching: supports `**` (cross-segment) and `*` (single-segment).
 * Every other regex metacharacter is escaped so the rule string is
 * matched literally. The pattern is anchored: it must consume the entire
 * candidate path (`^…$`).
 *
 * Idiomatic globstar handling: a `**` followed by a path separator is
 * treated as "zero or more path segments + optional trailing separator",
 * so a `src/(globstar)/(star).ts` pattern matches both `src/foo.ts` and
 * `src/a/b/c.ts` (conventional minimatch behaviour).
 */
function matchesGlob(pattern: string, candidate: string): boolean {
	// Token-replace the wildcards with placeholders BEFORE escaping so the
	// escape pass treats only literal text. Sentinels avoid collision with
	// user input by including ASCII characters we then escape away.
	const DOUBLE_STAR_SLASH = '\x00DSS\x00'
	const DOUBLE_STAR = '\x00DS\x00'
	const SINGLE_STAR = '\x00SS\x00'
	const tokenised = pattern
		.replace(/\*\*\//g, DOUBLE_STAR_SLASH)
		.replace(/\*\*/g, DOUBLE_STAR)
		.replace(/\*/g, SINGLE_STAR)
	const escaped = escapeRegex(tokenised)
	const regexBody = escaped
		.split(escapeRegex(DOUBLE_STAR_SLASH))
		.join('(?:.*/)?')
		.split(escapeRegex(DOUBLE_STAR))
		.join('.*')
		.split(escapeRegex(SINGLE_STAR))
		.join('[^/]*')
	const re = new RegExp(`^${regexBody}$`)
	return re.test(candidate)
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Monotonically distinct id. Uses `crypto.randomUUID()` when available
 * (production + jsdom ≥ Node 19), otherwise a high-entropy fallback so the
 * standalone-browser demo build still mints unique ids.
 */
function mintRuleId(): string {
	const g = globalThis as { crypto?: { randomUUID?: () => string } }
	if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
	return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
