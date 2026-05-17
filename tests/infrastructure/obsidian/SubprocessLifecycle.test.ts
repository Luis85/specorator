/**
 * WP-11 — Mirror tests for `SubprocessLifecycle`.
 *
 * Covers:
 *   - spawn happy path adds the child to the active registry;
 *   - synchronous spawn throw collapses into `CLI_LAUNCH_FAILED` Result;
 *   - missing stdout on the spawned child → `CLI_LAUNCH_FAILED`;
 *   - SIGKILL ladder fires `SIGKILL_GRACE_MS` after `SIGTERM` when the child
 *     does not exit (Testing review F7 — uses `vi.useFakeTimers()`);
 *   - `shutdownAll` is idempotent and SIGTERMs every active child.
 *
 * Coverage target per brief: ≥ 90% statements, ≥ 80% branches.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import type { LoggerPort } from '@/domain/ports/LoggerPort';
import {
	SIGKILL_GRACE_MS,
	SubprocessLifecycle,
} from '@/infrastructure/obsidian/SubprocessLifecycle';

type KillSpy = ((signal?: string | number) => unknown) & { mock: { calls: unknown[][] } };

interface FakeChild extends EventEmitter {
	stdout: EventEmitter | null;
	stderr: EventEmitter;
	stdin: { write: (chunk: string) => unknown; end: () => unknown };
	kill: KillSpy;
	killed: boolean;
	exitCode: number | null;
}

function makeChild(overrides: { stdout?: EventEmitter | null } = {}): FakeChild {
	const stdout = overrides.stdout === undefined ? new EventEmitter() : overrides.stdout;
	const inner = Object.assign(new EventEmitter(), {
		stdout,
		stderr: new EventEmitter(),
		stdin: {
			write: (_chunk: string): unknown => undefined,
			end: (): unknown => undefined,
		},
		kill: vi.fn<(signal?: string | number) => unknown>(function (this: FakeChild) {
			this.killed = true;
			return true;
		}),
		killed: false,
		exitCode: null,
	});
	return inner as FakeChild;
}

interface LoggerFake extends LoggerPort {
	debug: LoggerPort['debug'] & { mock: { calls: unknown[][] } };
	info: LoggerPort['info'] & { mock: { calls: unknown[][] } };
	warn: LoggerPort['warn'] & { mock: { calls: unknown[][] } };
	error: LoggerPort['error'] & { mock: { calls: unknown[][] } };
}

function makeLogger(): LoggerFake {
	return {
		debug: vi.fn<LoggerPort['debug']>(),
		info: vi.fn<LoggerPort['info']>(),
		warn: vi.fn<LoggerPort['warn']>(),
		error: vi.fn<LoggerPort['error']>(),
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('SubprocessLifecycle — spawn', () => {
	it('happy path returns the child and adds it to the active set', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', ['-p', 'hi']);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe(child);
		}
		expect(spawnFn).toHaveBeenCalledWith('/fake/bin/claude', ['-p', 'hi'], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	});

	it('synchronous spawn throw → CLI_LAUNCH_FAILED with logger.warn', () => {
		const enoent: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), {
			code: 'ENOENT',
		});
		const spawnFn = vi.fn(() => {
			throw enoent;
		});
		const logger = makeLogger();
		const lifecycle = new SubprocessLifecycle({
			 
			spawn: spawnFn,
			logger,
		});

		const result = lifecycle.spawn('/fake/bin/claude', []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED');
		}
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('spawn'),
			expect.objectContaining({ transport: 'subscription', code: 'ENOENT' }),
		);
	});

	it('null stdout on the spawned child → CLI_LAUNCH_FAILED', () => {
		const child = makeChild({ stdout: null });
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED');
		}
	});

	it('uses the structured event tag when caller passes structured.spawn_failed', () => {
		const enoent: NodeJS.ErrnoException = Object.assign(new Error('boom'), {
			code: 'EACCES',
		});
		const spawnFn = vi.fn(() => {
			throw enoent;
		});
		const logger = makeLogger();
		const lifecycle = new SubprocessLifecycle({
			 
			spawn: spawnFn,
			logger,
		});

		lifecycle.spawn('/fake/bin/claude', [], 'structured.spawn_failed');
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('structured'),
			expect.objectContaining({ event: 'structured.spawn_failed', code: 'EACCES' }),
		);
	});
});

describe('SubprocessLifecycle — kill (SIGTERM → SIGKILL ladder)', () => {
	it('sends SIGTERM immediately', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});
		const result = lifecycle.spawn('/fake/bin/claude', []);
		expect(result.ok).toBe(true);

		lifecycle.kill(child);
		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
	});

	it('SIGKILL fires SIGKILL_GRACE_MS after SIGTERM when the child does not exit (Testing F7)', () => {
		vi.useFakeTimers();
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});
		lifecycle.spawn('/fake/bin/claude', []);

		// Override `kill` to simulate "SIGTERM was a no-op — the child is hung".
		child.kill = vi.fn<(signal?: string | number) => unknown>(() => true);
		child.killed = false;

		lifecycle.kill(child);
		expect(child.kill).toHaveBeenCalledWith('SIGTERM');

		// Advance just before the grace window — still only the SIGTERM call.
		vi.advanceTimersByTime(SIGKILL_GRACE_MS - 1);
		expect(child.kill).toHaveBeenCalledTimes(1);

		// Cross the grace window — SIGKILL must follow.
		vi.advanceTimersByTime(2);
		expect(child.kill).toHaveBeenCalledWith('SIGKILL');
		expect(child.kill).toHaveBeenCalledTimes(2);
	});

	it('SIGKILL is suppressed when the child already exited inside the grace window', () => {
		vi.useFakeTimers();
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});
		lifecycle.spawn('/fake/bin/claude', []);

		lifecycle.kill(child);
		// Simulate child exit inside the grace window.
		child.killed = true;

		vi.advanceTimersByTime(SIGKILL_GRACE_MS + 10);
		// Only the initial SIGTERM should have fired.
		expect(child.kill).toHaveBeenCalledTimes(1);
		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
	});

	it('swallows thrown kill errors', () => {
		const child = makeChild();
		child.kill = vi.fn(() => {
			throw new Error('already gone');
		});
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: vi.fn(() => child) as any,
			logger: makeLogger(),
		});
		lifecycle.spawn('/fake/bin/claude', []);

		expect(() => { lifecycle.kill(child); }).not.toThrow();
	});
});

describe('SubprocessLifecycle — release + shutdownAll', () => {
	it('release removes the child from the active set without signalling', () => {
		const child = makeChild();
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: vi.fn(() => child) as any,
			logger: makeLogger(),
		});
		lifecycle.spawn('/fake/bin/claude', []);
		lifecycle.release(child);

		// shutdownAll afterwards must NOT signal the released child.
		lifecycle.shutdownAll();
		expect(child.kill).not.toHaveBeenCalled();
	});

	it('shutdownAll SIGTERMs every in-flight child and is idempotent', () => {
		const a = makeChild();
		const b = makeChild();
		const spawnFn = vi.fn();
		spawnFn.mockReturnValueOnce(a);
		spawnFn.mockReturnValueOnce(b);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});
		lifecycle.spawn('/fake/bin/claude', []);
		lifecycle.spawn('/fake/bin/claude', []);

		expect(lifecycle.shuttingDown).toBe(false);
		lifecycle.shutdownAll();
		expect(lifecycle.shuttingDown).toBe(true);
		expect(a.kill).toHaveBeenCalledWith('SIGTERM');
		expect(b.kill).toHaveBeenCalledWith('SIGTERM');

		// Idempotent.
		expect(() => { lifecycle.shutdownAll(); }).not.toThrow();
		expect(a.kill).toHaveBeenCalledTimes(1);
	});
});
