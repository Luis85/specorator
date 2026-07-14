import { type ChildProcess, spawn } from 'child_process';

/**
 * Force-terminates a process and all descendants. On Windows `SIGKILL` only
 * targets the parent and leaves detached bash/git grandchildren orphaned, so
 * reap the whole tree with `taskkill /T /F`. Other platforms get `SIGKILL`,
 * which propagates to the process group when the child was spawned detached.
 *
 * Shared by the chat runtime, the auxiliary one-shot runner, and the model
 * catalog probe so every `cursor-agent` spawn site tears down identically.
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
