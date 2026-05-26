/**
 * T-MC-010 (TEST-MC-081 port-shape leg) — RED: `McpConfigStorePort` exposes EXACTLY
 * the three `Result`-typed methods (`load` / `save` / `exists`); `MCP_CONFIG_STORE_PORT`
 * is its OWN `InjectionKey` in `@/infrastructure/bridge/ports` (no aggregate); the
 * barrel `@/domain/ports` re-exports `McpConfigStorePort` + `ManagedMcpServer`. The
 * behavioural store contract (load-or-default) is the Mock/LS leg (T-MC-015/017).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-MC-011 adds the port + key + barrel.
 *
 * Traces: TEST-MC-081, SPEC-MC-007, REQ-MC-001/002/007, NFR-MC-005.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { McpConfigStorePort } from '@/domain/ports/McpConfigStorePort';
import type {
	McpConfigStorePort as PortFromBarrel,
	ManagedMcpServer,
} from '@/domain/ports';
import { MCP_CONFIG_STORE_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<McpConfigStorePort, PortFromBarrel> = true;
void _barrelSame;

// ---- The port exposes EXACTLY the three methods ----
const _members: Equals<keyof McpConfigStorePort, 'load' | 'save' | 'exists'> = true;
void _members;

// ---- Each method is Result-typed (the exact signatures) ----
const _load: Equals<
	McpConfigStorePort['load'],
	() => Promise<Result<ManagedMcpServer[]>>
> = true;
const _save: Equals<
	McpConfigStorePort['save'],
	(servers: readonly ManagedMcpServer[]) => Promise<Result<void>>
> = true;
const _exists: Equals<McpConfigStorePort['exists'], () => Promise<Result<boolean>>> = true;
void _load;
void _save;
void _exists;

// ---- The key is its own InjectionKey<McpConfigStorePort> ----
const _key: Equals<typeof MCP_CONFIG_STORE_PORT, InjectionKey<McpConfigStorePort>> = true;
void _key;

describe('McpConfigStorePort shape + key (TEST-MC-081)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof MCP_CONFIG_STORE_PORT).toBe('symbol');
	});

	it('an implementation satisfies the three Result-typed method contract', async () => {
		const servers: ManagedMcpServer[] = [];
		const port: McpConfigStorePort = {
			load: () => Promise.resolve({ ok: true, value: servers }),
			save: () => Promise.resolve({ ok: true, value: undefined }),
			exists: () => Promise.resolve({ ok: true, value: false }),
		};
		const loaded = await port.load();
		expect(loaded.ok && loaded.value).toEqual([]);
		const saved = await port.save([]);
		expect(saved.ok).toBe(true);
		const ex = await port.exists();
		expect(ex.ok && ex.value).toBe(false);
	});
});
