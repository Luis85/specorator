import { Console } from 'node:console';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { buildCatalog } from './catalog';
import { grantSecrets } from './grantSecrets';
import { loadTools } from './loadTools';
import { createLogger } from './logger';
import { createServer } from './server';
import type { ToolHandlerCtx, ToolModule } from './types';
import { createVaultContext } from './vaultContext';

const HANDLER_TIMEOUT_MS = 30_000;

function env(name: string): string {
  return process.env[name] ?? '';
}

/** Parse a JSON env var, tolerating empty/invalid input as `undefined`. */
function parseJson(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Keep only the string members of an unknown value (non-arrays → []). */
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/** Parse a JSON string array env var; tolerate empty/invalid as []. */
function parseStringList(raw: string): string[] {
  return toStringArray(parseJson(raw));
}

/**
 * Parse the cataloged per-tool secrets map (`{ file: [secretId, ...] }`) env var;
 * tolerate empty/invalid as {}. This is the immutable catalog-time declaration the
 * grant is keyed off — NOT the serve-time manifest.
 */
function parseToolSecretsMap(raw: string): Record<string, string[]> {
  const v = parseJson(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [file, ids] of Object.entries(v)) out[file] = toStringArray(ids);
  return out;
}

/**
 * stdout is reserved for MCP JSON-RPC / catalog JSON. Capture the REAL stdout for protocol use,
 * then route everything else to stderr: the entire `console` (every method, not just log/warn) AND
 * direct `process.stdout.write` (progress bars, CLI deps). A tool's stray stdout output therefore
 * goes to stderr and can never corrupt the protocol stream. Returns the protocol stdout writer.
 */
function guardStdout(): Writable {
  const realWrite = process.stdout.write.bind(process.stdout);
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) =>
    (process.stderr.write as (...a: unknown[]) => boolean)(chunk, ...rest));
  return new Writable({
    write(chunk: string | Uint8Array, _enc, cb) {
      realWrite(chunk, cb);
    },
  });
}

async function main(): Promise<void> {
  // BEFORE importing any tool — keep real stdout exclusively for the protocol; tools' stdout → stderr.
  const protocolStdout = guardStdout();
  const toolsDir = env('SPECORATOR_TOOLS_DIR');
  const vaultPath = env('SPECORATOR_VAULT_PATH');
  // Disabled state is keyed by FILE, not tool name — a name isn't known without importing,
  // and importing is exactly what we must avoid for a disabled (possibly untrusted) tool.
  const disabledFiles = new Set(parseStringList(env('SPECORATOR_DISABLED_FILES')));
  const logFilePath = vaultPath ? path.join(vaultPath, '.specorator', 'tool-host.log') : undefined;
  const deps = {
    readdir: (dir: string) => fs.readdir(dir),
    importModule: (p: string) => import(pathToFileURL(p).href) as Promise<ToolModule>,
  };

  // Capture declared secrets into host-owned state and SCRUB them from process.env BEFORE
  // importing any tool, so no tool module can read another tool's secret via
  // process.env.SPECORATOR_SECRET_*. ctx.secrets then exposes only the calling tool's subset.
  const SECRET_PREFIX = 'SPECORATOR_SECRET_';
  const secretsById: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(SECRET_PREFIX)) {
      secretsById[key.slice(SECRET_PREFIX.length)] = process.env[key] ?? '';
      delete process.env[key];
    }
  }
  // The CATALOGED per-tool declaration (file → declared ids), captured from the
  // successful catalog scan. The grant is keyed off THIS, not the serve manifest,
  // so a tool can't claim another tool's secret by listing its id in serve mode.
  const catalogedSecretsByFile = parseToolSecretsMap(env('SPECORATOR_TOOL_SECRETS'));

  // Disabled files are never imported in EITHER mode — their top-level code never executes
  // (no fs/network side effects, no secret access), in catalog or serve.
  const load = await loadTools(toolsDir, deps, { skipFiles: disabledFiles });

  if (process.argv.includes('--catalog')) {
    // Write via the protocol stdout (the real stdout) so tool output never prepends the JSON.
    // Exit after it flushes: an imported tool may have left active handles (timer/watcher/socket)
    // that would otherwise keep this process alive past the caller's close/timeout.
    protocolStdout.write(JSON.stringify(buildCatalog(load)), () => process.exit(0));
    return;
  }

  const ctxFactory = (toolName: string): ToolHandlerCtx => {
    // Resolve the tool's FILE, then grant only ids that file declared AT CATALOG TIME.
    // The serve-mode `manifest.secrets` is deliberately NOT consulted for the grant.
    const tool = load.tools.find((t) => t.manifest.name === toolName);
    return {
      vaultPath,
      vault: createVaultContext(vaultPath),
      logger: createLogger(toolName, { logFilePath }),
      secrets: grantSecrets(tool?.file, catalogedSecretsByFile, secretsById),
    };
  };

  await createServer(load.tools, ctxFactory, HANDLER_TIMEOUT_MS, protocolStdout);
}

main().catch((err) => {
  process.stderr.write(`tool-host fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
