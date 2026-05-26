/**
 * TEST-MC-015/040/050/082 — the PURE selector + settings view-model
 * `buildMcpViewModel` (SPEC-MC-014, ADR-MC-003 §3).
 *
 * `supported = supportsMcpTools` (the settings + selector hide when false,
 * REQ-MC-041); `kind = 'empty-seam'` when `servers` is empty (the P6 visible-empty
 * seam survives, REQ-MC-082) / `'live'` when ≥ 1 (REQ-MC-050); `servers` maps each
 * `ManagedMcpServer` to `{ name, type:getMcpServerType(config), enabled, description }`
 * (DTO only — no domain instance crosses the boundary, NFR-MC-005); `enabledCount` =
 * the count of enabled servers (REQ-MC-015). Pure + total — never throws.
 *
 * Traces: TEST-MC-015/040/050/082, SPEC-MC-014, REQ-MC-015/040/050/051/082, EC-MC-1/8.
 */
import { describe, it, expect } from 'vitest';
import { buildMcpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import type { ManagedMcpServer, McpServerConfig } from '@/domain/chat/mcp/McpTypes';

const stdio: McpServerConfig = { command: 'node', args: ['s.js'] };
const sse: McpServerConfig = { type: 'sse', url: 'https://example.com/sse' };
const http: McpServerConfig = { type: 'http', url: 'https://example.com/mcp' };

function server(partial: Partial<ManagedMcpServer> & Pick<ManagedMcpServer, 'name'>): ManagedMcpServer {
	return {
		name: partial.name,
		config: partial.config ?? stdio,
		enabled: partial.enabled ?? true,
		contextSaving: partial.contextSaving ?? false,
		disabledTools: partial.disabledTools,
		description: partial.description,
	};
}

describe('buildMcpViewModel', () => {
	it('threads supportsMcpTools through to supported (REQ-MC-041)', () => {
		expect(buildMcpViewModel([], true).supported).toBe(true);
		expect(buildMcpViewModel([], false).supported).toBe(false);
	});

	it('is the empty-seam at 0 servers (the P6 visible-empty seam survives, REQ-MC-082)', () => {
		const vm = buildMcpViewModel([], true);

		expect(vm.kind).toBe('empty-seam');
		expect(vm.servers).toEqual([]);
		expect(vm.enabledCount).toBe(0);
	});

	it('is live at ≥ 1 server (REQ-MC-050)', () => {
		const vm = buildMcpViewModel([server({ name: 'alpha' })], true);

		expect(vm.kind).toBe('live');
		expect(vm.servers).toHaveLength(1);
	});

	it('maps each server to a McpServerVm with the classified transport type (REQ-MC-040)', () => {
		const vm = buildMcpViewModel(
			[
				server({ name: 'a', config: stdio, enabled: true, description: 'desc-a' }),
				server({ name: 'b', config: sse, enabled: false }),
				server({ name: 'c', config: http, enabled: true }),
			],
			true,
		);

		expect(vm.servers).toEqual([
			{ name: 'a', type: 'stdio', enabled: true, description: 'desc-a' },
			{ name: 'b', type: 'sse', enabled: false, description: undefined },
			{ name: 'c', type: 'http', enabled: true, description: undefined },
		]);
	});

	it('counts enabled servers in enabledCount (REQ-MC-015, EC-MC-8)', () => {
		const vm = buildMcpViewModel(
			[
				server({ name: 'a', enabled: true }),
				server({ name: 'b', enabled: false }),
				server({ name: 'c', enabled: true }),
			],
			true,
		);

		expect(vm.enabledCount).toBe(2);
	});

	it('is total — never throws on an empty list', () => {
		expect(() => buildMcpViewModel([], false)).not.toThrow();
	});
});
