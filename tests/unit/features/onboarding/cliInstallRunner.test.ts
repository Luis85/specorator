import { EventEmitter } from 'events';

import type { ProviderCliInstallMethod } from '@/core/providers/types';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('@/utils/cliBinaryLocator', () => ({
  findBinaryOnPath: jest.fn(() => '/usr/bin/npm'),
  // Sentinel: the per-platform names are the helper's own contract, tested in
  // tests/unit/utils/cliBinaryLocator.test.ts.
  executableCandidateNames: jest.fn((base: string) => [`${base}.runnable`]),
}));
jest.mock('@/utils/env', () => ({ getEnhancedPath: jest.fn(() => '/enhanced/bin:/usr/bin') }));
jest.mock('@/utils/processKill', () => ({
  forceKillProcessGroup: jest.fn(async () => {}),
}));

import { spawn } from 'child_process';

import {
  ABORT_REAP_GRACE_MS,
  appendInstallOutput,
  INSTALL_OUTPUT_LINE_CAP,
  INSTALL_OUTPUT_LINE_CHARS,
  platformInstallMethods,
  runCliInstall,
  UNCONFIRMED_TEARDOWN_ERROR,
} from '@/features/onboarding/cliInstallRunner';
import { executableCandidateNames, findBinaryOnPath } from '@/utils/cliBinaryLocator';
import { forceKillProcessGroup } from '@/utils/processKill';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): void {
    this.killed = true;
  }
}

const npmMethod: ProviderCliInstallMethod = {
  id: 'npm',
  label: 'npm (global)',
  displayCommand: 'npm install -g @scope/cli',
  argv: { command: 'npm', args: ['install', '-g', '@scope/cli'] },
};

const manualMethod: ProviderCliInstallMethod = {
  id: 'native',
  label: 'Install script',
  displayCommand: 'curl https://example.test/install | bash',
  argv: null,
};

function mountChild(): FakeChild {
  const child = new FakeChild();
  jest.mocked(spawn).mockReturnValue(child as never);
  return child;
}

beforeEach(() => {
  // mockReset, not mockClear: two tests below install a never-resolving
  // implementation to drive the settle ordering, and `mockClear` leaves it in
  // place for every later test — which hangs anything that awaits the reaper.
  jest.mocked(forceKillProcessGroup).mockReset().mockImplementation(async () => {});
  jest.mocked(spawn).mockReset();
  jest.mocked(executableCandidateNames).mockClear();
  jest.mocked(findBinaryOnPath).mockReset();
  jest.mocked(findBinaryOnPath).mockReturnValue('/usr/bin/npm');
});

