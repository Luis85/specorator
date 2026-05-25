/**
 * T-CP-005 (TEST-CP-003) — RED: `MentionDataProviderPort` exposes
 * `query(filter, signal?) -> Promise<MentionReferent[]>` (NO `Result`);
 * `MentionReferent` / `MentionReferentKind` match SPEC-CP-003;
 * `MENTION_DATA_PROVIDER_PORT` is its own InjectionKey; the barrel re-exports
 * the port + its types.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-007 creates the port + key +
 * barrel re-export.
 *
 * Traces: TEST-CP-003, SPEC-CP-003, REQ-CP-009/012, ADR-CP-002 §1.
 */
import { describe, it, expect } from 'vitest';
import type {
	MentionDataProviderPort,
	MentionReferent,
	MentionReferentKind,
} from '@/domain/ports';
import { MENTION_DATA_PROVIDER_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- MentionReferentKind covers exactly the five kinds ----
const _kinds: Equals<
	MentionReferentKind,
	'file' | 'folder' | 'subagent' | 'mcp-server' | 'external-dir'
> = true;
void _kinds;

// ---- MentionReferent shape ----
const _referent: Equals<
	MentionReferent,
	{
		readonly kind: MentionReferentKind;
		readonly name: string;
		readonly mentionText: string;
		readonly detail?: string;
	}
> = true;
void _referent;

// ---- query(filter, signal?) -> Promise<MentionReferent[]>, NO Result ----
const _query: Equals<
	MentionDataProviderPort['query'],
	(filter: string, signal?: AbortSignal) => Promise<MentionReferent[]>
> = true;
void _query;

// The port has exactly one member.
const _exact: Equals<keyof MentionDataProviderPort, 'query'> = true;
void _exact;

describe('MentionDataProviderPort (TEST-CP-003)', () => {
	it('a structural impl returns MentionReferent[] (load-or-default [] on empty)', async () => {
		const port: MentionDataProviderPort = {
			query: async (filter: string): Promise<MentionReferent[]> => {
				const all: MentionReferent[] = [
					{ kind: 'file', name: 'notes.md', mentionText: '@notes.md', detail: 'notes.md' },
				];
				return filter === '' ? all : all.filter((r) => r.name.includes(filter));
			},
		};
		expect(await port.query('')).toHaveLength(1);
		expect(await port.query('nomatch')).toEqual([]);
	});

	it('MENTION_DATA_PROVIDER_PORT is a unique symbol injection key', () => {
		expect(typeof MENTION_DATA_PROVIDER_PORT).toBe('symbol');
		expect(MENTION_DATA_PROVIDER_PORT.toString()).toContain('MentionDataProviderPort');
	});
});
