import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import { AgentSubprocess } from '../../core/transport/AgentSubprocess';

export interface AcpSubprocessLaunchSpec {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  /**
   * cmd.exe verbatim-args flag for a resolved Windows `.cmd`/`.bat` batch
   * shim. Threaded straight through to `AgentSubprocess`.
   */
  windowsVerbatimArguments?: boolean;
  /**
   * Diagnostics tap: receives raw stderr chunks alongside the existing ring
   * buffer. Never throws upstream — calls are try/catch-wrapped.
   */
  onStderrData?: (chunk: string) => void;
  /**
   * Optional hard tree-kill for `shutdown()` (see `AgentSubprocessSpec`). A
   * provider whose CLI forks shell/git grandchildren passes a `taskkill /T /F`
   * reaper so recycling the process doesn't orphan them on Windows.
   */
  killProcessTree?: (proc: ChildProcess) => void | Promise<void>;
}

type CloseListener = (error?: Error) => void;

/**
 * Opencode's stdio subprocess. A thin adapter over the shared
 * `core/transport/AgentSubprocess` (ADR-0001 Move 2) that keeps Opencode's
 * close-listener contract (`onClose(error?)`).
 */
export class AcpSubprocess {
  private readonly proc: AgentSubprocess;
  private readonly onStderrData?: (chunk: string) => void;

  constructor(launchSpec: AcpSubprocessLaunchSpec) {
    this.proc = new AgentSubprocess(launchSpec);
    this.onStderrData = launchSpec.onStderrData;
  }

  get stdin(): Writable {
    return this.proc.stdin;
  }

  get stdout(): Readable {
    return this.proc.stdout;
  }

  get stderr(): Readable {
    return this.proc.stderr;
  }

  start(): void {
    this.proc.start();
    if (this.onStderrData) {
      this.proc.stderr.on('data', (chunk: Buffer | string) => {
        try {
          this.onStderrData?.(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        } catch {
          // A diagnostics tap must never break the transport.
        }
      });
    }
  }

  isAlive(): boolean {
    return this.proc.isAlive();
  }

  getStderrSnapshot(): string {
    return this.proc.getStderrSnapshot();
  }

  onClose(listener: CloseListener): () => void {
    return this.proc.onClose((info) => listener(info.error));
  }

  shutdown(): Promise<void> {
    return this.proc.shutdown();
  }
}
