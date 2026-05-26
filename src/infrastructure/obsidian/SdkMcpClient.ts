import * as http from 'node:http';
import * as https from 'node:https';
import { delimiter as PATH_DELIMITER } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport';

import type { McpClientPort, McpConnection } from '@/domain/ports';
import type {
	ManagedMcpServer,
	McpServerConfig,
	McpStdioServerConfig,
	McpTestResult,
	McpTool,
} from '@/domain/chat/mcp/McpTypes';
import { getMcpServerType } from '@/domain/chat/mcp/McpConfigParser';
import { parseCommand } from '@/domain/chat/mcp/parseCommand';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** Connect/list-tools probe budget — the friendly "Connection timeout (10s)" deadline. */
const TEST_TIMEOUT_MS = 10_000;

interface UrlServerConfig {
	url: string;
	headers?: Record<string, string>;
}

/**
 * The real SDK-backed `McpClientPort` (P8, SPEC-MC-009, ADR-MC-002 §1). The only
 * place `@modelcontextprotocol/sdk` is imported. Builds the per-type transport —
 * stdio (a **bounded explicit spawn**: the no-shell `parseCommand` cmd+args, a merged
 * `env` with an enhanced `PATH`, `stderr:'ignore'` — the same posture as
 * `ShellExecPort`/`ClaudeCliChatRuntime`, REQ-MC-061/020), SSE
 * (`SSEClientTransport`) and HTTP (`StreamableHTTPClientTransport`), both over a Node
 * `http`/`https` fetch so the renderer's CORS does not block the probe and TLS is
 * **not** weakened (REQ-MC-021/022/064) — and connects with a **10s
 * `AbortController`** (REQ-MC-031).
 *
 * `test` maps the SPEC-MC-028 state model and **NEVER throws** (the whole body is
 * guarded): connect-ok+list-ok → success+tools; connect-ok+list-fail → partial
 * success (REQ-MC-032); construct-fail → `'Missing command'` / `'Invalid server
 * configuration'` (REQ-MC-023); 10s abort → `'Connection timeout (10s)'`
 * (REQ-MC-031); other failure → the friendly message (REQ-MC-033). Every transport
 * is torn down in `finally`.
 *
 * `connect`/`listTools`/`callTool`/`disconnect` are the seam for a future non-SDK /
 * Mock-driven path — OFF the P8 turn-time critical path (the Claude SDK calls tools
 * from the advertised set; open item #2). They retain a live `Client` keyed by an
 * opaque connection id and are `Result`-typed.
 *
 * Lives under `src/infrastructure/obsidian/**` (coverage-excluded, §10): behavioural
 * gate = the MANUAL legs TEST-MC-M1 + TEST-MC-021/022/061/064. No `obsidian`/SDK/`node:*`
 * symbol leaks past this file.
 */
export class SdkMcpClient implements McpClientPort {
	private readonly connections = new Map<string, Client>();
	private idSeq = 0;

	/** This bridge runs a Node runtime → the transports are available. */
	isAvailable(): boolean {
		return true;
	}

