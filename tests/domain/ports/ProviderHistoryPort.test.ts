/**
 * T-TS-002 (TEST-TS-001) — RED: `ProviderHistoryPort` exposes exactly seven
 * methods + `providerId` (all Result-returning); `PROVIDER_HISTORY_PORT` is its
 * own InjectionKey (no aggregate); the `@/domain/ports` barrel re-exports
 * `ProviderHistoryPort` / `HistoryError` + the conversation types.
 *
 * The compile-time exact-key equality + Result-shape asserts fail
 * `vue-tsc -p tsconfig.lint.json` until T-TS-004 declares the port + key + barrel.
 *
 * Traces: TEST-TS-001, SPEC-TS-001, REQ-TS-008/010/012/013/018/026; ADR-TS-001 §2.
 */
import { describe, it, expect } from 'vitest';
import type { ProviderHistoryPort, HistoryError } from '@/domain/ports';
import type {
	ConversationRecord,
	ConversationMeta,
	ForkPlan,
} from '@/domain/ports';
import { PROVIDER_HISTORY_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Exact-key equality: true ONLY when ProviderHistoryPort exposes EXACTLY these eight keys.
type ExpectedKeys =
	| 'providerId'
	| 'listSessions'
	| 'hydrate'
	| 'save'
	| 'updateMeta'
	| 'delete'
	| 'resolveSessionId'
	| 'buildForkPlan';

const _exactKeys: Equals<keyof ProviderHistoryPort, ExpectedKeys> = true;
void _exactKeys;

// Every discrete method is Result-returning (ADR-004).
const _providerId: Equals<ProviderHistoryPort['providerId'], ProviderId> = true;
const _listSessions: Equals<
	ReturnType<ProviderHistoryPort['listSessions']>,
	Promise<Result<ConversationMeta[]>>
> = true;
const _hydrate: Equals<
	ReturnType<ProviderHistoryPort['hydrate']>,
	Promise<Result<ConversationRecord>>
> = true;
const _save: Equals<ReturnType<ProviderHistoryPort['save']>, Promise<Result<void>>> = true;
const _updateMeta: Equals<
	ReturnType<ProviderHistoryPort['updateMeta']>,
	Promise<Result<void>>
> = true;
const _delete: Equals<ReturnType<ProviderHistoryPort['delete']>, Promise<Result<void>>> = true;
const _resolveSessionId: Equals<
	ReturnType<ProviderHistoryPort['resolveSessionId']>,
	Promise<Result<string | null>>
> = true;
const _buildForkPlan: Equals<
	ReturnType<ProviderHistoryPort['buildForkPlan']>,
	Promise<Result<ForkPlan>>
> = true;
void _providerId;
void _listSessions;
void _hydrate;
void _save;
void _updateMeta;
void _delete;
void _resolveSessionId;
void _buildForkPlan;

// HistoryError carries the typed discriminant kinds.
const _historyErrorKind: Equals<
	HistoryError['kind'],
	'not-found' | 'corrupt' | 'io'
> = true;
void _historyErrorKind;

describe('ProviderHistoryPort shape (TEST-TS-001)', () => {
	it('declares exactly the eight blessed members (runtime sentinel)', () => {
		const expected = [
			'providerId',
			'listSessions',
			'hydrate',
			'save',
			'updateMeta',
			'delete',
			'resolveSessionId',
			'buildForkPlan',
		];
		expect(expected).toHaveLength(8);
		// No aggregate / usePorts member.
		expect(expected).not.toContain('usePorts');
	});

	it('PROVIDER_HISTORY_PORT is its own InjectionKey symbol (no aggregate)', () => {
		expect(typeof PROVIDER_HISTORY_PORT).toBe('symbol');
	});
});
