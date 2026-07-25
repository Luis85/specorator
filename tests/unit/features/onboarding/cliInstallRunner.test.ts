import { EventEmitter } from 'events';

import type { ProviderCliInstallMethod } from '@/core/providers/types';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('@/utils/cliBinaryLocator', () => ({ findBinaryOnPath: jest.fn(() => '/usr/bin/npm') }));
jest.mock('@/utils/env', () => ({ getEnhancedPath: jest.fn(() => '/enhanced/bin:/usr/bin') }));
jest.mock('@/utils/processKill', () => ({
  forceKillProcessGroup: jest.fn(async () => {}),
}));

import { spawn } from 'child_process';

import {
  appendInstallOutput,
  INSTALL_OUTPUT_LINE_CAP,
  platformInstallMethods,
  runCliInstall,
} from '@/features/onboarding/cliInstallRunner';
import { findBinaryOnPath } from '@/utils/cliBinaryLocator';
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
  jest.mocked(forceKillProcessGroup).mockClear();
  jest.mocked(spawn).mockReset();
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
    mountChild();
    const order: string[] = [];
    let releaseKill: () => void = () => {};
    jest.mocked(forceKillProcessGroup).mockImplementation(async () => {
      order.push('kill:start');
      await new Promise<void>((resolve) => { releaseKill = () => resolve(); });
      order.push('kill:done');
    });

    const handle = runCliInstall(npmMethod, { onOutput: () => {} });
    handle.cancel();
    void handle.done.then(() => order.push('settled'));

    expect(order).toEqual(['kill:start']);
    releaseKill();
    await handle.done;
    await Promise.resolve();

    expect(order).toEqual(['kill:start', 'kill:done', 'settled']);
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
