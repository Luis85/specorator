/**
 * T-MC-006 (TEST-MC-001/002/007 + EC-MC-12/19/20) — RED: the PURE, TOTAL config
 * codec (`deserializeMcpConfig` / `serializeMcpConfig`). Covers load-or-default
 * (absent/empty/unparseable/no-`mcpServers` → ok([])), the sidecar default
 * application + skip-invalid, the serialise non-default pruning + default-pruning,
 * the CLI-key preservation (top-level + non-`servers` `_claudian` keys), the
 * 2-space indent, and the never-throws assertion. Ported from claudian
 * `McpStorage.load:14-56` + `save:58-134`.
 *
 * Fails until T-MC-007 adds `src/domain/chat/mcp/McpConfigCodec.ts`.
 *
 * Traces: TEST-MC-001, TEST-MC-002, TEST-MC-007, SPEC-MC-003, REQ-MC-001/002/007,
 * NFR-MC-004, EC-MC-12/19/20.
 */
import { describe, it, expect } from 'vitest';
import { deserializeMcpConfig, serializeMcpConfig } from '@/domain/chat/mcp';
import type { ManagedMcpServer } from '@/domain/chat/mcp';

describe('deserializeMcpConfig — load-or-default (TEST-MC-002, EC-MC-12)', () => {
	it('null → ok([])', () => {
		const r = deserializeMcpConfig(null);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value).toEqual([]);
	});
	it('empty string → ok([])', () => {
		const r = deserializeMcpConfig('');
		expect(r.ok && r.value).toEqual([]);
	});
	it('unparseable JSON → ok([])', () => {
		const r = deserializeMcpConfig('{ not json');
		expect(r.ok && r.value).toEqual([]);
	});
	it('a doc with no mcpServers → ok([])', () => {
		const r = deserializeMcpConfig(JSON.stringify({ other: 1 }));
		expect(r.ok && r.value).toEqual([]);
	});
	it('a doc whose mcpServers is not an object → ok([])', () => {
		const r = deserializeMcpConfig(JSON.stringify({ mcpServers: 42 }));
		expect(r.ok && r.value).toEqual([]);
	});
});

describe('deserializeMcpConfig — sidecar defaults + skip-invalid (TEST-MC-001)', () => {
	it('applies DEFAULT_MCP_SERVER when the sidecar omits enabled/contextSaving', () => {
		const raw = JSON.stringify({ mcpServers: { fs: { command: 'npx' } } });
		const r = deserializeMcpConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value).toEqual([
			{
				name: 'fs',
				config: { command: 'npx' },
				enabled: true,
				contextSaving: true,
				disabledTools: undefined,
				description: undefined,
			},
		]);
	});

	it('reads the _claudian sidecar metadata', () => {
		const raw = JSON.stringify({
			mcpServers: { fs: { command: 'npx' } },
			_claudian: {
				servers: {
					fs: {
						enabled: false,
						contextSaving: false,
						disabledTools: ['write', '', '  '],
						description: 'Filesystem',
					},
				},
			},
		});
		const r = deserializeMcpConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value[0].enabled).toBe(false);
		expect(r.value[0].contextSaving).toBe(false);
		// non-string / empty filtered out
		expect(r.value[0].disabledTools).toEqual(['write']);
		expect(r.value[0].description).toBe('Filesystem');
	});

	it('an empty disabledTools sidecar array → undefined', () => {
		const raw = JSON.stringify({
			mcpServers: { fs: { command: 'npx' } },
			_claudian: { servers: { fs: { disabledTools: [] } } },
		});
		const r = deserializeMcpConfig(raw);
		expect(r.ok && r.value[0].disabledTools).toBeUndefined();
	});

	it('skips an entry failing isValidMcpServerConfig (EC-MC-12)', () => {
		const raw = JSON.stringify({
			mcpServers: { good: { command: 'npx' }, bad: { nope: 1 } },
		});
		const r = deserializeMcpConfig(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.map((s) => s.name)).toEqual(['good']);
	});
});

