/**
 * T-TC-005 (TEST-TC-003/010 port-shape legs) — RED: `ToolbarCatalogPort` exposes
 * EXACTLY `getCatalog(providerId: ProviderId): ToolbarCatalog` (synchronous +
 * total — the type-level shape); `TOOLBAR_CATALOG_PORT` is its own `InjectionKey`
 * in `@/infrastructure/bridge/ports`; the barrel `@/domain/ports` re-exports
 * `ToolbarCatalogPort`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-TC-006 adds the port + key +
 * barrel re-export.
 *
 * Traces: TEST-TC-003, TEST-TC-010, SPEC-TC-004, REQ-TC-003, REQ-TC-010,
 * NFR-TC-002.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { ToolbarCatalogPort } from '@/domain/ports';
import type { ToolbarCatalogPort as PortFromOwnModule } from '@/domain/ports/ToolbarCatalogPort';
import { TOOLBAR_CATALOG_PORT } from '@/infrastructure/bridge/ports';
import type { ToolbarCatalog } from '@/domain/chat/toolbar';
import type { ProviderId } from '@/domain/chat/ProviderId';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<ToolbarCatalogPort, PortFromOwnModule> = true;
void _barrelSame;

// ---- The port exposes EXACTLY `getCatalog` ----
const _members: Equals<keyof ToolbarCatalogPort, 'getCatalog'> = true;
void _members;

// ---- `getCatalog(providerId): ToolbarCatalog` (synchronous + total) ----
const _signature: Equals<
	ToolbarCatalogPort['getCatalog'],
	(providerId: ProviderId) => ToolbarCatalog
> = true;
void _signature;

// ---- The key is its own InjectionKey<ToolbarCatalogPort> ----
const _key: Equals<typeof TOOLBAR_CATALOG_PORT, InjectionKey<ToolbarCatalogPort>> = true;
void _key;

describe('ToolbarCatalogPort shape + key (TEST-TC-003/010)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof TOOLBAR_CATALOG_PORT).toBe('symbol');
	});

	it('an implementation satisfies the synchronous getCatalog contract', () => {
		const port: ToolbarCatalogPort = {
			getCatalog: (_providerId: ProviderId): ToolbarCatalog => ({ models: [] }),
		};
		expect(port.getCatalog('claude').models).toEqual([]);
	});
});
