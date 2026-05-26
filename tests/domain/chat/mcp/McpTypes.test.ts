/**
 * T-MC-002 (TEST-MC-001 type-shape leg) — RED: the `McpTypes` shapes are defined
 * and re-exported from `@/domain/chat/mcp` (the barrel). Asserts the config union
 * (`McpStdioServerConfig`/`McpSseServerConfig`/`McpHttpServerConfig` →
 * `McpServerConfig`), `McpServerType`, `ManagedMcpServer`, `McpTool`,
 * `McpTestResult`, `ParsedMcpConfig`, `EnabledMcpServers`, and the
 * `DEFAULT_MCP_SERVER` constant — regrown verbatim from claudian
 * `core/types/mcp.ts` + `core/mcp/McpTester.ts:13-25`.
 *
 * Fails until T-MC-003 adds `src/domain/chat/mcp/McpTypes.ts` + the barrel.
 *
 * Traces: TEST-MC-001, SPEC-MC-001, REQ-MC-052, NFR-MC-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	McpStdioServerConfig,
	McpSseServerConfig,
	McpHttpServerConfig,
	McpServerConfig,
	McpServerType,
	ManagedMcpServer,
	McpTool,
	McpTestResult,
	ParsedMcpConfig,
	EnabledMcpServers,
} from '@/domain/chat/mcp';
import { DEFAULT_MCP_SERVER } from '@/domain/chat/mcp';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The transport union ----
const _serverType: Equals<McpServerType, 'stdio' | 'sse' | 'http'> = true;
void _serverType;

// A stdio config (command required; type optional 'stdio'; args/env optional).
const _stdio: McpStdioServerConfig = { command: 'npx', args: ['-y', 'pkg'], env: { K: 'v' } };
void _stdio;

// An sse config (type:'sse' + url; headers optional).
const _sse: McpSseServerConfig = { type: 'sse', url: 'https://x/sse', headers: { A: 'b' } };
void _sse;

// An http config (type:'http' + url; headers optional).
const _http: McpHttpServerConfig = { type: 'http', url: 'https://x/mcp' };
void _http;

// The union admits all three.
const _union: McpServerConfig = _stdio;
void _union;

// ---- ManagedMcpServer ----
const _managedKeys: Equals<
	keyof ManagedMcpServer,
	'name' | 'config' | 'enabled' | 'contextSaving' | 'disabledTools' | 'description'
> = true;
void _managedKeys;
const _managedName: Equals<ManagedMcpServer['name'], string> = true;
const _managedEnabled: Equals<ManagedMcpServer['enabled'], boolean> = true;
const _managedCtx: Equals<ManagedMcpServer['contextSaving'], boolean> = true;
const _managedDisabled: Equals<ManagedMcpServer['disabledTools'], string[] | undefined> = true;
const _managedDesc: Equals<ManagedMcpServer['description'], string | undefined> = true;
const _managedConfig: Equals<ManagedMcpServer['config'], McpServerConfig> = true;
void _managedName;
void _managedEnabled;
void _managedCtx;
void _managedDisabled;
void _managedDesc;
void _managedConfig;

// ---- McpTool ----
const _toolKeys: Equals<keyof McpTool, 'name' | 'description' | 'inputSchema'> = true;
const _toolName: Equals<McpTool['name'], string> = true;
const _toolSchema: Equals<McpTool['inputSchema'], Record<string, unknown> | undefined> = true;
void _toolKeys;
void _toolName;
void _toolSchema;

// ---- McpTestResult ----
const _resultKeys: Equals<
	keyof McpTestResult,
	'success' | 'serverName' | 'serverVersion' | 'tools' | 'error'
> = true;
const _resultSuccess: Equals<McpTestResult['success'], boolean> = true;
const _resultTools: Equals<McpTestResult['tools'], McpTool[]> = true;
const _resultError: Equals<McpTestResult['error'], string | undefined> = true;
void _resultKeys;
void _resultSuccess;
void _resultTools;
void _resultError;

// ---- ParsedMcpConfig ----
const _parsedKeys: Equals<keyof ParsedMcpConfig, 'servers' | 'needsName'> = true;
const _parsedServers: Equals<
	ParsedMcpConfig['servers'],
	ReadonlyArray<{ name: string; config: McpServerConfig }>
> = true;
const _parsedNeedsName: Equals<ParsedMcpConfig['needsName'], boolean> = true;
void _parsedKeys;
void _parsedServers;
void _parsedNeedsName;

// ---- EnabledMcpServers ----
const _enabledKeys: Equals<keyof EnabledMcpServers, 'servers' | 'disallowedTools'> = true;
const _enabledServers: Equals<
	EnabledMcpServers['servers'],
	Record<string, McpServerConfig>
> = true;
const _enabledDisallowed: Equals<EnabledMcpServers['disallowedTools'], readonly string[]> = true;
void _enabledKeys;
void _enabledServers;
void _enabledDisallowed;

describe('McpTypes shapes (TEST-MC-001)', () => {
	it('DEFAULT_MCP_SERVER is { enabled:true, contextSaving:true }', () => {
		expect(DEFAULT_MCP_SERVER).toEqual({ enabled: true, contextSaving: true });
	});

	it('constructs a ManagedMcpServer for each transport', () => {
		const stdio: ManagedMcpServer = {
			name: 'fs',
			config: { command: 'npx', args: ['-y', 'server-filesystem'] },
			enabled: true,
			contextSaving: false,
		};
		const sse: ManagedMcpServer = {
			name: 'remote',
			config: { type: 'sse', url: 'https://x/sse' },
			enabled: false,
			contextSaving: true,
			disabledTools: ['write'],
			description: 'remote tools',
		};
		expect(stdio.config).toHaveProperty('command');
		expect(sse.config).toHaveProperty('url');
		expect(sse.disabledTools).toEqual(['write']);
	});

	it('constructs an EnabledMcpServers fold value', () => {
		const fold: EnabledMcpServers = {
			servers: { fs: { command: 'npx' } },
			disallowedTools: ['mcp__fs__write'],
		};
		expect(Object.keys(fold.servers)).toEqual(['fs']);
		expect(fold.disallowedTools).toEqual(['mcp__fs__write']);
	});

	it('constructs an McpTestResult', () => {
		const ok: McpTestResult = {
			success: true,
			serverName: 'fs',
			serverVersion: '1.2.0',
			tools: [{ name: 'read' }],
		};
		expect(ok.success).toBe(true);
		expect(ok.tools[0].name).toBe('read');
	});
});
