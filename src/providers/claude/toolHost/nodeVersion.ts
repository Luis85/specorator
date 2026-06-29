import { spawn } from 'node:child_process';

export const MIN_NODE_MAJOR = 18;

/** Upper bound on `node --version`; a hung shim that accepts the spawn but never exits must not stall the UI. */
const PROBE_TIMEOUT_MS = 5_000;

/** Parse `process.version`-style output ("v18.20.4\n") to a major number, or null. */
export function parseNodeMajor(versionOutput: string): number | null {
  const m = versionOutput.trim().match(/^v?(\d+)\./);
  return m ? Number(m[1]) : null;
}

export function isSupportedNode(major: number | null): boolean {
  return major !== null && major >= MIN_NODE_MAJOR;
}

/**
 * Spawn `node --version`; resolves the major version or null (never throws).
 *
 * Callers MUST pass the SAME curated env they use for the host/catalog spawn
 * (`curateStdioMcpEnv(...)`). Inheriting `process.env` would let an Obsidian/Electron
 * `NODE_OPTIONS` (which the curated env intentionally strips) make a standalone `node`
 * exit with no version stdout → null → the feature gets wrongly disabled even though
 * the actual host would run fine.
 */
export function probeNodeMajor(
  nodePath: string,
  env?: NodeJS.ProcessEnv,
): Promise<number | null> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const child = spawn(nodePath, ['--version'], { env });
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    // A `node` shim that accepts the spawn but never exits from `--version` would otherwise
    // leave both the settings enable check and scanLocalToolHost() awaiting forever (the
    // catalog runner's own timeout is downstream of this probe). Treat a hang as unsupported.
    const timer = window.setTimeout(() => {
      child.kill();
      finish(null);
    }, PROBE_TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += String(d)));
    child.on('error', () => finish(null));
    child.on('close', () => finish(parseNodeMajor(out)));
  });
}
