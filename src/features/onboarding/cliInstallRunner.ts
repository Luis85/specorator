import { spawn } from 'child_process';

import { buildFullSubprocessEnvironment } from '@/core/providers/subprocessEnvironmentAllowlist';
import type { ProviderCliInstallMethod } from '@/core/providers/types';
import { executableCandidateNames, findBinaryOnPath } from '@/utils/cliBinaryLocator';
import { getEnhancedPath } from '@/utils/env';
import { forceKillProcessGroup } from '@/utils/processKill';
import { wrapWindowsCmdShim } from '@/utils/windowsSpawn';

/** Hard stop for a hung package manager. Global npm installs are slow, not eternal. */
export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * How long an abort waits for the killed child to actually disappear before
 * answering anyway. SIGKILL is uncatchable, so this only covers a process stuck
 * in uninterruptible sleep — the UI must not hang on one.
 */
export const ABORT_REAP_GRACE_MS = 2_000;
/** Output lines retained for the console. Bounded so a chatty installer can't grow memory. */
export const INSTALL_OUTPUT_LINE_CAP = 400;

export interface CliInstallEvents {
  /** One chunk of installer output (stdout and stderr interleaved, as the user would see it). */
  onOutput(text: string): void;
}

export interface CliInstallResult {
  ok: boolean;
  exitCode: number | null;
  /** Set when the run never produced an exit code (spawn failure, timeout, cancel). */
  error?: string;
  cancelled?: boolean;
}

export interface CliInstallHandle {
  /** Resolves once the child exits, is cancelled, or fails to spawn. Never rejects. */
  readonly done: Promise<CliInstallResult>;
  cancel(): void;
}