describe('serializeMcpConfig — default pruning (TEST-MC-007, EC-MC-20)', () => {
	it('a server at all defaults writes no _claudian sidecar entry', () => {
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, null);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc.mcpServers).toEqual({ fs: { command: 'npx' } });
		expect(doc._claudian).toBeUndefined();
	});

	it('writes ONLY the non-default _claudian fields', () => {
		const servers: ManagedMcpServer[] = [
			{
				name: 'fs',
				config: { command: 'npx' },
				enabled: false, // non-default
				contextSaving: true, // default → omitted
				disabledTools: ['write', '  ', ''], // trimmed non-empty
				description: 'Filesystem',
			},
		];
		const r = serializeMcpConfig(servers, null);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc._claudian.servers.fs).toEqual({
			enabled: false,
			disabledTools: ['write'],
			description: 'Filesystem',
		});
	});

	it('round-trips a server with non-default metadata', () => {
		const servers: ManagedMcpServer[] = [
			{
				name: 'fs',
				config: { command: 'npx', args: ['-y', 'pkg'] },
				enabled: false,
				contextSaving: false,
				disabledTools: ['write'],
				description: 'desc',
			},
		];
		const ser = serializeMcpConfig(servers, null);
		expect(ser.ok).toBe(true);
		if (!ser.ok) return;
		const back = deserializeMcpConfig(ser.value);
		expect(back.ok).toBe(true);
		if (!back.ok) return;
		expect(back.value).toEqual(servers);
	});

	it('uses a 2-space indent', () => {
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, null);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value).toContain('\n  "mcpServers"');
	});
});

describe('serializeMcpConfig — CLI-key preservation (TEST-MC-007, EC-MC-19)', () => {
	it('preserves unknown top-level keys from the prior doc', () => {
		const existing = JSON.stringify({
			mcpServers: { old: { command: 'old' } },
			someCliKey: { keep: true },
		});
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, existing);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc.someCliKey).toEqual({ keep: true });
		expect(doc.mcpServers).toEqual({ fs: { command: 'npx' } });
	});

	it('preserves non-servers _claudian keys from the prior doc', () => {
		const existing = JSON.stringify({
			mcpServers: { fs: { command: 'npx' } },
			_claudian: { servers: { fs: { enabled: false } }, otherClaudianKey: 'x' },
		});
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: false, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, existing);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc._claudian.otherClaudianKey).toBe('x');
		expect(doc._claudian.servers.fs).toEqual({ enabled: false });
	});

	it('deletes _claudian when no server has non-default metadata and no other keys existed', () => {
		const existing = JSON.stringify({
			mcpServers: { fs: { command: 'npx' } },
			_claudian: { servers: { fs: { enabled: false } } },
		});
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, existing);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc._claudian).toBeUndefined();
	});

	it('keeps a non-servers _claudian key even when all servers are default', () => {
		const existing = JSON.stringify({
			mcpServers: { fs: { command: 'npx' } },
			_claudian: { servers: { fs: { enabled: false } }, otherClaudianKey: 'x' },
		});
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		const r = serializeMcpConfig(servers, existing);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const doc = JSON.parse(r.value);
		expect(doc._claudian).toEqual({ otherClaudianKey: 'x' });
	});
});

describe('the codec is total — never throws (NFR-MC-004)', () => {
	it('deserializeMcpConfig never throws across odd input', () => {
		const inputs = [null, '', '{', 'null', '[]', '"x"', '42', JSON.stringify({ mcpServers: null })];
		for (const raw of inputs) {
			expect(() => deserializeMcpConfig(raw)).not.toThrow();
		}
	});
	it('serializeMcpConfig never throws across odd existingRaw', () => {
		const servers: ManagedMcpServer[] = [
			{ name: 'fs', config: { command: 'npx' }, enabled: true, contextSaving: true },
		];
		for (const existing of [null, '', '{ bad', '[]', 'null', '"x"']) {
			expect(() => serializeMcpConfig(servers, existing)).not.toThrow();
		}
		expect(() => serializeMcpConfig([], null)).not.toThrow();
	});
});
