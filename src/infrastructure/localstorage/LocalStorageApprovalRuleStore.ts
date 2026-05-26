import type { ApprovalRuleStorePort } from '@/domain/ports';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';
import { ruleDedupeKey } from '@/domain/chat/approvals/ApprovalRule';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** The stable browser-localStorage key — parity with the Obsidian device-local key. */
const RULES_KEY = 'specorator:approval-rules';

/**
 * Browser-`localStorage` `ApprovalRuleStorePort` (SPEC-AS-009, ADR-AS-001 §4) for the
 * GitHub Pages demo. Persists approval rules across a reload with **no Obsidian runtime**
 * (REQ-AS-053), under the same stable key as the Obsidian device-local store. `loadRules`
 * is load-or-default (a missing/unparseable blob ⇒ `ok([])`; malformed entries dropped —
 * CHARTER-REQ-FRESH, no migration); `addRule` dedupes by `ruleDedupeKey` + mints
 * `id`/`createdAt`; `removeRule` is idempotent; `clear` empties the set. Every method is
 * `Result`-typed and total — never throws across the boundary (NFR-AS-010). Only the
 * persisted lifetime lives here — session rules stay in `ApprovalManager` memory. No
 * `obsidian`, no `node:*`.
 */
export class LocalStorageApprovalRuleStore implements ApprovalRuleStorePort {
	loadRules(): Promise<Result<readonly ApprovalRule[]>> {
		return Promise.resolve(ok(this._read()));
	}

	addRule(input: ApprovalRuleInput): Promise<Result<ApprovalRule>> {
		const rules = this._read();
		const key = ruleDedupeKey(input);
		const existing = rules.find((r) => ruleDedupeKey(r) === key);
		if (existing !== undefined) return Promise.resolve(ok(existing));
		const stored: ApprovalRule = {
			...input,
			id: crypto.randomUUID(),
			createdAt: Date.now(),
		};
		const written = this._write([...rules, stored]);
		return Promise.resolve(written.ok ? ok(stored) : written);
	}

	removeRule(id: string): Promise<Result<void>> {
		const rules = this._read();
		return Promise.resolve(this._write(rules.filter((r) => r.id !== id)));
	}

	clear(): Promise<Result<void>> {
		return Promise.resolve(this._write([]));
	}

	/** Load-or-default read: a missing/non-array/unparseable blob ⇒ `[]`. Never throws. */
	private _read(): readonly ApprovalRule[] {
		try {
			const raw = localStorage.getItem(RULES_KEY);
			if (raw === null || raw === '') return [];
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			const rules: ApprovalRule[] = [];
			for (const entry of parsed) {
				const coerced = LocalStorageApprovalRuleStore._coerce(entry);
				if (coerced !== null) rules.push(coerced);
			}
			return rules;
		} catch {
			return [];
		}
	}

	private _write(rules: readonly ApprovalRule[]): Result<void> {
		try {
			localStorage.setItem(RULES_KEY, JSON.stringify(rules));
			return ok(undefined);
		} catch (e) {
			return err(e instanceof Error ? e : new Error('localStorage approval-rule write failed'));
		}
	}

	/** Field-level coercion: a malformed entry ⇒ `null` (dropped), never a throw. */
	private static _coerce(entry: unknown): ApprovalRule | null {
		if (entry === null || typeof entry !== 'object') return null;
		const e = entry as Record<string, unknown>;
		if (!LocalStorageApprovalRuleStore._isValidEntry(e)) return null;
		const actionPattern = typeof e.actionPattern === 'string' ? e.actionPattern : undefined;
		return {
			id: e.id as string,
			toolName: e.toolName as string,
			...(actionPattern !== undefined ? { actionPattern } : {}),
			decision: e.decision as 'allow' | 'deny',
			lifetime: e.lifetime as 'session' | 'persisted',
			createdAt: e.createdAt as number,
		};
	}

	/** The required-field guard for {@link _coerce} (split out for the complexity cap). */
	private static _isValidEntry(e: Record<string, unknown>): boolean {
		const nonEmptyStr = (v: unknown): boolean => typeof v === 'string' && v !== '';
		const validDecision = e.decision === 'allow' || e.decision === 'deny';
		const validLifetime = e.lifetime === 'session' || e.lifetime === 'persisted';
		const validCreatedAt = typeof e.createdAt === 'number' && Number.isFinite(e.createdAt);
		return (
			nonEmptyStr(e.id) &&
			nonEmptyStr(e.toolName) &&
			validDecision &&
			validLifetime &&
			validCreatedAt
		);
	}
}