/** Windows refuses to spawn `.cmd`/`.bat` shims without a shell (CVE-2024-27980 fix). */
function isWindowsBatchShim(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

/**
 * Resolves a package-manager command to a real binary on the enhanced PATH.
 * A GUI-launched Obsidian does not inherit the shell's PATH, so bare `npm`
 * frequently fails to spawn even when a terminal finds it instantly.
 */
function resolveInstallCommand(command: string): string | null {
  // findBinaryOnPath scans the same enhanced PATH the child is given below.
  // Windows candidates exclude the extensionless sh shim npm installs beside
  // `npm.cmd`: it resolves first by name but cannot be executed, and
  // `isWindowsBatchShim` would not wrap it, so the install would just fail.
  return findBinaryOnPath(executableCandidateNames(command));
}

/**
 * Spawns a provider-declared CLI install command and streams its output.
 *
 * The security model is the `argv` shape, not sanitization: `command` and `args`
 * come from a provider's static `cliInstall` registration and are passed to
 * `spawn` with **no shell** (`shell` is never set), so there is no command
 * string for anything to be interpolated into. A method whose real install
 * needs a shell declares `argv: null` and is rejected here rather than being
 * quietly upgraded to a shell execution.
 */
export function runCliInstall(
  method: ProviderCliInstallMethod,
  events: CliInstallEvents,
): CliInstallHandle {
  if (!method.argv) {
    return {
      done: Promise.resolve({
        ok: false,
        exitCode: null,
        error: `Install method "${method.id}" must be run manually.`,
      }),
      cancel: () => {},
    };
  }

  const enhancedPath = getEnhancedPath();
  const resolvedCommand = resolveInstallCommand(method.argv.command);
  if (!resolvedCommand) {
    return {
      done: Promise.resolve({
        ok: false,
        exitCode: null,
        error: `"${method.argv.command}" was not found on PATH.`,
      }),
      cancel: () => {},
    };
  }

  const args = [...method.argv.args];
  const spawnPlan = isWindowsBatchShim(resolvedCommand)
    ? wrapWindowsCmdShim(resolvedCommand, args)
    : { command: resolvedCommand, args, windowsVerbatimArguments: undefined };

  const child = spawn(spawnPlan.command, spawnPlan.args, {
    env: buildFullSubprocessEnvironment({
      processEnv: process.env,
      customEnv: {},
      pathOverride: enhancedPath,
    }),
    windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments,
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX: lead a process group so the teardown below can reap the whole tree.
    // A package manager forks freely (lifecycle scripts, node-gyp), and a
    // child-only SIGKILL would orphan those to init — they would keep installing
    // after the user pressed Cancel. Skipped on Windows, where `detached` spawns
    // a console window and `taskkill /T` walks the tree anyway.
    detached: process.platform !== 'win32',
  });

  let settled = false;
  /** Set before the kill so `close` reports the abort, not a bare exit code. */
  let abortReason: 'cancelled' | 'timeout' | null = null;
  let resolveDone: (result: CliInstallResult) => void = () => {};
  const done = new Promise<CliInstallResult>((resolve) => {
    resolveDone = resolve;
  });
  /** Resolves when the direct child is actually gone, whatever ended it. */
  let markChildClosed: () => void = () => {};
  const childClosed = new Promise<void>((resolve) => { markChildClosed = resolve; });

  const settle = (result: CliInstallResult): void => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    resolveDone(result);
  };

  const abortResult = (): CliInstallResult => (
    abortReason === 'timeout'
      ? {
        ok: false,
        exitCode: null,
        error: `Install timed out after ${INSTALL_TIMEOUT_MS / 60_000} minutes.`,
      }
      : { ok: false, exitCode: null, cancelled: true }
  );

  /**
   * Reaps the whole tree, waits for the child to actually be gone, THEN settles.
   * Settling earlier would report the install stopped while npm was still
   * writing to the global prefix — and free the caller to start another one on
   * top of it. `forceKillProcessGroup` signals the POSIX group / `taskkill /T
   * /F`s the Windows tree, so the `cmd.exe` wrapper can't survive as a live npm
   * underneath a dead shim.
   *
   * The extra wait is because the POSIX half only SIGNALS: `process.kill(-pid)`
   * returns as soon as the signal is queued, not when the group is gone. The
   * child's own `close` is the observable end (Windows `taskkill` already waits,
   * so there it has normally fired by now). Bounded, because a process wedged in
   * uninterruptible sleep must not hang the UI — after that the user gets their
   * answer and SIGKILL finishes the job regardless.
   */
  const abort = async (reason: 'cancelled' | 'timeout'): Promise<void> => {
    if (settled || abortReason) return;
    abortReason = reason;
    await forceKillProcessGroup(child);
    let graceTimer: number | undefined;
    await Promise.race([
      childClosed,
      new Promise<void>((resolve) => {
        graceTimer = window.setTimeout(resolve, ABORT_REAP_GRACE_MS);
      }),
    ]);
    // Whichever won, the loser must not leave a timer pending.
    if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    settle(abortResult());
  };

  const timeout = window.setTimeout(() => { void abort('timeout'); }, INSTALL_TIMEOUT_MS);

  child.stdout?.on('data', (chunk: Buffer | string) => events.onOutput(String(chunk)));
  child.stderr?.on('data', (chunk: Buffer | string) => events.onOutput(String(chunk)));
  child.on('error', (error: Error) => {
    settle({ ok: false, exitCode: null, error: error.message });
  });
  child.on('close', (code: number | null) => {
    markChildClosed();
    // While aborting, `abort()` owns settlement — it settles only once the reaper
    // has resolved. The direct child can close FIRST: on Windows it is the
    // `cmd.exe` wrapper, which dies while `taskkill /T /F` is still walking the
    // descendants, and on POSIX the group leader can exit while its forks are
    // still being signalled. Settling here would report the install stopped with
    // npm still writing to the global prefix — and free the store to start
    // another one on top of it.
    if (abortReason) return;
    settle({ ok: code === 0, exitCode: code });
  });

  return {
    done,
    cancel: () => { void abort('cancelled'); },
  };
}

/**
 * Appends installer output to a bounded line buffer, returning the new buffer.
 * Keeps the tail (what a user watches) and drops the head once the cap is hit.
 */
export function appendInstallOutput(lines: readonly string[], text: string): string[] {
  const incoming = text.split(/\r?\n/);
  const next = [...lines];

  // A chunk boundary can land mid-line, so the first incoming segment continues
  // the last retained line instead of starting a new one.
  const [first, ...rest] = incoming;
  if (next.length > 0 && first !== undefined) {
    next[next.length - 1] = `${next[next.length - 1]}${first}`;
  } else if (first !== undefined) {
    next.push(first);
  }
  next.push(...rest);

  return next.length > INSTALL_OUTPUT_LINE_CAP
    ? next.slice(next.length - INSTALL_OUTPUT_LINE_CAP)
    : next;
}

/** Install methods applicable to the current platform, in declaration order. */
export function platformInstallMethods(
  methods: readonly ProviderCliInstallMethod[],
  platform: NodeJS.Platform = process.platform,
): ProviderCliInstallMethod[] {
  return methods.filter((method) => !method.platforms || method.platforms.includes(platform));
}
