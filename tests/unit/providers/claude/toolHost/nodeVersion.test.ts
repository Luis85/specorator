import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { isSupportedNode, parseNodeMajor, probeNodeMajor } from '@/providers/claude/toolHost/nodeVersion';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const mockedSpawn = spawn as unknown as jest.Mock;

/** A fake child whose stdout emits `versionOut` then closes on the next tick. */
function fakeChild(versionOut: string) {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: jest.Mock };
  child.stdout = new EventEmitter();
  child.kill = jest.fn();
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from(versionOut));
    child.emit('close', 0);
  });
  return child;
}

/** A fake child that accepts the spawn but never emits data or close (a hung `node` shim). */
function hungChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: jest.Mock };
  child.stdout = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

describe('nodeVersion', () => {
  it('parses the major version', () => {
    expect(parseNodeMajor('v18.20.4\n')).toBe(18);
    expect(parseNodeMajor('v22.3.0')).toBe(22);
    expect(parseNodeMajor('garbage')).toBeNull();
  });
  it('gates on >= 18', () => {
    expect(isSupportedNode(18)).toBe(true);
    expect(isSupportedNode(16)).toBe(false);
    expect(isSupportedNode(null)).toBe(false);
  });
});

describe('probeNodeMajor', () => {
  afterEach(() => mockedSpawn.mockReset());

  it('spawns with the passed env (curated child env, not process.env)', async () => {
    mockedSpawn.mockReturnValue(fakeChild('v20.11.0\n'));
    const env = { PATH: '/usr/bin' };

    const major = await probeNodeMajor('/usr/bin/node', env);

    expect(major).toBe(20);
    expect(mockedSpawn).toHaveBeenCalledWith('/usr/bin/node', ['--version'], { env });
  });

  it('passes env: undefined through when no env is supplied', async () => {
    mockedSpawn.mockReturnValue(fakeChild('v18.0.0\n'));
    await probeNodeMajor('/usr/bin/node');
    expect(mockedSpawn).toHaveBeenCalledWith('/usr/bin/node', ['--version'], { env: undefined });
  });

  it('resolves null on a spawn error without throwing', async () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter };
    child.stdout = new EventEmitter();
    mockedSpawn.mockReturnValue(child);
    setImmediate(() => child.emit('error', new Error('ENOENT')));
    await expect(probeNodeMajor('/missing/node', { PATH: '' })).resolves.toBeNull();
  });

  it('kills a hung child and resolves null after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const child = hungChild();
      mockedSpawn.mockReturnValue(child);
      const probe = probeNodeMajor('/usr/bin/node', { PATH: '' });
      jest.advanceTimersByTime(5_000);
      await expect(probe).resolves.toBeNull();
      expect(child.kill).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the timeout when the child closes normally (no leaked timer)', async () => {
    jest.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: jest.Mock };
      child.stdout = new EventEmitter();
      child.kill = jest.fn();
      mockedSpawn.mockReturnValue(child);
      const probe = probeNodeMajor('/usr/bin/node', { PATH: '' });
      child.stdout.emit('data', Buffer.from('v20.0.0\n'));
      child.emit('close', 0);
      await expect(probe).resolves.toBe(20);
      // The pending timer must not fire (and must not kill) after a clean close.
      jest.advanceTimersByTime(10_000);
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
