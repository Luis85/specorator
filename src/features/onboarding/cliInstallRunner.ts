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
/**
 * Carried on an abort whose process tree was never observed to exit. The install
 * is over as far as this handle is concerned, but the descendants may not be, and
 * the user is about to be offered the Install button again.
 */
export const UNCONFIRMED_TEARDOWN_ERROR =
  'Stopped the installer, but could not confirm its process tree exited. '
  + 'Check for a running install before starting another.';
/** Output lines retained for the console. Bounded so a chatty installer can't grow memory. */
export const INSTALL_OUTPUT_LINE_CAP = 400;
/**
 * Characters retained per line. The line cap bounds the buffer only if lines are
 * themselves bounded — a stream with no newline at all is otherwise ONE line that
 * grows for the whole run, and every chunk copies it.
 */
export const INSTALL_OUTPUT_LINE_CHARS = 2_000;

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
   *
   * The grace covers the REAPER as well as the wait, and is armed before it: on
   * Windows the reaper is itself a spawned `taskkill /T /F`, which can walk a
   * large installer tree without ever emitting `close`. Timing only the wait
   * would leave both Cancel and the 10-minute timeout pending forever on exactly
   * that failure.
   *
   * When the grace wins, the tree-wide contract still stands, so the fallback
   * ESCALATES rather than downgrading to the direct child: a second tree kill is
   * fired (unawaited, so a hung reaper cannot wedge the UI twice) alongside a
   * direct signal that at least takes out the `cmd.exe` wrapper. What cannot be
   * done is claim the tree is gone — nothing observed it exit — so that run
   * settles carrying an explicit warning instead of a clean stop, because the
   * store re-arms Install the moment it settles and a second `npm i -g` on top
   * of a live one is exactly what the warning is for.
   */
  const abort = async (reason: 'cancelled' | 'timeout'): Promise<void> => {
    if (settled || abortReason) return;
    abortReason = reason;

    let graceTimer: number | undefined;
    let graceExpired = false;
    const grace = new Promise<void>((resolve) => {
      graceTimer = window.setTimeout(() => {
        graceExpired = true;
        resolve();
      }, ABORT_REAP_GRACE_MS);
    });

    await Promise.race([
      forceKillProcessGroup(child).then(() => childClosed),
      grace,
    ]);
    // Whichever won, the loser must not leave a timer pending.
    if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    if (!graceExpired) {
      settle(abortResult());
      return;
    }

    void forceKillProcessGroup(child);
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone, or not killable — the answer below is owed either way.
    }
    settle({ ...abortResult(), error: UNCONFIRMED_TEARDOWN_ERROR });
  };

  const timeout = window.setTimeout(() => { void abort('timeout'); }, INSTALL_TIMEOUT_MS);

  child.stdout?.on('data', (chunk: Buffer | string) => events.onOutput(String(chunk)));
  child.stderr?.on('data', (chunk: Buffer | string) => events.onOutput(String(chunk)));
  child.on('error', (error: Error) => {
    // Same yield as `close` below: once an abort has started it owns settlement.
    // An `error` raised by the abort's own `child.kill()` — a failed Windows
    // taskkill, a process that no longer exists — would otherwise settle here
    // while the reaper is still running, releasing the install lock early and
    // reporting a clean stop with the unconfirmed-teardown warning dropped.
    if (abortReason) return;
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
 *
 * Bounded in BOTH directions, because the line cap alone bounds nothing: output
 * that never emits `\n` — a bare `\r` progress bar, a chatty lifecycle script —
 * lands entirely on the one retained last line, which every later chunk then
 * copies and re-renders for the full ten-minute run. A lone `\r` is a line
 * boundary here (it is what redraws a terminal line, so the ring keeps the last
 * frames rather than one string of all of them), and any single line is capped
 * at `INSTALL_OUTPUT_LINE_CHARS`.
 */
export function appendInstallOutput(lines: readonly string[], text: string): string[] {
  const incoming = text.split(/\r\n|\r|\n/);
  const next = [...lines];

  // A chunk boundary can land mid-line, so the first incoming segment continues
  // the last retained line instead of starting a new one.
  const [first, ...rest] = incoming;
  if (next.length > 0 && first !== undefined) {
    next[next.length - 1] = capLine(`${next[next.length - 1]}${first}`);
  } else if (first !== undefined) {
    next.push(capLine(first));
  }
  next.push(...rest.map(capLine));

  return next.length > INSTALL_OUTPUT_LINE_CAP
    ? next.slice(next.length - INSTALL_OUTPUT_LINE_CAP)
    : next;
}

/** Keeps the tail of an over-long line — the end is where a progress bar's state is. */
function capLine(line: string): string {
  return line.length > INSTALL_OUTPUT_LINE_CHARS
    ? line.slice(line.length - INSTALL_OUTPUT_LINE_CHARS)
    : line;
}

/** Install methods applicable to the current platform, in declaration order. */
export function platformInstallMethods(
  methods: readonly ProviderCliInstallMethod[],
  platform: NodeJS.Platform = process.platform,
): ProviderCliInstallMethod[] {
  return methods.filter((method) => !method.platforms || method.platforms.includes(platform));
}
