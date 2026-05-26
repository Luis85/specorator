import type { App } from 'obsidian';
import type { ApprovalRuleStorePort } from '@/domain/ports';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';
import { ruleDedupeKey } from '@/domain/chat/approvals/ApprovalRule';
import type { Result } from '@/domain/shared/Result';
import { tryAsync, trySync } from '@/domain/shared/tryAsync';

/**
 * The real device-local `ApprovalRuleStorePort` (SPEC-AS-007, ADR-AS-001 §4).
 * Backed by Obsidian's device-local store under a stable key, mirroring the
 * `SettingsPort` device-local pattern (`app.saveLocalStorage`/`loadLocalStorage`,
 * ADR-PSR-002 / `ObsidianBridge._SETTINGS_KEY`). **Never `data.json`, never a vault
 * file** (NFR-AS-003, REQ-AS-034) — the rule set is per-device trust state that must
 * not ride a git-committed / Obsidian-Sync'd path.
 *
 * Only the **persisted** lifetime lives here — session rules stay in `ApprovalManager`
 * memory (SPEC-AS-010). `loadRules` is load-or-default (a missing/unparseable blob ⇒
 * `ok([])`; a coercion drops malformed entries, CHARTER-REQ-FRESH — no migration). Every
 * method is `Result`-typed and total — a store fault is a `Result.err`, never a throw
 * across the boundary (NFR-AS-009/010), letting the engine fail safe to prompt
 * (REQ-AS-054).
 *
 * Lives under `src/infrastructure/obsidian/**` (coverage-excluded, §10): its behavioural
 * gate is the MANUAL leg TEST-AS-M1 (the real device-local store round-trips in Obsidian;
 * `data.json` + the vault stay untouched). No `obsidian` symbol leaks past this file — it
 * imports only the `App` type for the device-local store.
 */
export class ObsidianApprovalRuleStore implements ApprovalRuleStorePort {
	/** Stable device-local key — device-scoped, NOT synced (ADR-AS-001 §4, NFR-AS-003). */
	private static readonly _KEY = 'specorator:approval-rules';

	constructor(private readonly app: App) {}

	async loadRules(): Promise<Result<readonly ApprovalRule[]>> {
		return tryAsync(() => Promise.resolve(this._read()));
	}

	async addRule(input: ApprovalRuleInput): Promise<Result<ApprovalRule>> {
		return tryAsync(() => {
			const rules = this._read();
			const key = ruleDedupeKey(input);
			const existing = rules.find((r) => ruleDedupeKey(r) === key);
			if (existing !== undefined) return Promise.resolve(existing);
			const stored: ApprovalRule = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
			this._write([...rules, stored]);
			return Promise.resolve(stored);
		});
	}

	async removeRule(id: string): Promise<Result<void>> {
		return tryAsync(() => {
			const rules = this._read();
			this._write(rules.filter((r) => r.id !== id));
			return Promise.resolve();
		});
	}

	async clear(): Promise<Result<void>> {
		return tryAsync(() => {
			this._write([]);
			return Promise.resolve();
		});
	}

	/**
	 * Load-or-default read of the device-local blob: a missing/non-string/unparseable
	 * blob ⇒ `[]`; a parsed array drops any entry that fails the field-level coercion.
	 */
	private _read(): readonly ApprovalRule[] {
		const raw: unknown = this.app.loadLocalStorage(ObsidianApprovalRuleStore._KEY);
		if (typeof raw !== 'string') return [];
		const parsed = trySync(() => JSON.parse(raw) as unknown);
		if (!parsed.ok || !Array.isArray(parsed.value)) return [];
		const rules: ApprovalRule[] = [];
		for (const entry of parsed.value) {
			const coerced = ObsidianApprovalRuleStore._coerce(entry);
			if (coerced !== null) rules.push(coerced);
		}
		return rules;
	}

	private _write(rules: readonly ApprovalRule[]): void {
		this.app.saveLocalStorage(ObsidianApprovalRuleStore._KEY, JSON.stringify(rules));
	}

	/** Field-level coercion: a malformed entry ⇒ `null` (dropped), never a throw. */
	private static _coerce(entry: unknown): ApprovalRule | null {
		if (entry === null || typeof entry !== 'object') return null;
		const e = entry as Record<string, unknown>;
		if (!ObsidianApprovalRuleStore._isValidEntry(e)) return null;
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
