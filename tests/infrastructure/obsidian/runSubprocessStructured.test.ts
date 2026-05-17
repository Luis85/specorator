/**
 * WP-11 — Mirror tests for `runSubprocessStructured`.
 *
 * Behaviours covered:
 *   - Happy path: parses `result` + `structured_output` from stdout JSON;
 *   - Captures top-level `session_id` and invokes `options.onSessionId`;
 *   - `onSessionId` callback throws are isolated;
 *   - Non-zero exit → `QUERY_FAILED`;
 *   - Empty stdout → `QUERY_FAILED`;
 *   - Invalid JSON → `QUERY_FAILED` with a redacted logger.warn;
 *   - Non-object JSON → `QUERY_FAILED`;
 *   - Timeout → kills the child + `TIMEOUT`;
 *   - `child.on('error', ...)` before close → `CLI_LAUNCH_FAILED`;
 *   - Unavailable binary path → `CLI_LAUNCH_FAILED`.
 *
 * Coverage target per brief: ≥ 90% statements, ≥ 80% branches.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import type { LoggerPort } from '@/domain/ports/LoggerPort';
import { runSubprocessStructured } from '@/infrastructure/obsidian/runSubprocessStructured';
import { SubprocessLifecycle } from '@/infrastructure/obsidian/SubprocessLifecycle';

interface FakeChild extends EventEmitter {
	stdout: EventEmitter | null;
	stderr: EventEmitter;
	stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
	exitCode: number | null;
}

function makeChild(): FakeChild {
	return Object.assign(new EventEmitter(), {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		stdin: { write: vi.fn(), end: vi.fn() },
		kill: vi.fn(function (this: FakeChild) {
			this.killed = true;
		}),
		killed: false,
		exitCode: null,
	}) as FakeChild;
}

function makeLogger(): LoggerPort & { entries: Array<{ message: string; ctx?: unknown }> } {
	const entries: Array<{ message: string; ctx?: unknown }> = [];
	return {
		entries,
		debug: (m, c) => entries.push({ message: m, ctx: c }),
		info: (m, c) => entries.push({ message: m, ctx: c }),
		warn: (m, c) => entries.push({ message: m, ctx: c }),
		error: (m, _e, c) => entries.push({ message: m, ctx: c }),
	};
}

function makeDeps(spawnFn: ReturnType<typeof vi.fn>, telemetryCalls: unknown[] = []) {
	const logger = makeLogger();
	const lifecycle = new SubprocessLifecycle({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		spawn: spawnFn as any,
		logger,
	});
	return {
		deps: {
			lifecycle,
			logger,
			clampTimeout: (raw: number | undefined) =>
				Math.min(Math.max(raw ?? 30_000, 1_000), 300_000),
			emitCompletionTelemetry: (args: unknown) => {
				telemetryCalls.push(args);
			},
		},
		logger,
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('runSubprocessStructured — happy path', () => {
	it('parses result + structured_output from stdout JSON', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const body = JSON.stringify({
			result: 'ok',
			structured_output: { action: 'createFile', path: 'p.md' },
		});

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'prompt', {});
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from(body, 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});

		const result = await promise;
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.result).toBe('ok');
			expect(result.value.structured_output).toEqual({ action: 'createFile', path: 'p.md' });
		}
	});

	it('captures session_id and invokes options.onSessionId before resolving', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const body = JSON.stringify({
			result: 'ok',
			structured_output: {},
			session_id: '11111111-2222-3333-4444-555555555555',
		});

		const onSessionId = vi.fn();
		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', { onSessionId });
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from(body, 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		await promise;

		expect(onSessionId).toHaveBeenCalledTimes(1);
		expect(onSessionId).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
	});

	it('isolates onSessionId throws so the structured result still resolves', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const body = JSON.stringify({
			result: 'ok',
			structured_output: {},
			session_id: 'sess-x',
		});
		const onSessionId = vi.fn(() => {
			throw new Error('caller bug');
		});

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', { onSessionId });
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from(body, 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		const result = await promise;
		expect(result.ok).toBe(true);
		expect(onSessionId).toHaveBeenCalledTimes(1);
	});

	it('skips session_id capture when stdout has no session_id field', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const onSessionId = vi.fn();
		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', { onSessionId });
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from(JSON.stringify({ result: 'ok', structured_output: {} }), 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		await promise;
		expect(onSessionId).not.toHaveBeenCalled();
	});
});

describe('runSubprocessStructured — failure paths', () => {
	it('binary path null → CLI_LAUNCH_FAILED without spawning', async () => {
		const spawnFn = vi.fn();
		const { deps } = makeDeps(spawnFn);
		const result = await runSubprocessStructured(deps, null, 'p', {});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED');
		expect(spawnFn).not.toHaveBeenCalled();
	});

	it('non-zero exit → QUERY_FAILED', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', {});
		queueMicrotask(() => {
			child.exitCode = 1;
			child.emit('close', 1, null);
		});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('QUERY_FAILED');
	});

	it('empty stdout → QUERY_FAILED', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', {});
		queueMicrotask(() => {
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('QUERY_FAILED');
	});

	it('invalid JSON stdout → QUERY_FAILED with redacted logger.warn', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps, logger } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'SECRET-prompt', {});
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from('{ not json', 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('QUERY_FAILED');

		// logger.warn fired but never carries the prompt or stdout body.
		const warnEntry = logger.entries.find((e) => e.message === 'subscription.structured.stdout_invalid_json');
		expect(warnEntry).toBeDefined();
		expect(JSON.stringify(warnEntry!.ctx)).not.toContain('SECRET-prompt');
		expect(JSON.stringify(warnEntry!.ctx)).not.toContain('not json');
	});

	it('non-object JSON → QUERY_FAILED', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', {});
		queueMicrotask(() => {
			child.stdout!.emit('data', Buffer.from(JSON.stringify(42), 'utf8'));
			child.exitCode = 0;
			child.emit('close', 0, null);
		});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('QUERY_FAILED');
	});

	it('timeout → kills the child and resolves with TIMEOUT', async () => {
		vi.useFakeTimers();
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', {
			timeoutMs: 1_500,
		});
		await vi.advanceTimersByTimeAsync(2_000);
		// Close after kill so the promise can settle.
		child.emit('close', null, 'SIGTERM');

		const result = await promise;
		expect(child.kill).toHaveBeenCalled();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('TIMEOUT');
	});

	it('child error before close → CLI_LAUNCH_FAILED', async () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const { deps } = makeDeps(spawnFn);

		const promise = runSubprocessStructured(deps, '/fake/bin/claude', 'p', {});
		queueMicrotask(() => {
			const eacces: NodeJS.ErrnoException = Object.assign(new Error('EACCES'), {
				code: 'EACCES',
			});
			child.emit('error', eacces);
		});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED');
	});

	it('synchronous spawn throw → CLI_LAUNCH_FAILED', async () => {
		const enoent: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), {
			code: 'ENOENT',
		});
		const spawnFn = vi.fn(() => {
			throw enoent;
		});
		const { deps } = makeDeps(spawnFn);

		const result = await runSubprocessStructured(deps, '/fake/bin/claude', 'p', {});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED');
	});
});
