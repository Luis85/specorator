import { AcpJsonRpcTransport, AcpSubprocess, type AcpSubprocessLaunchSpec } from '../../acp';
import { resolveCursorLaunch } from './cursorLaunch';

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
  };
}

/**
 * Spawns the `cursor-agent acp` subprocess and wires the JSON-RPC transport
 * over its stdio, mirroring `startOpencodeAcpProcess`'s wiring shape.
 */
export function startCursorAcpProcess(spec: AcpSubprocessLaunchSpec): {
  process: AcpSubprocess;
  transport: AcpJsonRpcTransport;
} {
  const process = new AcpSubprocess(spec);
  process.start();

  const transport = new AcpJsonRpcTransport({
    input: process.stdout,
    onClose: (listener) => process.onClose(listener),
    output: process.stdin,
  });

  return { process, transport };
}
