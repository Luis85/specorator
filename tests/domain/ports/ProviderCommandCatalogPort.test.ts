/**
 * T-CP-005 (TEST-CP-005 catalog leg) — RED: `ProviderCommandCatalogPort` exposes
 * `getEntries(kind) -> Promise<CatalogEntry[]>`; `CatalogEntry` / `CatalogEntryKind`
 * match SPEC-CP-005; `PROVIDER_COMMAND_CATALOG_PORT` is its own InjectionKey; the
 * barrel re-exports the port + its types.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-007.
 *
 * Traces: TEST-CP-005, SPEC-CP-005, REQ-CP-004, ADR-CP-002 §2.
 */
import { describe, it, expect } from 'vitest';
import type {
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
} from '@/domain/ports';
import { PROVIDER_COMMAND_CATALOG_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _kind: Equals<CatalogEntryKind, 'command' | 'skill'> = true;
void _kind;

const _entry: Equals<
	CatalogEntry,
	{
		readonly kind: CatalogEntryKind;
		readonly prefix: '/' | '$';
		readonly name: string;
		readonly description?: string;
		readonly builtIn: boolean;
	}
> = true;
void _entry;

const _getEntries: Equals<
	ProviderCommandCatalogPort['getEntries'],
	(kind: CatalogEntryKind) => Promise<CatalogEntry[]>
> = true;
const _exact: Equals<keyof ProviderCommandCatalogPort, 'getEntries'> = true;
void _getEntries;
void _exact;

describe('ProviderCommandCatalogPort (TEST-CP-005)', () => {
	it('a structural impl returns CatalogEntry[] (load-or-default [])', async () => {
		const port: ProviderCommandCatalogPort = {
			getEntries: async (kind: CatalogEntryKind): Promise<CatalogEntry[]> => {
				if (kind === 'command') {
					return [{ kind: 'command', prefix: '/', name: 'deploy', builtIn: false }];
				}
				return [];
			},
		};
		expect(await port.getEntries('command')).toHaveLength(1);
		expect(await port.getEntries('skill')).toEqual([]);
	});

	it('PROVIDER_COMMAND_CATALOG_PORT is a unique symbol injection key', () => {
		expect(typeof PROVIDER_COMMAND_CATALOG_PORT).toBe('symbol');
		expect(PROVIDER_COMMAND_CATALOG_PORT.toString()).toContain('ProviderCommandCatalog');
	});
});
