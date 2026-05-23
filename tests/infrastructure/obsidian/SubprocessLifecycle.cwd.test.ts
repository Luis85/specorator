/**
 * QW-A — vault root as `cwd` for the Claude/Cursor CLI subprocesses.
 *
 * Asserts that `SubprocessLifecycle.spawn()` forwards an optional `cwd`
 * argument to the underlying spawn function. Without this, the child
 * inherits Obsidian's renderer cwd (typically a path under the Obsidian
 * install dir) and relative paths emitted by agent tool calls resolve
 * outside the user's vault.
 *
 * Covers:
 *   - cwd passed through to spawn opts when provided;
 *   - cwd absent from opts when omitted (preserves stdio shape);
 *   - cwd absent from opts when explicitly `undefined`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import type { LoggerPort } from '@/domain/ports/LoggerPort';
import { SubprocessLifecycle } from '@/infrastructure/obsidian/SubprocessLifecycle';

interface FakeChild extends EventEmitter {
	stdout: EventEmitter | null;
	stderr: EventEmitter;
	stdin: { write: (chunk: string) => unknown; end: () => unknown };
	kill: (signal?: string | number) => unknown;
	killed: boolean;
	exitCode: number | null;
}

function makeChild(): FakeChild {
	return Object.assign(new EventEmitter(), {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		stdin: {
			write: (_chunk: string): unknown => undefined,
			end: (): unknown => undefined,
		},
		kill: vi.fn<(signal?: string | number) => unknown>(() => true),
		killed: false,
		exitCode: null,
	}) as FakeChild;
}

function makeLogger(): LoggerPort {
	return {
		debug: vi.fn<LoggerPort['debug']>(),
		info: vi.fn<LoggerPort['info']>(),
		warn: vi.fn<LoggerPort['warn']>(),
		error: vi.fn<LoggerPort['error']>(),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('SubprocessLifecycle — cwd plumbing (QW-A)', () => {
	it('forwards the provided cwd to spawn opts alongside the stdio shape', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', ['-p', 'hi'], 'spawn.failed', '/fake/vault');
		expect(result.ok).toBe(true);
		expect(spawnFn).toHaveBeenCalledWith('/fake/bin/claude', ['-p', 'hi'], {
			stdio: ['ignore', 'pipe', 'pipe'],
			cwd: '/fake/vault',
		});
	});

	it('omits cwd from spawn opts when the argument is undefined', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', ['-p', 'hi'], 'spawn.failed', undefined);
		expect(result.ok).toBe(true);
		expect(spawnFn).toHaveBeenCalledWith('/fake/bin/claude', ['-p', 'hi'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	});

	it('omits cwd from spawn opts when no fourth argument is supplied', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', ['-p', 'hi']);
		expect(result.ok).toBe(true);
		expect(spawnFn).toHaveBeenCalledWith('/fake/bin/claude', ['-p', 'hi'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	});

	it('treats null cwd as "no cwd" (LocalStorageBridge surface)', () => {
		const child = makeChild();
		const spawnFn = vi.fn(() => child);
		const lifecycle = new SubprocessLifecycle({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			spawn: spawnFn as any,
			logger: makeLogger(),
		});

		const result = lifecycle.spawn('/fake/bin/claude', [], 'spawn.failed', null);
		expect(result.ok).toBe(true);
		expect(spawnFn).toHaveBeenCalledWith('/fake/bin/claude', [], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	});
});