	async test(server: ManagedMcpServer): Promise<McpTestResult> {
		const built = this._buildTransport(server.config);
		if (!built.ok) {
			return { success: false, tools: [], error: built.error.message };
		}

		const client = new Client({ name: 'specorator-mcp-tester', version: '1.0.0' });
		const controller = new AbortController();
		const timeout = activeWindow.setTimeout(() => {
			controller.abort();
		}, TEST_TIMEOUT_MS);

		try {
			await client.connect(built.value, { signal: controller.signal });
			const version = client.getServerVersion();
			const tools = await SdkMcpClient._listToolsLenient(client, controller.signal);
			return {
				success: true,
				serverName: version?.name,
				serverVersion: version?.version,
				tools,
			};
		} catch (error) {
			if (controller.signal.aborted) {
				return { success: false, tools: [], error: 'Connection timeout (10s)' };
			}
			return {
				success: false,
				tools: [],
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		} finally {
			activeWindow.clearTimeout(timeout);
			await SdkMcpClient._safeClose(client);
		}
	}

	async connect(server: ManagedMcpServer): Promise<Result<McpConnection>> {
		const built = this._buildTransport(server.config);
		if (!built.ok) return err(built.error);

		const client = new Client({ name: 'specorator-mcp-client', version: '1.0.0' });
		try {
			await client.connect(built.value);
		} catch (error) {
			await SdkMcpClient._safeClose(client);
			return err(error instanceof Error ? error : new Error('MCP connect failed'));
		}

		const id = `mcp-conn-${(this.idSeq += 1)}`;
		this.connections.set(id, client);
		return ok({ id });
	}

	async listTools(connection: McpConnection): Promise<Result<readonly McpTool[]>> {
		const client = this.connections.get(connection.id);
		if (client === undefined) return err(new Error('MCP connection not found'));
		try {
			const result = await client.listTools();
			return ok(SdkMcpClient._mapTools(result.tools));
		} catch (error) {
			return err(error instanceof Error ? error : new Error('MCP listTools failed'));
		}
	}

	async callTool(
		connection: McpConnection,
		toolName: string,
		input: Record<string, unknown>,
	): Promise<Result<unknown>> {
		const client = this.connections.get(connection.id);
		if (client === undefined) return err(new Error('MCP connection not found'));
		try {
			const result = await client.callTool({ name: toolName, arguments: input });
			return ok(result);
		} catch (error) {
			return err(error instanceof Error ? error : new Error('MCP callTool failed'));
		}
	}

	async disconnect(connection: McpConnection): Promise<Result<void>> {
		const client = this.connections.get(connection.id);
		if (client === undefined) return ok(undefined); // idempotent — already gone.
		this.connections.delete(connection.id);
		await SdkMcpClient._safeClose(client);
		return ok(undefined);
	}

	/** Build the per-type SDK transport; a construct fault ⇒ `err` (mapped by `test`). */
	private _buildTransport(config: McpServerConfig): Result<Transport> {
		const type = getMcpServerType(config);
		try {
			if (type === 'stdio') {
				return SdkMcpClient._buildStdioTransport(config as McpStdioServerConfig);
			}
			return ok(SdkMcpClient._buildUrlTransport(type, config as UrlServerConfig));
		} catch (error) {
			return err(
				error instanceof Error ? error : new Error('Invalid server configuration'),
			);
		}
	}

	/** A bounded explicit stdio spawn — no-shell cmd+args, merged env, `stderr:'ignore'`. */
	private static _buildStdioTransport(config: McpStdioServerConfig): Result<Transport> {
		const { cmd, args } = parseCommand(config.command, config.args);
		if (cmd === '') return err(new Error('Missing command'));
		const transport = new StdioClientTransport({
			command: cmd,
			args,
			env: { ...SdkMcpClient._stringEnv(), ...config.env, PATH: SdkMcpClient._enhancedPath() },
			stderr: 'ignore',
		});
		return ok(transport);
	}

	/** An SSE / streamable-HTTP transport over the Node fetch (no renderer CORS, no TLS weakening). */
	private static _buildUrlTransport(
		type: 'sse' | 'http',
		config: UrlServerConfig,
	): Transport {
		const url = new URL(config.url);
		const options = {
			fetch: nodeFetch,
			requestInit: config.headers !== undefined ? { headers: config.headers } : undefined,
		};
		return type === 'sse'
			? // Legacy SSE MCP servers still need the SDK's deprecated SSE transport (REQ-MC-021).
				// eslint-disable-next-line @typescript-eslint/no-deprecated
				new SSEClientTransport(url, options)
			: new StreamableHTTPClientTransport(url, options);
	}

	/** `listTools` after a successful connect; a list failure is partial success (empty tools). */
	private static async _listToolsLenient(
		client: Client,
		signal: AbortSignal,
	): Promise<McpTool[]> {
		try {
			const result = await client.listTools(undefined, { signal });
			return SdkMcpClient._mapTools(result.tools);
		} catch {
			return [];
		}
	}

	private static _mapTools(
		tools: ReadonlyArray<{
			name: string;
			description?: string;
			inputSchema?: Record<string, unknown>;
		}>,
	): McpTool[] {
		return tools.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		}));
	}

	/** Close a client, swallowing any close fault (teardown is best-effort). */
	private static async _safeClose(client: Client): Promise<void> {
		try {
			await client.close();
		} catch {
			// Ignore close errors — the transport is being discarded.
		}
	}

	/** `process.env` narrowed to defined string values for the child `env` map. */
	private static _stringEnv(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === 'string') out[key] = value;
		}
		return out;
	}

	/**
	 * Build an enhanced PATH so a GUI-launched Obsidian (sparse PATH on macOS/Linux)
	 * can still find user-installed MCP server binaries. NO plugin secret is injected
	 * — mirrors `ObsidianShellExec._enhancedPath` / `ClaudeCliChatRuntime._buildEnv`.
	 */
	private static _enhancedPath(): string {
		const extra = ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME ?? ''}/.local/bin`];
		const current = process.env.PATH ?? '';
		return [current, ...extra].filter((p) => p.length > 0).join(PATH_DELIMITER);
	}
}

/**
 * A Node `http`/`https` fetch shim (ported from claudian `McpTester.createNodeFetch`)
 * so the SSE/HTTP probe runs in the main process and bypasses the renderer's CORS
 * while keeping the SDK transports for the MCP protocol semantics. TLS verification is
 * left at Node's default (NOT weakened, REQ-MC-064).
 */
const nodeFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = async (
	input,
	init,
) => {
	const requestUrl = getRequestUrl(input);
	const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
	const headers = mergeHeaders(input, init);
	const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
	const body = await getRequestBody(init?.body ?? (input instanceof Request ? input.body : undefined));
	return runNodeRequest({ requestUrl, method, headers, signal, body });
};

interface NodeRequestSpec {
	requestUrl: URL;
	method: string;
	headers: Headers;
	signal: AbortSignal | null;
	body: Buffer | undefined;
}

/** Issue one Node http(s) request, resolving a fetch-shaped Response (the executor body). */
function runNodeRequest(spec: NodeRequestSpec): Promise<Response> {
	const { requestUrl, method, headers, signal, body } = spec;
	const transport = requestUrl.protocol === 'https:' ? https : http;

	return new Promise<Response>((resolve, reject) => {
		let settled = false;
		const fail = (error: unknown): void => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener('abort', onAbort);
			reject(error instanceof Error ? error : new Error(String(error)));
		};
		const onAbort = (): void => {
			req.destroy(new Error('Request aborted'));
			fail(signal?.reason ?? new Error('Request aborted'));
		};

		const requestHeaders: Record<string, string> = {};
		headers.forEach((value, key) => {
			requestHeaders[key] = value;
		});
		if (body !== undefined) {
			requestHeaders['content-length'] = String(body.byteLength);
		}

		const req = transport.request(
			requestUrl,
			{ method, headers: requestHeaders },
			(res: http.IncomingMessage) => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener('abort', onAbort);
				resolve(createFetchResponse(res) as unknown as Response);
			},
		);
		req.on('error', (error: Error) => {
			fail(error);
		});

		if (signal !== null) {
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener('abort', onAbort, { once: true });
		}

		req.end(body);
	});
}

interface MinimalFetchResponse {
	ok: boolean;
	status: number;
	statusText: string;
	headers: Headers;
	body: ReadableStream<Uint8Array> | null;
	text: () => Promise<string>;
	json: () => Promise<unknown>;
}

function createFetchResponse(res: http.IncomingMessage): MinimalFetchResponse {
	const responseHeaders = new Headers();
	for (const [key, value] of Object.entries(res.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const headerValue of value) responseHeaders.append(key, headerValue);
		} else {
			responseHeaders.append(key, value);
		}
	}

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			res.on('data', (chunk: Buffer | string) => {
				const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
				controller.enqueue(new Uint8Array(buffer));
			});
			res.on('end', () => {
				controller.close();
			});
			res.on('error', (error: Error) => {
				controller.error(error);
			});
		},
		cancel(reason?: unknown) {
			res.destroy(reason instanceof Error ? reason : new Error('Response body cancelled'));
		},
	});

	const status = res.statusCode ?? 500;
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: res.statusMessage ?? '',
		headers: responseHeaders,
		body,
		text: () => readStreamAsText(body),
		json: async (): Promise<unknown> => JSON.parse(await readStreamAsText(body)) as unknown,
	};
}

async function readStreamAsText(body: ReadableStream<Uint8Array>): Promise<string> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

function getRequestUrl(input: string | URL | Request): URL {
	if (input instanceof URL) return input;
	if (typeof input === 'string') return new URL(input);
	return new URL(input.url);
}

function mergeHeaders(input: string | URL | Request, init?: RequestInit): Headers {
	const headers = new Headers(input instanceof Request ? input.headers : undefined);
	if (init?.headers !== undefined) {
		new Headers(init.headers).forEach((value, key) => {
			headers.set(key, value);
		});
	}
	return headers;
}

async function getRequestBody(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
	if (body === undefined || body === null) return undefined;
	const serialized = await new Response(body).arrayBuffer();
	return Buffer.from(serialized);
}
