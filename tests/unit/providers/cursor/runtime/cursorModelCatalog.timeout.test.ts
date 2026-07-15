import { EventEmitter } from 'events';

import {
  getCachedCursorModelIds,
  refreshCursorModelCatalog,
  resetCursorModelCatalog,
} from '@/providers/cursor/runtime/cursorModelCatalog';

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('@/providers/cursor/runtime/cursorAgentSpawnLock', () => ({
  acquireCursorAgentSpawnLock: jest.fn().mockResolvedValue(() => undefined),
}));

jest.mock('@/providers/cursor/runtime/cursorLaunch', () => ({
  resolveCursorLaunch: jest.fn((cli: string, args: string[]) => ({ command: cli, args })),
}));

type MockChild = EventEmitter & { stdout: EventEmitter; kill: jest.Mock; pid?: number };

function createMockChild(pid?: number): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.kill = jest.fn();
  child.pid = pid;
  (child as unknown as { exitCode: number | null }).exitCode = null;
  (child as unknown as { signalCode: string | null }).signalCode = null;
  return child;
}

describe('refreshCursorModelCatalog list-models timeout', () => {
  const realPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    resetCursorModelCatalog();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  });

  it('tree-kills an unresponsive list-models probe on win32 and preserves the cache', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    // The probe child never emits close; the taskkill child must spawn cleanly.
    const probe = createMockChild(7777);
    const taskkill = createMockChild();
    mockSpawn.mockImplementationOnce(() => probe).mockImplementationOnce(() => taskkill);

    jest.useFakeTimers();
    const pending = refreshCursorModelCatalog('/usr/bin/cursor-agent', {}, '/vault');

    // Let the (mocked, resolved) spawn lock settle so spawn + the timer attach.
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(15_000);

    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'taskkill', ['/PID', '7777', '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });

    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    taskkill.emit('close', 0);
    jest.useRealTimers();
    const ids = await pending;
    // Discovery failed → existing fallback is returned, never an empty list.
    expect(ids.length).toBeGreaterThan(0);
    expect(getCachedCursorModelIds().length).toBeGreaterThan(0);
  });
});
