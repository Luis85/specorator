/**
 * WP-11 — `SubprocessLifecycle`: owns spawn / kill / shutdown coordination
 * for the user-installed `claude` binary. Extracted from
 * `ClaudeSubprocessAdapter` (Arch review #11) so the adapter no longer mixes
 * I/O lifecycle with wire-format translation and the codec seam.
 *
 * Responsibilities:
 *   - spawn the child with a stable stdio shape and add it to an in-flight
 *     registry so `shutdownAll()` can SIGTERM any subprocess mid-response;
 *   - SIGTERM → SIGKILL ladder with a fixed `SIGKILL_GRACE_MS = 200` window
 *     (SPEC-ASM-001 §4.3) and a non-blocking `unref()`ed timer;
 *   - never throw across module boundaries — `spawn()` returns
 *     `Result<ChildProcessLike, ChatTransportError>` (ADR-004).
 *
 * Not responsible for:
 *   - argv construction (lives in `buildSubprocessArgs.ts`);
 *   - NDJSON line reassembly (lives in `NdjsonChannel.ts`);
 *   - structured-output collection (lives in `runSubprocessStructured.ts`);
 *   - per-turn timeouts / abort wiring (lives on the adapter facade —
 *     they are per-call concerns, not subprocess-lifecycle ones).
 *
 * Satisfies REQ-ASM-009 (graceful degradation) and the SPEC §4.3 SIGKILL
 * ladder contract.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import { ChatTransportError } from '@/domain/ports/ChatTransportPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import { err, ok, type Result } from '@/domain/shared/Result';

/**
 * Minimal child-process surface — kept loose so the tests' EventEmitter-based
 * fake satisfies it without coercion to the full `ChildProcess` type.
 */
export interface ChildProcessLike {
	readonly stdout: NodeJS.EventEmitter | null;
	readonly stderr: NodeJS.EventEmitter | null;
	readonly stdin?: { write: (chunk: string) => unknown; end: () => unknown } | null;
	kill: (signal?: number | string) => unknown;
	on(event: string, listener: (...args: unknown[]) => void): unknown;
	once?(event: string, listener: (...args: unknown[]) => void): unknown;
	removeAllListeners?(event?: string): unknown;
	killed?: boolean;
	exitCode?: number | null;
}

/** Injectable spawn signature — structurally compatible with `child_process.spawn`. */
export type SpawnFn = (
	command: string,
	args: readonly string[],
	options?: SpawnOptions,
) => ChildProcess;

/** SPEC §4.3 — SIGTERM → SIGKILL grace window in milliseconds. */
export const SIGKILL_GRACE_MS = 200;

export interface SubprocessLifecycleDeps {
	readonly spawn: SpawnFn;
	readonly logger: LoggerPort;
}

/**
 * Lifecycle manager for short-lived `claude` subprocesses.
 *
 * A single instance is shared across `queryStream()` and `runStructured()` so
 * `shutdownAll()` reaches every in-flight child regardless of which path
 * spawned it.
 */
export class SubprocessLifecycle {
	private readonly _spawn: SpawnFn;
	private readonly _logger: LoggerPort;
	private readonly _activeChildren = new Set<ChildProcessLike>();
	private _shutdownCalled = false;

	constructor(deps: SubprocessLifecycleDeps) {
		this._spawn = deps.spawn;
		this._logger = deps.logger;
	}

	/**
	 * Spawn a fresh subprocess and register it in the active set. Synchronous
	 * spawn throws (ENOENT / EACCES) collapse into a typed `CLI_LAUNCH_FAILED`
	 * Result so the caller never has to wrap the call in `try/catch`.
	 *
	 * `event` distinguishes the telemetry log between the streaming and
	 * structured paths (NFR-ASM-005 — never include the binary path).
	 */
	spawn(
		binaryPath: string,
		argv: readonly string[],
		event: 'spawn.failed' | 'structured.spawn_failed' = 'spawn.failed',
	): Result<ChildProcessLike, ChatTransportError> {
		let child: ChildProcess;
		try {
			// stdin must NOT be a pipe: Claude CLI v2.x with -p holds the
			// process open until stdin EOF when stdin is a pipe, manifesting
			// as a TIMEOUT verdict on the renderer side. We never write to
			// stdin in this code path — the prompt is in argv.
			child = this._spawn(binaryPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
		} catch (e: unknown) {
			const code = (e as NodeJS.ErrnoException | undefined)?.code;
			// Preserve the dotted event-key format so dashboards / alerts keyed
			// on the prior `subscription.spawn.failed` / `subscription.structured.spawn_failed`
			// names continue to match. Do NOT collapse dots into underscores.
			this._logger.warn(`subscription.${event}`, {
				transport: 'subscription',
				event,
				code: code ?? null,
			});
			return err(
				new ChatTransportError('CLI_LAUNCH_FAILED', 'Failed to spawn Claude CLI subprocess', e),
			);
		}

		const childLike = child as unknown as ChildProcessLike;
		if (childLike.stdout === null) {
			return err(
				new ChatTransportError('CLI_LAUNCH_FAILED', 'Spawned Claude CLI subprocess has no stdout'),
			);
		}

		this._activeChildren.add(childLike);
		return ok(childLike);
	}

	/**
	 * SPEC §4.3 — SIGTERM, then SIGKILL after `SIGKILL_GRACE_MS`. The ladder
	 * timer is `unref()`ed so it never holds the event loop open. Idempotent
	 * and never throws.
	 */
	kill(child: ChildProcessLike): void {
		try {
			child.kill('SIGTERM');
		} catch {
			// Ignore — child may already be gone.
		}
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
		const ladder = setTimeout(() => {
			if (child.killed === true) return;
			try {
				child.kill('SIGKILL');
			} catch {
				// Ignore.
			}
		}, SIGKILL_GRACE_MS);
		if (typeof (ladder as { unref?: () => void }).unref === 'function') {
			(ladder as { unref: () => void }).unref();
		}
	}

	/** Remove a child from the active set without sending any signal. */
	release(child: ChildProcessLike): void {
		this._activeChildren.delete(child);
	}

	/** True iff `shutdownAll()` has been called at least once. */
	get shuttingDown(): boolean {
		return this._shutdownCalled;
	}

	/**
	 * Synchronous SIGTERM ladder over every in-flight child. Idempotent and
	 * safe to call from teardown. Never throws.
	 */
	shutdownAll(): void {
		if (this._shutdownCalled) return;
		this._shutdownCalled = true;
		for (const child of this._activeChildren) {
			this.kill(child);
		}
		this._activeChildren.clear();
	}
}
