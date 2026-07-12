import { AcpJsonRpcTransport, AcpSubprocess, type AcpSubprocessLaunchSpec } from '../../acp';
import { resolveCursorLaunch } from './cursorLaunch';
import { forceKillCursorProcessTree } from './cursorProcessKill';

/**
 * Assembles the launch spec for `cursor-agent acp`. `resolveCursorLaunch`
 * prefers spawning `node index.js` directly (no shell), falling back to a
 * cmd.exe batch-shim wrap on Windows — the same Windows-safety the per-turn
 * CLI path used, now paid once per session instead of once per turn.
 */
export function buildCursorAcpLaunchSpec(
  cliPath: string,
  cwd: string,
  env: Record<string, string>,
): AcpSubprocessLaunchSpec {
  const launch = resolveCursorLaunch(cliPath, ['acp']);
  return {
    args: launch.args,
    command: launch.command,
    cwd,
    env: launch.extraEnv ? { ...env, ...launch.extraEnv } : env,
    ...(launch.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    // Reap the whole tree on shutdown/recycle: cursor-agent forks shell/git
    // grandchildren a bare SIGKILL orphans on Windows (parity with the one-shot
    // CLI paths that already use taskkill /T /F).
    killProcessTree: forceKillCursorProcessTree,
  };
}

/**
 * Optional diagnostics taps threaded through to the subprocess and transport
 * when ACP capture is enabled (`CursorChatRuntime.buildCaptureWriter`). Both
 * hooks are no-op-safe on the receiving end — see
 * `JsonRpcStdioClient.onWireFrame` and `AcpSubprocessLaunchSpec.onStderrData`.
 */
export interface CursorAcpProcessTaps {
  onStderrData?: (chunk: string) => void;
  onWireFrame?: (direction: 'client' | 'agent', rawLine: string) => void;
}

/**
 * Spawns the `cursor-agent acp` subprocess and wires the JSON-RPC transport
 * over its stdio, mirroring `startOpencodeAcpProcess`'s wiring shape.
 */
export function startCursorAcpProcess(
  spec: AcpSubprocessLaunchSpec,
  taps?: CursorAcpProcessTaps,
): {
  process: AcpSubprocess;
  transport: AcpJsonRpcTransport;
} {
  const process = new AcpSubprocess({ ...spec, onStderrData: taps?.onStderrData });
  process.start();

  const transport = new AcpJsonRpcTransport(
    {
      input: process.stdout,
      onClose: (listener) => process.onClose(listener),
      output: process.stdin,
    },
    undefined,
    { onWireFrame: taps?.onWireFrame },
  );

  return { process, transport };
}
