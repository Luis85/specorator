/**
 * T-MC-004 (TEST-MC-003/004/005/006 + EC-MC-2/3/5/6) — RED: the PURE, TOTAL
 * `McpConfigParser` (`parseClipboardConfig` / `getMcpServerType` /
 * `isValidMcpServerConfig`). Parameterised across the full SPEC-MC-029 truth table
 * (the four paste formats + `needsName`, the malformed/err cases, the
 * `getMcpServerType` + `isValidMcpServerConfig` per-shape tables) + the never-throws
 * assertion. Claudian's throw paths become `Result.err` (ADR-004).
 *
 * Fails until T-MC-005 adds `src/domain/chat/mcp/McpConfigParser.ts`.
 *
 * Traces: TEST-MC-003, TEST-MC-004, TEST-MC-005, TEST-MC-006, SPEC-MC-004,
 * SPEC-MC-029, REQ-MC-003/004/005/006, NFR-MC-004, EC-MC-2/3/5/6.
 */
import { describe, it, expect } from 'vitest';
import {
	parseClipboardConfig,
	getMcpServerType,
	isValidMcpServerConfig,
} from '@/domain/chat/mcp';
import type { McpServerConfig } from '@/domain/chat/mcp';

describe('parseClipboardConfig — format 1 (mcpServers wrapper) (TEST-MC-003)', () => {
	it('parses { mcpServers: { name: config } } → ok({ servers, needsName:false })', () => {
		const raw = JSON.stringify({
			mcpServers: {
				fs: { command: 'npx', args: ['-y', 'server-filesystem'] },
				remote: { type: 'sse', url: 'https://x/sse' },
			},
		});
		const r = parseClipboardConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.needsName).toBe(false);
		expect(r.value.servers.map((s) => s.name)).toEqual(['fs', 'remote']);
	});

	it('skips invalid entries inside mcpServers', () => {
		const raw = JSON.stringify({
			mcpServers: { good: { command: 'npx' }, bad: { nope: 1 } },
		});
		const r = parseClipboardConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.servers.map((s) => s.name)).toEqual(['good']);
	});

	it('an mcpServers with no valid entry → err (EC-MC-3)', () => {
		const raw = JSON.stringify({ mcpServers: { bad: { nope: 1 } } });
		const r = parseClipboardConfig(raw);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('No valid server configs found in mcpServers');
	});

	it('an empty mcpServers → err', () => {
		const r = parseClipboardConfig(JSON.stringify({ mcpServers: {} }));
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('No valid server configs found in mcpServers');
	});
});

describe('parseClipboardConfig — format 2 (single un-named server) (TEST-MC-003)', () => {
	it('a single { command } → ok({ servers:[{name:"",config}], needsName:true })', () => {
		const r = parseClipboardConfig(JSON.stringify({ command: 'npx', args: ['x'] }));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.needsName).toBe(true);
		expect(r.value.servers).toHaveLength(1);
		expect(r.value.servers[0].name).toBe('');
	});

	it('a single { type:"sse", url } → needsName:true', () => {
		const r = parseClipboardConfig(JSON.stringify({ type: 'sse', url: 'https://x/sse' }));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.needsName).toBe(true);
		expect(r.value.servers[0].name).toBe('');
	});
});

describe('parseClipboardConfig — format 3 (single named server) (TEST-MC-003)', () => {
	it('a single { name: config } → ok({ servers:[{name,config}], needsName:false })', () => {
		const r = parseClipboardConfig(JSON.stringify({ fs: { command: 'npx' } }));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.needsName).toBe(false);
		expect(r.value.servers).toEqual([{ name: 'fs', config: { command: 'npx' } }]);
	});
});

describe('parseClipboardConfig — format 4 (multiple named, no wrapper) (TEST-MC-003)', () => {
	it('multiple { name: config } → ok(valid entries, needsName:false)', () => {
		const raw = JSON.stringify({
			fs: { command: 'npx' },
			remote: { url: 'https://x/mcp' },
		});
		const r = parseClipboardConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.needsName).toBe(false);
		expect(r.value.servers.map((s) => s.name)).toEqual(['fs', 'remote']);
	});

	it('multiple entries, none valid → err("Invalid MCP configuration format") (EC-MC-3)', () => {
		const raw = JSON.stringify({ a: { nope: 1 }, b: { also: 2 } });
		const r = parseClipboardConfig(raw);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('Invalid MCP configuration format');
	});
});

