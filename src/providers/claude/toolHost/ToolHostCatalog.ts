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

/** Deduped union of every tool's declared `secrets`, used to seed the host env. */
export function unionSecretIds(catalog: CatalogPayload): string[] {
  return [...new Set(catalog.tools.flatMap((t) => t.secrets))];
}

/**
 * Run the host in `--catalog` mode and parse its output. Returns `null` on
 * ANY failure (process error, non-zero/`-1` timeout exit, or unparseable/invalid
 * stdout) so callers can distinguish a *failed* scan from a genuinely *empty*
 * catalog ({@link CatalogPayload} with empty `tools`). Conflating the two would
 * cache an empty declared-secret union over a previously-good one — a silent
 * secrets-drop in serve mode. A clean exit with valid JSON returns the payload
 * (possibly with empty `tools`).
 */
export async function readCatalog(deps: ReadCatalogDeps): Promise<CatalogPayload | null> {
  let result: CatalogRunResult;
  try {
    result = await deps.runCatalog();
  } catch {
    return null;
  }
  if (result.code !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout) as CatalogPayload;
    if (!Array.isArray(parsed.tools) || !Array.isArray(parsed.errors)) return null;
    return parsed;
  } catch {
    return null;
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
