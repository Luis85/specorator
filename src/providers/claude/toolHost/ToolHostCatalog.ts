import { spawn } from 'node:child_process';

import type { CatalogPayload } from '../../../tool-host/types';

export interface CatalogRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface ReadCatalogDeps {
  /** Run the host in --catalog mode and resolve its captured output. */
  runCatalog: () => Promise<CatalogRunResult>;
}

const EMPTY: CatalogPayload = { tools: [], errors: [] };

export async function readCatalog(deps: ReadCatalogDeps): Promise<CatalogPayload> {
  let result: CatalogRunResult;
  try {
    result = await deps.runCatalog();
  } catch {
    return EMPTY;
  }
  if (result.code !== 0) return EMPTY;
  try {
    const parsed = JSON.parse(result.stdout) as CatalogPayload;
    if (!Array.isArray(parsed.tools) || !Array.isArray(parsed.errors)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

const CATALOG_TIMEOUT_MS = 10_000;

export function spawnCatalogRunner(
  nodePath: string,
  hostEntry: string,
  env: Record<string, string>,
  timeoutMs: number = CATALOG_TIMEOUT_MS,
): () => Promise<CatalogRunResult> {
  return () =>
    new Promise((resolve, reject) => {
      const child = spawn(nodePath, [hostEntry, '--catalog'], { env });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const done = (r: CatalogRunResult) => { if (!settled) { settled = true; window.clearTimeout(timer); resolve(r); } };
      // A tool with a hanging top-level await would never close the child; kill it.
      const timer = window.setTimeout(() => {
        child.kill();
        done({ stdout, stderr: `${stderr}\ncatalog timed out after ${timeoutMs}ms`, code: -1 });
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('error', (err) => { if (!settled) { settled = true; window.clearTimeout(timer); reject(err); } });
      child.on('close', (code) => done({ stdout, stderr, code }));
    });
}
