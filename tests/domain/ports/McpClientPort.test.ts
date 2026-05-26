/**
 * T-MC-010 (TEST-MC-081 port-shape leg) — RED: `McpClientPort` exposes EXACTLY the
 * six members (`isAvailable` / `test` / `connect` / `listTools` / `callTool` /
 * `disconnect`); `test` returns a structured `McpTestResult` (never throws), the live
 * methods are `Result`-typed; `McpConnection` is `{ readonly id: string }`.
 * `MCP_CLIENT_PORT` is its OWN `InjectionKey` (no aggregate); the barrel re-exports
 * `McpClientPort` / `McpConnection`. The transport matrix (success/partial/timeout/
 * error/unavailable) is the Mock/LS leg (T-MC-015/017).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-MC-011 adds the port + key + barrel.
 *
 * Traces: TEST-MC-081, SPEC-MC-008, REQ-MC-020..023/030..034, NFR-MC-005.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { McpClientPort, McpConnection } from '@/domain/ports/McpClientPort';
import type {
	McpClientPort as PortFromBarrel,
	McpConnection as ConnFromBarrel,
	ManagedMcpServer,
	McpTestResult,
	McpTool,
} from '@/domain/ports';
import { MCP_CLIENT_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-exports are the same types as the own module ----
const _barrelSame: Equals<McpClientPort, PortFromBarrel> = true;
const _connSame: Equals<McpConnection, ConnFromBarrel> = true;
void _barrelSame;
void _connSame;

// ---- McpConnection is { readonly id: string } ----
const _connKeys: Equals<keyof McpConnection, 'id'> = true;
const _connId: Equals<McpConnection['id'], string> = true;
void _connKeys;
void _connId;

// ---- The port exposes EXACTLY the six members ----
const _members: Equals<
	keyof McpClientPort,
	'isAvailable' | 'test' | 'connect' | 'listTools' | 'callTool' | 'disconnect'
> = true;
void _members;

// ---- Each member carries its exact signature ----
const _isAvailable: Equals<McpClientPort['isAvailable'], () => boolean> = true;
const _test: Equals<
	McpClientPort['test'],
	(server: ManagedMcpServer) => Promise<McpTestResult>
> = true;
const _connect: Equals<
	McpClientPort['connect'],
	(server: ManagedMcpServer) => Promise<Result<McpConnection>>
> = true;
const _listTools: Equals<
	McpClientPort['listTools'],
	(connection: McpConnection) => Promise<Result<readonly McpTool[]>>
> = true;
const _callTool: Equals<
	McpClientPort['callTool'],
	(
		connection: McpConnection,
		toolName: string,
		input: Record<string, unknown>,
	) => Promise<Result<unknown>>
> = true;
const _disconnect: Equals<
	McpClientPort['disconnect'],
	(connection: McpConnection) => Promise<Result<void>>
> = true;
void _isAvailable;
void _test;
void _connect;
void _listTools;
void _callTool;
void _disconnect;

// ---- The key is its own InjectionKey<McpClientPort> ----
const _key: Equals<typeof MCP_CLIENT_PORT, InjectionKey<McpClientPort>> = true;
void _key;

describe('McpClientPort shape + key (TEST-MC-081)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof MCP_CLIENT_PORT).toBe('symbol');
	});

	it('an implementation satisfies the six-member contract (test never throws)', async () => {
		const conn: McpConnection = { id: 'c1' };
		const port: McpClientPort = {
			isAvailable: () => true,
			test: () => Promise.resolve({ success: true, tools: [] }),
			connect: () => Promise.resolve({ ok: true, value: conn }),
			listTools: () => Promise.resolve({ ok: true, value: [] }),
			callTool: () => Promise.resolve({ ok: true, value: null }),
			disconnect: () => Promise.resolve({ ok: true, value: undefined }),
		};
		expect(port.isAvailable()).toBe(true);
		const result = await port.test({
			name: 'fs',
			config: { command: 'npx' },
			enabled: true,
			contextSaving: false,
		});
		expect(result.success).toBe(true);
		expect(result.tools).toEqual([]);
	});
});
