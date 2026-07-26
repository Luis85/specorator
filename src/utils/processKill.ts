import { type ChildProcess, spawn } from 'child_process';

/**
 * Force-terminates a spawned process and, on Windows, its whole tree.
 *
 * On Windows `SIGKILL` only targets the direct child, so a wrapped command
 * (`cmd.exe /c npm.cmd …`) would leave the real work running after the wrapper
 * dies — `taskkill /T /F` walks the tree instead. POSIX gets a direct `SIGKILL`,
 * which is sufficient for short one-shot processes that don't fork
 * grandchildren and aren't spawned in their own process group; anything that
 * does fork should be spawned `detached` and torn down through
 * {@link forceKillProcessGroup}.
 *
 * Provider-neutral (promoted out of `providers/cursor/runtime/cursorProcessKill`
 * when the onboarding CLI installer needed the same teardown; the features layer
 * cannot import provider internals).
 */
export async function forceKillProcessTree(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32' && typeof child.pid === 'number') {
    const taskkillSucceeded = await runTaskkill(child.pid);
    if (taskkillSucceeded) {
      return;
    }
  }
  killDirectly(child);
}

/**
 * Force-terminates a DETACHED process and its whole process group.
 *
 * A POSIX child spawned with `detached: true` leads its own group, so
 * `process.kill(-pid, 'SIGKILL')` reaps the grandchildren a child-only SIGKILL
 * would orphan (they reparent to init and keep running). Windows walks the tree
 * with `taskkill /T /F`. Falls back to a direct child SIGKILL when the group
 * signal fails (leader already exited, or no such group).
 */
export async function forceKillProcessGroup(child: ChildProcess): Promise<void> {
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
