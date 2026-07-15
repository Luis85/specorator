import { EventEmitter, Readable, Writable } from 'stream';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'node:child_process';

import { AgentSubprocess, type AgentSubprocessCloseInfo } from '@/core/transport/AgentSubprocess';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

interface MockProc extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable & EventEmitter;
  kill: jest.Mock;
  exitCode: number | null;
  killed: boolean;
}

function makeMockProc(): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} }) as Readable & EventEmitter;
  proc.kill = jest.fn();
  proc.exitCode = null;
  proc.killed = false;
  return proc;
}

const SPEC = { command: 'agent', args: ['--serve'], cwd: '/ws', env: { PATH: '/bin' } };

describe('AgentSubprocess', () => {
  let mockProc: MockProc;

  beforeEach(() => {
    mockProc = makeMockProc();
    mockSpawn.mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('spawns with piped stdio and windowsHide', () => {
      new AgentSubprocess(SPEC).start();
      expect(mockSpawn).toHaveBeenCalledWith('agent', ['--serve'], expect.objectContaining({
        stdio: 'pipe',
        cwd: '/ws',
        env: { PATH: '/bin' },
        windowsHide: true,
      }));
    });

    it('passes windowsVerbatimArguments through to spawn when set, and omits it otherwise', () => {
      new AgentSubprocess(SPEC).start();
      expect(mockSpawn.mock.calls[0][2]).not.toHaveProperty('windowsVerbatimArguments');

      new AgentSubprocess({ ...SPEC, windowsVerbatimArguments: true }).start();
      expect(mockSpawn.mock.calls[1][2]).toMatchObject({ windowsVerbatimArguments: true });
    });

    it('spawns detached (own process group) only on posix when detached is set', () => {
      const realPlatform = process.platform;
      try {
        new AgentSubprocess(SPEC).start();
        expect(mockSpawn.mock.calls[0][2]).not.toHaveProperty('detached');

        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        new AgentSubprocess({ ...SPEC, detached: true }).start();
        expect(mockSpawn.mock.calls[1][2]).toMatchObject({ detached: true });

        // Windows relies on taskkill /T instead — detached would spawn a console.
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        new AgentSubprocess({ ...SPEC, detached: true }).start();
        expect(mockSpawn.mock.calls[2][2]).not.toHaveProperty('detached');
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
      }
    });

    it('is idempotent', () => {
      const p = new AgentSubprocess(SPEC);
      p.start();
      p.start();
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('streams', () => {
    it('exposes the spawned stdio and throws before start', () => {
      const p = new AgentSubprocess(SPEC);
      expect(() => p.stdin).toThrow();
      p.start();
      expect(p.stdin).toBe(mockProc.stdin);
      expect(p.stdout).toBe(mockProc.stdout);
      expect(p.stderr).toBe(mockProc.stderr);
    });
  });

  describe('isAlive', () => {
    it('is true after start, false after exit, false after error', () => {
      const p = new AgentSubprocess(SPEC);
      p.start();
      expect(p.isAlive()).toBe(true);
      mockProc.emit('exit', 0, null);
      expect(p.isAlive()).toBe(false);

      const p2 = new AgentSubprocess(SPEC);
      p2.start();
      mockProc.emit('error', new Error('boom'));
      expect(p2.isAlive()).toBe(false);
    });
  });

  describe('stderr buffering', () => {
    it('snapshots trimmed stderr and bounds the buffer', () => {
      const p = new AgentSubprocess({ ...SPEC, stderrBufferLimit: 10 });
      p.start();
      mockProc.stderr.emit('data', '  hello  ');
      expect(p.getStderrSnapshot()).toBe('hello');
      mockProc.stderr.emit('data', 'ABCDEFGHIJKLMNOP');
      // keeps only the last 10 bytes
      expect(p.getStderrSnapshot()).toBe('GHIJKLMNOP');
    });
  });

  describe('onClose', () => {
    it('fires once with reason "exit" and the exit code/signal', () => {
      const p = new AgentSubprocess(SPEC);
      const seen: AgentSubprocessCloseInfo[] = [];
      p.onClose((info) => seen.push(info));
      p.start();
      mockProc.emit('exit', 1, 'SIGTERM');
      mockProc.emit('exit', 1, 'SIGTERM');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ reason: 'exit', code: 1, signal: 'SIGTERM' });
      expect(seen[0].error).toBeInstanceOf(Error);
    });

    it('reports a clean exit with no error', () => {
      const p = new AgentSubprocess(SPEC);
      let info: AgentSubprocessCloseInfo | undefined;
      p.onClose((i) => { info = i; });
      p.start();
      mockProc.emit('exit', 0, null);
      expect(info).toMatchObject({ reason: 'exit', code: 0, error: undefined });
    });

    it('fires reason "error" on spawn error and suppresses a later exit', () => {
      const p = new AgentSubprocess(SPEC);
      const seen: AgentSubprocessCloseInfo[] = [];
      p.onClose((info) => seen.push(info));
      p.start();
      const err = new Error('ENOENT');
      mockProc.emit('error', err);
      mockProc.emit('exit', null, 'SIGKILL');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ reason: 'error', error: err });
    });

    it('unsubscribes', () => {
      const p = new AgentSubprocess(SPEC);
      const listener = jest.fn();
      const off = p.onClose(listener);
      off();
      p.start();
      mockProc.emit('exit', 0, null);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('issues SIGTERM synchronously within the call frame', async () => {
      const p = new AgentSubprocess(SPEC);
      p.start();
      const done = p.shutdown();
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
      // Resolve the shutdown so its escalation timers are cleared (no leak).
      mockProc.emit('exit', 0, 'SIGTERM');
      await done;
    });

    it('escalates to SIGKILL after the timeout, then resolves on exit', async () => {
      jest.useFakeTimers();
      const p = new AgentSubprocess({ ...SPEC, sigkillTimeoutMs: 1000 });
      p.start();
      const done = p.shutdown();
      expect(mockProc.kill).toHaveBeenLastCalledWith('SIGTERM');
      jest.advanceTimersByTime(1000);
      expect(mockProc.kill).toHaveBeenLastCalledWith('SIGKILL');
      mockProc.emit('exit', null, 'SIGKILL');
      await expect(done).resolves.toBeUndefined();
    });

    it('resolves via the give-up ceiling if exit never fires', async () => {
      jest.useFakeTimers();
      const p = new AgentSubprocess({ ...SPEC, sigkillTimeoutMs: 1000 });
      p.start();
      const done = p.shutdown();
      jest.advanceTimersByTime(2000);
      await expect(done).resolves.toBeUndefined();
    });

    it('is a no-op when never started', async () => {
      await expect(new AgentSubprocess(SPEC).shutdown()).resolves.toBeUndefined();
      expect(mockProc.kill).not.toHaveBeenCalled();
    });

    it('uses the killProcessTree hook (tree kill) instead of SIGTERM/SIGKILL when provided', async () => {
      const killProcessTree = jest.fn();
      const p = new AgentSubprocess({ ...SPEC, killProcessTree });
      p.start();
      const done = p.shutdown();
      expect(killProcessTree).toHaveBeenCalledWith(mockProc);
      expect(mockProc.kill).not.toHaveBeenCalled();
      mockProc.emit('exit', 0, 'SIGKILL');
      await expect(done).resolves.toBeUndefined();
    });

    it('awaits an asynchronous killProcessTree hook before completing shutdown', async () => {
      let releaseKill!: () => void;
      const killPending = new Promise<void>((resolve) => { releaseKill = resolve; });
      const killProcessTree = jest.fn(() => killPending);
      const p = new AgentSubprocess({ ...SPEC, killProcessTree });
      p.start();

      let settled = false;
      const done = p.shutdown().then(() => { settled = true; });
      mockProc.emit('exit', 0, 'SIGKILL');
      await Promise.resolve();
      expect(settled).toBe(false);

      releaseKill();
      await done;
      expect(settled).toBe(true);
    });

    it('reaps the process group via killProcessTree even when the direct child already exited', async () => {
      // A detached group's shell/git grandchildren can outlive the direct child.
      // A cleanup/restart after the child crashed must still reap the group.
      const killProcessTree = jest.fn();
      (mockProc as unknown as { pid: number }).pid = 4242;
      const p = new AgentSubprocess({ ...SPEC, killProcessTree });
      p.start();
      mockProc.emit('exit', 1, null); // child gone: alive=false
      mockProc.exitCode = 1;

      await p.shutdown();

      expect(killProcessTree).toHaveBeenCalledWith(mockProc);
      expect(mockProc.kill).not.toHaveBeenCalled();
    });

    it('does not group-reap an exited child with no pid or no reaper', async () => {
      const killProcessTree = jest.fn();
      // No pid ⇒ nothing to signal.
      const p = new AgentSubprocess({ ...SPEC, killProcessTree });
      p.start();
      mockProc.emit('exit', 1, null);
      mockProc.exitCode = 1;
      await p.shutdown();
      expect(killProcessTree).not.toHaveBeenCalled();

      // No reaper configured ⇒ exited child is a clean no-op.
      const p2 = new AgentSubprocess(SPEC);
      p2.start();
      mockProc.emit('exit', 1, null);
      mockProc.exitCode = 1;
      await expect(p2.shutdown()).resolves.toBeUndefined();
    });
  });
});