describe('runCliInstall', () => {
  it('spawns the declared argv with NO shell — the whole point of the argv shape', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 0);
    await handle.done;

    const [command, args, options] = jest.mocked(spawn).mock.calls[0];
    expect(command).toBe('/usr/bin/npm');
    expect(args).toEqual(['install', '-g', '@scope/cli']);
    expect(options).not.toHaveProperty('shell', true);
    expect((options as { shell?: unknown }).shell).toBeUndefined();
  });

  it('gives the child the enhanced PATH (a GUI-launched host has an impoverished one)', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 0);
    await handle.done;

    const options = jest.mocked(spawn).mock.calls[0][2] as { env: Record<string, string> };
    expect(options.env.PATH).toBe('/enhanced/bin:/usr/bin');
  });

  it('refuses a copy-only method instead of upgrading it to a shell run', async () => {
    const result = await runCliInstall(manualMethod, { onOutput: () => {} }).done;

    expect(result.ok).toBe(false);
    expect(result.error).toContain('manually');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fails cleanly when the package manager is not on PATH', async () => {
    jest.mocked(findBinaryOnPath).mockReturnValue(null);

    const result = await runCliInstall(npmMethod, { onOutput: () => {} }).done;

    expect(result.ok).toBe(false);
    expect(result.error).toContain('npm');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('looks the package manager up through the shared executable-candidate names', async () => {
    // Which names are runnable is platform knowledge that already exists for
    // provider detection: on Windows npm ships an sh shim beside `npm.cmd` that
    // resolves first by name but cannot be executed — and the batch-shim check
    // would not wrap it, so the install would fail on a working machine.
    // `executableCandidateNames` owns that (asserted per platform in
    // tests/unit/utils/cliBinaryLocator.test.ts); this pins that the installer
    // goes through it rather than hand-rolling an order.
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 0);
    await handle.done;

    expect(executableCandidateNames).toHaveBeenCalledWith('npm');
    expect(findBinaryOnPath).toHaveBeenCalledWith(['npm.runnable']);
  });

  it('streams stdout and stderr through one output channel', async () => {
    const child = mountChild();
    const chunks: string[] = [];

    const handle = runCliInstall(npmMethod, { onOutput: (text) => chunks.push(text) });
    child.stdout.emit('data', Buffer.from('added 1 package'));
    child.stderr.emit('data', 'npm warn deprecated');
    child.emit('close', 0);
    await handle.done;

    expect(chunks).toEqual(['added 1 package', 'npm warn deprecated']);
  });

  it('reports a non-zero exit as failed with the code', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 7);

    expect(await handle.done).toMatchObject({ ok: false, exitCode: 7 });
  });

  it('resolves (never rejects) on a spawn error', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('error', new Error('EACCES'));

    expect(await handle.done).toMatchObject({ ok: false, error: 'EACCES' });
  });

  it('cancel reaps the whole process tree, not just the direct child', async () => {
    // On Windows the direct child is the `cmd.exe` wrapper; killing only that
    // leaves the real npm (and its lifecycle scripts) installing.
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    child.emit('close', null);

    expect(forceKillProcessGroup).toHaveBeenCalledWith(child);
    expect(await handle.done).toMatchObject({ ok: false, cancelled: true });
  });

  it('leads its own process group on POSIX so the group kill can reap forks', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 0);
    await handle.done;

    const options = jest.mocked(spawn).mock.calls[0][2] as { detached?: boolean };
    expect(options.detached).toBe(process.platform !== 'win32');
  });

  it('settles only after the tree kill resolves', async () => {
    // Settling first would tell the user the install stopped while npm was still
    // writing to the global prefix.
    const order: string[] = [];
    let releaseKill: () => void = () => {};
    jest.mocked(forceKillProcessGroup).mockImplementation(async () => {
      order.push('kill:start');
      await new Promise<void>((resolve) => { releaseKill = () => resolve(); });
      order.push('kill:done');
    });

    const child = mountChild();
    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    void handle.done.then(() => order.push('settled'));
    // Closed already, so nothing but the reaper is holding the settle back.
    child.emit('close', null);

    expect(order).toEqual(['kill:start']);
    releaseKill();
    await handle.done;
    await Promise.resolve();

    expect(order).toEqual(['kill:start', 'kill:done', 'settled']);
  });

  it('does not settle on the child close that races the reaper', async () => {
    // On Windows the direct child is the `cmd.exe` wrapper, which dies while
    // `taskkill /T /F` is still walking the descendants; on POSIX the group
    // leader can exit while its forks are still being signalled. Settling on that
    // close would report the install stopped with npm still writing — and free
    // the store to start another one on top of it.
    const child = mountChild();
    const order: string[] = [];
    let releaseKill: () => void = () => {};
    jest.mocked(forceKillProcessGroup).mockImplementation(async () => {
      await new Promise<void>((resolve) => { releaseKill = () => resolve(); });
      order.push('reaped');
    });

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    void handle.done.then(() => order.push('settled'));

    // The wrapper closes mid-reap.
    child.emit('close', 1);
    await Promise.resolve();
    expect(order).toEqual([]);

    releaseKill();
    await handle.done;
    await Promise.resolve();

    expect(order).toEqual(['reaped', 'settled']);
    expect(await handle.done).toMatchObject({ ok: false, cancelled: true });
  });

  it('waits for the child to actually be gone, since the POSIX kill only signals', async () => {
    // `process.kill(-pid, 'SIGKILL')` returns once the signal is queued, not once
    // the group is reaped, so resolving the reaper is not proof the tree is gone.
    // The child's own `close` is the observable end.
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    let settledEarly = false;
    void handle.done.then(() => { settledEarly = true; });

    await Promise.resolve();
    await Promise.resolve();
    expect(settledEarly).toBe(false);

    child.emit('close', null);

    expect(await handle.done).toMatchObject({ ok: false, cancelled: true });
  });

  it('answers anyway if the child never reports closing', async () => {
    // A process wedged in uninterruptible sleep must not hang the UI: SIGKILL has
    // already been delivered, so the user gets their answer and the kernel
    // finishes the job.
    jest.useFakeTimers();
    try {
      mountChild();
      const handle = runCliInstall(npmMethod, { onOutput: () => {} });
      handle.cancel();

      await jest.advanceTimersByTimeAsync(ABORT_REAP_GRACE_MS);

      expect(await handle.done).toMatchObject({ ok: false, cancelled: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it('answers anyway if the reaper itself never returns', async () => {
    // On Windows the reaper is a spawned `taskkill /T /F`, which can walk a large
    // installer tree without ever emitting `close`. Timing only the wait AFTER it
    // resolved would leave Cancel and the 10-minute timeout pending forever on
    // exactly that failure, with Setup stuck reading "installing".
    jest.useFakeTimers();
    try {
      const child = mountChild();
      jest.mocked(forceKillProcessGroup).mockImplementation(() => new Promise<void>(() => {}));

      const handle = runCliInstall(npmMethod, { onOutput: () => {} });
      handle.cancel();
      await jest.advanceTimersByTimeAsync(ABORT_REAP_GRACE_MS);

      expect(await handle.done).toMatchObject({ ok: false, cancelled: true });
      // The tree walk never answered, so the direct child is signalled too — at
      // least the wrapper dies.
      expect(child.killed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('escalates rather than settling for a child-only kill when the reaper hangs', async () => {
    // Killing only the `cmd.exe` wrapper would leave npm and its lifecycle
    // scripts installing while the store re-arms Install — so the tree-wide
    // teardown is retried (unawaited, so a hung reaper cannot wedge the UI
    // twice), and the result carries a warning instead of reading as a clean stop.
    jest.useFakeTimers();
    try {
      mountChild();
      jest.mocked(forceKillProcessGroup).mockImplementation(() => new Promise<void>(() => {}));

      const handle = runCliInstall(npmMethod, { onOutput: () => {} });
      handle.cancel();
      await jest.advanceTimersByTimeAsync(ABORT_REAP_GRACE_MS);
      const result = await handle.done;

      expect(forceKillProcessGroup).toHaveBeenCalledTimes(2);
      expect(result.error).toBe(UNCONFIRMED_TEARDOWN_ERROR);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a normally reaped cancel carries no warning', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    child.emit('close', null);

    const result = await handle.done;
    expect(result).toMatchObject({ cancelled: true });
    expect(result.error).toBeUndefined();
    expect(forceKillProcessGroup).toHaveBeenCalledTimes(1);
  });

  it('an error raised by the abort\'s own kill does not settle ahead of the reaper', async () => {
    // `close` already yields to the abort; this parallel terminal handler must
    // too. A failed Windows taskkill fallback can raise `error` from
    // `child.kill()` while the reaper is still walking the tree — settling here
    // would free the install lock early and report a clean stop, dropping the
    // unconfirmed-teardown warning the abort is about to attach.
    jest.useFakeTimers();
    try {
      const child = mountChild();
      jest.mocked(forceKillProcessGroup).mockImplementation(() => new Promise<void>(() => {}));

      const handle = runCliInstall(npmMethod, { onOutput: () => {} });
      handle.cancel();
      child.emit('error', new Error('taskkill failed'));

      let settledEarly = false;
      void handle.done.then(() => { settledEarly = true; });
      await Promise.resolve();
      expect(settledEarly).toBe(false);

      await jest.advanceTimersByTimeAsync(ABORT_REAP_GRACE_MS);

      expect(await handle.done).toMatchObject({
        cancelled: true,
        error: UNCONFIRMED_TEARDOWN_ERROR,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a spawn error before any abort still settles normally', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('error', new Error('ENOENT'));

    expect(await handle.done).toMatchObject({ ok: false, error: 'ENOENT' });
  });

  it('a cancel after settling is a no-op', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('close', 0);
    await handle.done;
    handle.cancel();

    expect(forceKillProcessGroup).not.toHaveBeenCalled();
  });

  it('settles exactly once — a late close after an error cannot re-resolve', async () => {
    const child = mountChild();

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    child.emit('error', new Error('first'));
    child.emit('close', 0);

    expect(await handle.done).toMatchObject({ ok: false, error: 'first' });
  });
});

describe('appendInstallOutput', () => {
  it('continues the last retained line when a chunk splits mid-line', () => {
    const lines = appendInstallOutput(appendInstallOutput([], 'added 1 pac'), 'kage\n');
    expect(lines[0]).toBe('added 1 package');
  });

  it('splits on newlines', () => {
    expect(appendInstallOutput([], 'a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('treats a lone carriage return as a line boundary', () => {
    // A terminal progress bar redraws with `\r`, never `\n`. Folding those into
    // one line makes the "400-line ring" a single string that grows for the whole
    // run, and every later chunk copies and re-renders it.
    expect(appendInstallOutput([], '10%\r50%\r100%')).toEqual(['10%', '50%', '100%']);
  });

  it('caps a single line, so output with no newline at all stays bounded', () => {
    let lines: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      lines = appendInstallOutput(lines, 'x'.repeat(500));
    }

    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe(INSTALL_OUTPUT_LINE_CHARS);
  });

  it('keeps the END of an over-long line, where a progress bar\'s state is', () => {
    const lines = appendInstallOutput([], `${'a'.repeat(INSTALL_OUTPUT_LINE_CHARS)}TAIL`);

    expect(lines[0].endsWith('TAIL')).toBe(true);
    expect(lines[0].length).toBe(INSTALL_OUTPUT_LINE_CHARS);
  });

  it('keeps the tail once the cap is reached so memory stays flat', () => {
    let lines: string[] = [];
    for (let i = 0; i < INSTALL_OUTPUT_LINE_CAP + 50; i += 1) {
      lines = appendInstallOutput(lines, `line ${i}\n`);
    }

    expect(lines.length).toBeLessThanOrEqual(INSTALL_OUTPUT_LINE_CAP);
    expect(lines[lines.length - 1]).toBe('');
    expect(lines[lines.length - 2]).toBe(`line ${INSTALL_OUTPUT_LINE_CAP + 49}`);
  });
});

describe('platformInstallMethods', () => {
  const methods: ProviderCliInstallMethod[] = [
    { ...npmMethod },
    { ...manualMethod, platforms: ['win32'] },
    { ...manualMethod, id: 'nix', platforms: ['darwin', 'linux'] },
  ];

  it('keeps platform-agnostic methods and only the matching platform-scoped ones', () => {
    expect(platformInstallMethods(methods, 'darwin').map((m) => m.id)).toEqual(['npm', 'nix']);
    expect(platformInstallMethods(methods, 'win32').map((m) => m.id)).toEqual(['npm', 'native']);
  });

  it('preserves declaration order (the first entry is the offered default)', () => {
    expect(platformInstallMethods(methods, 'linux')[0].id).toBe('npm');
  });
});
