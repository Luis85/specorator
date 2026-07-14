import type * as ChildProcessModule from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  ...jest.requireActual<typeof ChildProcessModule>('child_process'),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { forceKillCursorProcessTree } from '@/providers/cursor/runtime/cursorProcessKill';

type MockChild = EventEmitter & { kill: jest.Mock; pid?: number };

function createMockChild(pid?: number): MockChild {
  const child = new EventEmitter() as MockChild;
  child.kill = jest.fn();
  child.pid = pid;
  return child;
}

function asSpawned(child: MockChild): ChildProcess {
  return child as unknown as ChildProcess;
}

describe('forceKillCursorProcessTree', () => {
  const realPlatform = process.platform;

  beforeEach(() => {
    mockSpawn.mockImplementation(() => {
      const taskkill = new EventEmitter();
      queueMicrotask(() => taskkill.emit('close', 0));
      return taskkill;
    });
  });

  afterEach(() => {
    mockSpawn.mockReset();
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  });

  it('reaps the whole tree with taskkill /T /F on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const child = createMockChild(1234);

    await forceKillCursorProcessTree(asSpawned(child));

    expect(mockSpawn).toHaveBeenCalledWith('taskkill', ['/PID', '1234', '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('returns an awaitable termination operation instead of blocking the caller', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const child = createMockChild(1234);

    const termination = forceKillCursorProcessTree(asSpawned(child));

    expect(termination).toBeInstanceOf(Promise);
  });

  it('falls back to a direct SIGKILL when taskkill cannot spawn on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockSpawn.mockImplementation(() => {
      const taskkill = new EventEmitter();
      queueMicrotask(() => taskkill.emit('error', new Error('taskkill missing')));
      return taskkill;
    });
    const child = createMockChild(1234);

    await forceKillCursorProcessTree(asSpawned(child));

    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('falls back to SIGKILL when taskkill exits nonzero', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockSpawn.mockImplementation(() => {
      const taskkill = new EventEmitter();
      queueMicrotask(() => taskkill.emit('close', 128));
      return taskkill;
    });
    const child = createMockChild(1234);

    await forceKillCursorProcessTree(asSpawned(child));

    expect(mockSpawn).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('uses SIGKILL on win32 when the child has no pid', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const child = createMockChild(undefined);

    await forceKillCursorProcessTree(asSpawned(child));

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('uses SIGKILL on posix platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const child = createMockChild(1234);

    await forceKillCursorProcessTree(asSpawned(child));

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
