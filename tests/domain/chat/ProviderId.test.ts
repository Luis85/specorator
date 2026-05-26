/**
 * T-PV-002 (TEST-PV-005 widened-union leg) — RED: `ProviderId` widens from
 * `'claude'` to `'claude' | 'codex' | 'opencode'` — EXACTLY three members. The two
 * new ids become assignable; every P1–P8 `'claude'` site (the `ChatRuntimePort.
 * providerId`, `ProviderHistoryPort.providerId`, `ToolbarCatalogPort.getCatalog`)
 * type-checks unchanged (additive, NFR-PV-001, SPEC-PV-027).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-PV-003 widens the union (the two
 * new id literals are not assignable to the `'claude'`-only type).
 *
 * Traces: TEST-PV-005, SPEC-PV-001, SPEC-PV-027, REQ-PV-005, NFR-PV-001.
 */
import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@/domain/chat/ProviderId';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The union is EXACTLY the three members ----
const _union: Equals<ProviderId, 'claude' | 'codex' | 'opencode'> = true;
void _union;

// ---- Each of the three literals is assignable ----
const claude: ProviderId = 'claude';
const codex: ProviderId = 'codex';
const opencode: ProviderId = 'opencode';

// ---- 'claude' stays assignable (the P1–P8 additive invariant) ----
const _claudeStillValid: Equals<typeof claude, 'claude'> = true;
void _claudeStillValid;

describe('ProviderId widened union (TEST-PV-005)', () => {
	it('exposes the three provider id literals', () => {
		expect([claude, codex, opencode]).toEqual(['claude', 'codex', 'opencode']);
	});

	it('keeps "claude" assignable (additive widen, NFR-PV-001)', () => {
		const id: ProviderId = 'claude';
		expect(id).toBe('claude');
	});
});