describe('parseClipboardConfig — malformed (TEST-MC-004, EC-MC-2/5)', () => {
	it('invalid JSON → err("Invalid JSON")', () => {
		const r = parseClipboardConfig('{ not json');
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('Invalid JSON');
	});

	it('a JSON array → err("Invalid MCP configuration format") (EC-MC-5)', () => {
		const r = parseClipboardConfig(JSON.stringify([{ command: 'npx' }]));
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('Invalid MCP configuration format');
	});

	it('a JSON null → err("Invalid MCP configuration format")', () => {
		const r = parseClipboardConfig('null');
		expect(r.ok).toBe(false);
	});

	it('a JSON string primitive → err("Invalid MCP configuration format")', () => {
		const r = parseClipboardConfig(JSON.stringify('hello'));
		expect(r.ok).toBe(false);
	});

	it('an empty object → err (no recognised server)', () => {
		const r = parseClipboardConfig(JSON.stringify({}));
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.message).toBe('Invalid MCP configuration format');
	});
});

describe('getMcpServerType (TEST-MC-005, EC-MC-6)', () => {
	it('{ type:"sse", url } → "sse"', () => {
		expect(getMcpServerType({ type: 'sse', url: 'https://x' })).toBe('sse');
	});
	it('{ type:"http", url } → "http"', () => {
		expect(getMcpServerType({ type: 'http', url: 'https://x' })).toBe('http');
	});
	it('{ url } (no explicit type) → "http"', () => {
		const cfg = { url: 'https://x' } as unknown as McpServerConfig;
		expect(getMcpServerType(cfg)).toBe('http');
	});
	it('{ command } → "stdio"', () => {
		expect(getMcpServerType({ command: 'npx' })).toBe('stdio');
	});
});

describe('isValidMcpServerConfig (TEST-MC-006, EC-MC-6)', () => {
	it('{ command:"x" } is valid', () => {
		expect(isValidMcpServerConfig({ command: 'x' })).toBe(true);
	});
	it('{ url:"http://x" } is valid', () => {
		expect(isValidMcpServerConfig({ url: 'http://x' })).toBe(true);
	});
	it('{} is invalid', () => {
		expect(isValidMcpServerConfig({})).toBe(false);
	});
	it('a non-object is invalid', () => {
		expect(isValidMcpServerConfig(42)).toBe(false);
		expect(isValidMcpServerConfig('x')).toBe(false);
		expect(isValidMcpServerConfig(null)).toBe(false);
		expect(isValidMcpServerConfig(undefined)).toBe(false);
	});
	it('an array is invalid', () => {
		expect(isValidMcpServerConfig([{ command: 'x' }])).toBe(false);
	});
	it('{ command:123 } (non-string) is invalid', () => {
		expect(isValidMcpServerConfig({ command: 123 })).toBe(false);
	});
	it('{ command:"" } (empty string) is invalid', () => {
		expect(isValidMcpServerConfig({ command: '' })).toBe(false);
	});
});

describe('the parser is total — never throws (NFR-MC-004)', () => {
	const inputs = ['', '{', 'null', 'true', '[]', '"x"', '{"a":1}', JSON.stringify({ command: 'x' })];
	it('parseClipboardConfig never throws across the input matrix', () => {
		for (const raw of inputs) {
			expect(() => parseClipboardConfig(raw)).not.toThrow();
		}
	});
	it('getMcpServerType + isValidMcpServerConfig never throw on odd input', () => {
		const odd: unknown[] = [null, undefined, 42, 'x', [], {}, { command: 1 }, { url: {} }];
		for (const o of odd) {
			expect(() => isValidMcpServerConfig(o)).not.toThrow();
			expect(() => getMcpServerType(o as McpServerConfig)).not.toThrow();
		}
	});
});
