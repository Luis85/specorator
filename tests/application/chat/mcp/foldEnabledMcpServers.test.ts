/**
 * TEST-MC-052/082 — the PURE guarded fold `foldEnabledMcpServers` (SPEC-MC-013,
 * ADR-MC-003 §1).
 *
 * Computes `getActiveServers(list, mentioned)` (SPEC-MC-006); an EMPTY active map →
 * `undefined` (the surface writes no `enabledMcpServers` → byte-identical P7,
 * EC-MC-1/13); a non-empty map → `{ servers, disallowedTools }` where
 * `disallowedTools` is `collectDisallowedMcpTools(list)` over ALL enabled servers
 * (pre-registration). An all-context-saving / all-disabled set with ∅ mentions still
 * folds `undefined` (EC-MC-9). Pure + total — never throws.
 *
 * Traces: TEST-MC-052/082, SPEC-MC-013, REQ-MC-052/082, NFR-MC-001, EC-MC-1/9/13.
 */
import { describe, it, expect } from 'vitest';
import { foldEnabledMcpServers } from '@/application/chat/mcp/foldEnabledMcpServers';
import type { ManagedMcpServer, McpServerConfig } from '@/domain/chat/mcp/McpTypes';

const EMPTY = new Set<string>();
const stdio: McpServerConfig = { command: 'node', args: ['s.js'] };

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

describe('foldEnabledMcpServers', () => {
	it('returns undefined for an empty list (EC-MC-1/13)', () => {
		expect(foldEnabledMcpServers([], EMPTY)).toBeUndefined();
	});

	it('returns undefined when all servers are disabled (byte-identical P7)', () => {
		expect(foldEnabledMcpServers([server({ name: 'a', enabled: false })], EMPTY)).toBeUndefined();
	});

	it('returns undefined when all servers are context-saving and ∅ is mentioned (EC-MC-9)', () => {
		const result = foldEnabledMcpServers(
			[server({ name: 'a', enabled: true, contextSaving: true })],
			EMPTY,
		);
		expect(result).toBeUndefined();
	});

	it('folds the active set + disallowed tools when at least one server is active', () => {
		const result = foldEnabledMcpServers(
			[
				server({ name: 'alpha', enabled: true, contextSaving: false, disabledTools: ['search'] }),
				server({ name: 'beta', enabled: false, contextSaving: false }),
			],
			EMPTY,
		);

		expect(result).toBeDefined();
		expect(Object.keys(result?.servers ?? {})).toEqual(['alpha']);
		expect(result?.disallowedTools).toEqual(['mcp__alpha__search']);
	});

	it('pre-registers disallowed tools of all enabled servers even when only one is active (REQ-MC-053/054)', () => {
		const result = foldEnabledMcpServers(
			[
				server({ name: 'alpha', enabled: true, contextSaving: false }),
				server({ name: 'beta', enabled: true, contextSaving: true, disabledTools: ['write'] }),
			],
			EMPTY,
		);

		// alpha is active (non-context-saving); beta is enabled-but-not-active, yet its
		// disabled tool is still pre-registered (parity getAllDisallowedMcpTools).
		expect(Object.keys(result?.servers ?? {})).toEqual(['alpha']);
		expect(result?.disallowedTools).toEqual(['mcp__beta__write']);
	});

	it('is total — never throws for an unusual server list', () => {
		expect(() => foldEnabledMcpServers([], EMPTY)).not.toThrow();
	});
});
