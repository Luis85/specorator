/**
 * T-MC-008 (TEST-MC-052/053/054 + EC-MC-9/10) — RED: the PURE, TOTAL active-set +
 * disallowed-tools folds (`getActiveServers(servers, mentionedNames)` +
 * `collectDisallowedMcpTools(servers)`). Ported from claudian
 * `McpServerManager.getActiveServers:38` + `getAllDisallowedMcpTools:74-94`. P8
 * always passes `mentionedNames = ∅` (NG3).
 *
 * Fails until T-MC-009 adds `src/domain/chat/mcp/getActiveServers.ts`.
 *
 * Traces: TEST-MC-052, TEST-MC-053, TEST-MC-054, SPEC-MC-006,
 * REQ-MC-020/023/052/053/054/061, NFR-MC-004, EC-MC-9/10.
 */
import { describe, it, expect } from 'vitest';
import { getActiveServers, collectDisallowedMcpTools } from '@/domain/chat/mcp';
import type { ManagedMcpServer } from '@/domain/chat/mcp';

const EMPTY = new Set<string>();

function server(over: Partial<ManagedMcpServer> & { name: string }): ManagedMcpServer {
	return {
		config: { command: 'npx' },
		enabled: true,
		contextSaving: false,
		...over,
	};
}

describe('getActiveServers (TEST-MC-052/053, EC-MC-9)', () => {
	it('includes an enabled non-context-saving server', () => {
		const active = getActiveServers([server({ name: 'fs' })], EMPTY);
		expect(active).toEqual({ fs: { command: 'npx' } });
	});

	it('skips a disabled server', () => {
		const active = getActiveServers([server({ name: 'fs', enabled: false })], EMPTY);
		expect(active).toEqual({});
	});

	it('skips a context-saving server when not mentioned (∅ in P8, EC-MC-9)', () => {
		const active = getActiveServers([server({ name: 'fs', contextSaving: true })], EMPTY);
		expect(active).toEqual({});
	});

	it('includes a context-saving server when mentioned', () => {
		const active = getActiveServers(
			[server({ name: 'fs', contextSaving: true })],
			new Set(['fs']),
		);
		expect(active).toEqual({ fs: { command: 'npx' } });
	});

	it('copies each active server config under its name', () => {
		const servers = [
			server({ name: 'a', config: { command: 'a' } }),
			server({ name: 'b', config: { type: 'sse', url: 'https://b' }, contextSaving: true }),
			server({ name: 'c', config: { command: 'c' }, enabled: false }),
		];
		expect(getActiveServers(servers, EMPTY)).toEqual({ a: { command: 'a' } });
	});

	it('returns a fresh map (no shared reference) and never throws on []', () => {
		expect(() => getActiveServers([], EMPTY)).not.toThrow();
		const a = getActiveServers([server({ name: 'x' })], EMPTY);
		const b = getActiveServers([server({ name: 'x' })], EMPTY);
		expect(a).not.toBe(b);
	});
});

describe('collectDisallowedMcpTools (TEST-MC-054, EC-MC-10)', () => {
	it('emits mcp__<server>__<tool> for each disabled tool of an enabled server', () => {
		const servers = [server({ name: 'fs', disabledTools: ['write', 'delete'] })];
		expect(collectDisallowedMcpTools(servers)).toEqual(['mcp__fs__delete', 'mcp__fs__write']);
	});

	it('ignores contextSaving / mentions (pre-registers ALL enabled servers)', () => {
		const servers = [server({ name: 'fs', contextSaving: true, disabledTools: ['write'] })];
		expect(collectDisallowedMcpTools(servers)).toEqual(['mcp__fs__write']);
	});

	it('skips a disabled server', () => {
		const servers = [server({ name: 'fs', enabled: false, disabledTools: ['write'] })];
		expect(collectDisallowedMcpTools(servers)).toEqual([]);
	});

	it('trims tool names and skips empty/whitespace ones', () => {
		const servers = [server({ name: 'fs', disabledTools: ['  write  ', '', '   '] })];
		expect(collectDisallowedMcpTools(servers)).toEqual(['mcp__fs__write']);
	});

	it('de-dupes and returns a sorted array', () => {
		const servers = [
			server({ name: 'fs', disabledTools: ['write', 'write'] }),
			server({ name: 'a', disabledTools: ['read'] }),
		];
		expect(collectDisallowedMcpTools(servers)).toEqual(['mcp__a__read', 'mcp__fs__write']);
	});

	it('a server with no disabledTools contributes nothing; never throws on []', () => {
		expect(collectDisallowedMcpTools([server({ name: 'fs' })])).toEqual([]);
		expect(() => collectDisallowedMcpTools([])).not.toThrow();
	});
});
