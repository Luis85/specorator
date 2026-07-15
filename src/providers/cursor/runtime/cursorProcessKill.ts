import { type ChildProcess, spawn } from 'child_process';

/**
 * Force-terminates a single `cursor-agent` process. On Windows `SIGKILL` only
 * targets the direct child, so reap the whole tree with `taskkill /T /F`. POSIX
 * gets a direct `SIGKILL` — sufficient for the short one-shot probes (model
 * catalog / auxiliary runner), which don't fork shell/git grandchildren and
 * aren't spawned in their own process group. The persistent ACP process DOES
 * fork tool grandchildren; it is spawned detached and torn down through
 * {@link forceKillCursorProcessGroup} instead.
 */
export async function forceKillCursorProcessTree(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32' && typeof child.pid === 'number') {
    const taskkillSucceeded = await runTaskkill(child.pid);
    if (taskkillSucceeded) {
      return;
    }
  }
  killDirectly(child);
}

/**
 * Force-terminates a DETACHED `cursor-agent` process and its whole process
 * group. The persistent ACP process is spawned with `detached: true` on POSIX
 * so it leads its own group; `process.kill(-pid, 'SIGKILL')` then reaps the
 * shell/git grandchildren a bare child-only SIGKILL would orphan (they reparent
 * to init and keep running while a replacement process starts). Windows walks
 * the tree with `taskkill /T /F`. Falls back to a direct child SIGKILL when the
 * group signal fails (e.g. the leader already exited, or no such group).
 */
export async function forceKillCursorProcessGroup(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32') {
    if (typeof child.pid === 'number' && (await runTaskkill(child.pid))) {
      return;
    }
    killDirectly(child);
    return;
  }
  if (typeof child.pid === 'number') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Leader already exited, or the child was not a group leader — fall back.
    }
  }
  killDirectly(child);
}

function runTaskkill(pid: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let taskkill: ChildProcess;
    try {
      taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      resolve(false);
      return;
    }
    if (!taskkill || typeof taskkill.once !== 'function') {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (succeeded: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(succeeded);
    };
    taskkill.once('error', () => finish(false));
    taskkill.once('close', (code) => finish(code === 0));
  });
}

function killDirectly(child: ChildProcess): void {
  try {
    child.kill('SIGKILL');
  } catch {
    // already exited / not killable
  }
}
