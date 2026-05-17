/**
 * PR-ASV-2-subproc — Tests for the real per-token streaming surface of
 * `ClaudeSubprocessAdapter.queryStream()`.
 *
 * Each `assistant/message` NDJSON event must become exactly one `text`
 * delta in order, the first `system/init` event must become exactly one
 * `session-id` delta, and the stream must terminate with `done` (on a
 * `result` with `is_error: false`) or `error` (on `is_error: true`,
 * non-zero subprocess exit, timeout, signal abort, or spawn failure).
 *
 * Tests the implementation refactored from `pending.textBuffer` into a
 * push-channel-driven async iterable. The legacy `query()` test suite in
 * `ClaudeSubprocessAdapter.test.ts` already exercises the wire-format
 * paths (NDJSON dispatch, redaction, telemetry); this file focuses on
 * the streaming contract (delta order, abort, single-fire session-id).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import { ClaudeCliError, type StreamDelta } from '@/domain/ports/ClaudeCliPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { ClaudeSubprocessAdapter } from '@/infrastructure/obsidian/ClaudeSubprocessAdapter';

// -----------------------------------------------------------------------------
// Fake child + spawn — same shape as ClaudeSubprocessAdapter.test.ts.
// -----------------------------------------------------------------------------

interface FakeChildProcess extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
	exitCode: number | null;
}

function makeChild(): FakeChildProcess {
	return Object.assign(new EventEmitter(), {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		stdin: { write: vi.fn(), end: vi.fn() },
		kill: vi.fn(function (this: FakeChildProcess) {
			this.killed = true;
		}),
		killed: false,
		exitCode: null,
	}) as FakeChildProcess;
}

interface SpawnCall {
	command: string;
	args: readonly string[];
}

interface FakeSpawnHandle {
	spawn: ReturnType<typeof vi.fn>;
	calls: SpawnCall[];
	children: FakeChildProcess[];
	lastChild: () => FakeChildProcess;
	emitStdout: (child: FakeChildProcess, chunk: string) => void;
	closeWith: (child: FakeChildProcess, exitCode: number) => void;
}

function makeFakeSpawn(): FakeSpawnHandle {
	const calls: SpawnCall[] = [];
	const children: FakeChildProcess[] = [];

	const spawn = vi.fn((command: string, args: readonly string[]) => {
		calls.push({ command, args });
		const child = makeChild();
		children.push(child);
		return child;
	});

	return {
		spawn,
		calls,
		children,
		lastChild: () => children[children.length - 1],
		emitStdout(child, chunk) {
			child.stdout.emit('data', Buffer.from(chunk, 'utf8'));
		},
		closeWith(child, exitCode) {
			queueMicrotask(() => {
				child.exitCode = exitCode;
				child.stdout.emit('end');
				child.stderr.emit('end');
				child.emit('close', exitCode, null);
				child.emit('exit', exitCode, null);
			});
		},
	};
}

function makeLogger(): LoggerPort {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

interface AsmSettings extends PluginSettings {
	readonly claudeCliPath: string;
}

function makeSettings(overrides: Partial<AsmSettings> = {}): AsmSettings {
	return { ...DEFAULT_SETTINGS, claudeCliPath: '/fake/bin/claude', ...overrides };
}

async function makeAdapter(): Promise<{
	adapter: ClaudeSubprocessAdapter;
	spawn: FakeSpawnHandle;
}> {
	const spawn = makeFakeSpawn();
	const adapter = new ClaudeSubprocessAdapter({
		getSettings: () => makeSettings(),
		logger: makeLogger(),
		resolveCliPath: async () => '/fake/bin/claude',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		spawn: spawn.spawn as any,
	});
	await adapter.startup();
	return { adapter, spawn };
}

// -----------------------------------------------------------------------------
// NDJSON helpers — mirror ClaudeSubprocessAdapter.test.ts.
// -----------------------------------------------------------------------------

function ndjson(...events: Array<Record<string, unknown>>): string {
	return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function systemInit(sessionId: string): Record<string, unknown> {
	return { type: 'system/init', session_id: sessionId };
}

function assistantDelta(text: string): Record<string, unknown> {
	return { type: 'assistant/message', text };
}

function resultEvent(result: string, isError = false): Record<string, unknown> {
	return { type: 'result', subtype: 'success', result, is_error: isError };
}

// -----------------------------------------------------------------------------
// Consume an async iterable into an array, with an optional max-deltas guard
// so a runaway producer doesn't hang the test runner.
// -----------------------------------------------------------------------------
async function collect<T>(iter: AsyncIterable<T>, max = 100): Promise<T[]> {
	const out: T[] = [];
	for await (const d of iter) {
		out.push(d);
		if (out.length >= max) break;
	}
	return out;
}

// =============================================================================
// 1. assistant/message → text delta, in order.
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — per-token text deltas', () => {
	it('emits one text delta per assistant/message event in arrival order', async () => {
		const { adapter, spawn } = await makeAdapter();
		const iterable = adapter.queryStream('hi');

		// Begin consuming before the producer fires — collect() will park
		// on the channel until each chunk arrives.
		const collected = collect(iterable);

		// Wait one microtask so the adapter has called spawn().
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				systemInit('sess-stream'),
				assistantDelta('Hello'),
				assistantDelta(' '),
				assistantDelta('world'),
				resultEvent('Hello world'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const textDeltas = deltas.filter((d): d is Extract<StreamDelta, { type: 'text' }> => d.type === 'text');
		expect(textDeltas.map((d) => d.text)).toEqual(['Hello', ' ', 'world']);
	});
});

// =============================================================================
// 2. result with is_error: false → terminal done.
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — terminal done', () => {
	it('emits exactly one `done` delta as the terminal event on success', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(systemInit('s-1'), assistantDelta('ok'), resultEvent('ok')),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		expect(deltas[deltas.length - 1]).toEqual({ type: 'done' });
		expect(deltas.filter((d) => d.type === 'done')).toHaveLength(1);
		expect(deltas.filter((d) => d.type === 'error')).toHaveLength(0);
	});
});

// =============================================================================
// 3. result with is_error: true → terminal error (QUERY_FAILED).
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — is_error → terminal error', () => {
	it('emits a terminal `error` delta with QUERY_FAILED on is_error: true', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(systemInit('s-err'), resultEvent('boom', true)),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const last = deltas[deltas.length - 1];
		expect(last.type).toBe('error');
		if (last.type === 'error') {
			expect(last.error).toBeInstanceOf(ClaudeCliError);
			expect(last.error.errorCode).toBe('QUERY_FAILED');
		}
		expect(deltas.filter((d) => d.type === 'done')).toHaveLength(0);
	});
});

// =============================================================================
// 4. Aborting `options.signal` mid-stream → kills subprocess + terminal error.
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — abort mid-stream', () => {
	it('aborting the signal kills the subprocess and emits a terminal error', async () => {
		const { adapter, spawn } = await makeAdapter();
		const controller = new AbortController();
		const collected = collect(adapter.queryStream('hi', { signal: controller.signal }));
		await Promise.resolve();
		const child = spawn.lastChild();

		// Emit one delta, then abort.
		spawn.emitStdout(child, ndjson(systemInit('s-ab'), assistantDelta('partial')));
		await Promise.resolve();

		controller.abort();

		// Simulate the kill closing the child (so the close handler runs).
		queueMicrotask(() => {
			child.emit('close', null, 'SIGTERM');
		});

		const deltas = await collected;
		expect(child.kill).toHaveBeenCalled();
		const last = deltas[deltas.length - 1];
		expect(last.type).toBe('error');
		if (last.type === 'error') {
			expect(last.error.errorCode).toBe('QUERY_FAILED');
		}
	});

	it('a pre-aborted signal short-circuits without spawning the subprocess', async () => {
		const { adapter, spawn } = await makeAdapter();
		const controller = new AbortController();
		controller.abort();

		const deltas = await collect(adapter.queryStream('hi', { signal: controller.signal }));

		expect(spawn.spawn).not.toHaveBeenCalled();
		expect(deltas).toHaveLength(1);
		expect(deltas[0].type).toBe('error');
		if (deltas[0].type === 'error') {
			expect(deltas[0].error.errorCode).toBe('QUERY_FAILED');
		}
	});
});

// =============================================================================
// 5. system/init → exactly one session-id delta; subsequent ignored.
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — session-id single-fire', () => {
	it('emits exactly one session-id delta on the first system/init event', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		// Two system/init events (defensive: the protocol guarantees one, but
		// a misbehaving CLI must not cause the consumer to see two).
		spawn.emitStdout(
			child,
			ndjson(systemInit('first'), systemInit('second'), resultEvent('ok')),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const sessionDeltas = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'session-id' }> => d.type === 'session-id',
		);
		expect(sessionDeltas).toHaveLength(1);
		expect(sessionDeltas[0].sessionId).toBe('first');
	});
});

// =============================================================================
// 6. Non-zero subprocess exit → terminal error (QUERY_FAILED).
// =============================================================================

describe('ClaudeSubprocessAdapter.queryStream — subprocess exit code', () => {
	it('non-zero exit before a result event surfaces as terminal error', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		// Emit a partial text delta, then exit non-zero without a result event.
		spawn.emitStdout(child, ndjson(systemInit('s-x'), assistantDelta('partial')));
		spawn.closeWith(child, 137); // SIGKILL-style exit code

		const deltas = await collected;
		const last = deltas[deltas.length - 1];
		expect(last.type).toBe('error');
		if (last.type === 'error') {
			expect(last.error.errorCode).toBe('QUERY_FAILED');
		}
	});
});

// =============================================================================
// 7. PR-ASV-2-delta-extension — extended StreamDelta variants
// =============================================================================

function streamEvent(inner: Record<string, unknown>): Record<string, unknown> {
	return { type: 'stream_event', event: inner };
}

describe('ClaudeSubprocessAdapter.queryStream — extended StreamDelta variants', () => {
	it('emits a `thinking` delta on a thinking_delta stream event', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				streamEvent({
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'thinking_delta', thinking: 'reasoning ' },
				}),
				resultEvent('ok'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const thinking = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'thinking' }> => d.type === 'thinking',
		);
		expect(thinking).toHaveLength(1);
		expect(thinking[0].text).toBe('reasoning ');
	});

	it('emits `tool-use-start` / `tool-use-input-delta` / `tool-use-stop` keyed by blockId', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				streamEvent({
					type: 'content_block_start',
					index: 1,
					content_block: { type: 'tool_use', name: 'Bash', input: {} },
				}),
				streamEvent({
					type: 'content_block_delta',
					index: 1,
					delta: { type: 'input_json_delta', partial_json: '{"command":"' },
				}),
				streamEvent({
					type: 'content_block_delta',
					index: 1,
					delta: { type: 'input_json_delta', partial_json: 'ls"}' },
				}),
				streamEvent({ type: 'content_block_stop', index: 1 }),
				resultEvent('ok'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const start = deltas.find(
			(d): d is Extract<StreamDelta, { type: 'tool-use-start' }> =>
				d.type === 'tool-use-start',
		);
		const inputDeltas = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'tool-use-input-delta' }> =>
				d.type === 'tool-use-input-delta',
		);
		const stops = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'tool-use-stop' }> => d.type === 'tool-use-stop',
		);
		expect(start).toBeDefined();
		expect(start!.toolName).toBe('Bash');
		expect(inputDeltas).toHaveLength(2);
		expect(inputDeltas[0].blockId).toBe(start!.blockId);
		expect(inputDeltas[0].inputJson).toBe('{"command":"');
		expect(inputDeltas[1].inputJson).toBe('ls"}');
		expect(stops).toHaveLength(1);
		expect(stops[0].blockId).toBe(start!.blockId);
	});

	it('emits a `compact-boundary` delta on a system compact_boundary event', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				{ type: 'system', subtype: 'compact_boundary', reason: 'token_budget' },
				resultEvent('ok'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const compacts = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'compact-boundary' }> =>
				d.type === 'compact-boundary',
		);
		expect(compacts).toHaveLength(1);
		expect(compacts[0].reason).toBe('token_budget');
	});

	it('emits a `usage` delta on a message_start frame carrying usage', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				streamEvent({
					type: 'message_start',
					message: { usage: { input_tokens: 11, output_tokens: 22 } },
				}),
				resultEvent('ok'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const usages = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'usage' }> => d.type === 'usage',
		);
		expect(usages).toHaveLength(1);
		expect(usages[0].inputTokens).toBe(11);
		expect(usages[0].outputTokens).toBe(22);
	});

	it('emits a `usage` delta on a message_delta frame with outer usage', async () => {
		const { adapter, spawn } = await makeAdapter();
		const collected = collect(adapter.queryStream('hi'));
		await Promise.resolve();
		const child = spawn.lastChild();

		spawn.emitStdout(
			child,
			ndjson(
				streamEvent({
					type: 'message_delta',
					usage: { input_tokens: 1, output_tokens: 99 },
				}),
				resultEvent('ok'),
			),
		);
		spawn.closeWith(child, 0);

		const deltas = await collected;
		const usages = deltas.filter(
			(d): d is Extract<StreamDelta, { type: 'usage' }> => d.type === 'usage',
		);
		expect(usages).toHaveLength(1);
		expect(usages[0].outputTokens).toBe(99);
	});
});
