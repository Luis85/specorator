import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildCatalog } from './catalog';
import { loadTools } from './loadTools';
import { createLogger } from './logger';
import { createServer } from './server';
import type { ToolHandlerCtx, ToolModule } from './types';
import { createVaultContext } from './vaultContext';

const HANDLER_TIMEOUT_MS = 30_000;

function env(name: string): string {
  return process.env[name] ?? '';
}

/** Parse a JSON string array env var; tolerate empty/invalid as []. */
function parseStringList(raw: string): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** stdout carries MCP JSON-RPC / catalog JSON; redirect all console.* to stderr so a tool's
 * `console.log` (top-level or in a handler) can never corrupt the protocol stream. */
function guardStdout(): void {
  const toStderr = (...args: unknown[]) => process.stderr.write(`${args.map((a) => String(a)).join(' ')}\n`);
  for (const k of ['log', 'info', 'debug', 'warn', 'error', 'trace'] as const) {
    (console as unknown as Record<string, unknown>)[k] = toStderr;
  }
}

async function main(): Promise<void> {
  guardStdout();   // BEFORE importing any tool — keep stdout exclusively for the protocol.
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

  // Disabled files are never imported in EITHER mode — their top-level code never executes
  // (no fs/network side effects, no secret access), in catalog or serve.
  const load = await loadTools(toolsDir, deps, { skipFiles: disabledFiles });

  if (process.argv.includes('--catalog')) {
    // Exit after stdout flushes: an imported tool may have left active handles (timer/watcher/
    // socket) that would otherwise keep this process alive past the caller's close/timeout,
    // causing a valid catalog to be discarded.
    process.stdout.write(JSON.stringify(buildCatalog(load)), () => process.exit(0));
    return;
  }

  const ctxFactory = (toolName: string): ToolHandlerCtx => {
    const secrets: Record<string, string> = {};
    const tool = load.tools.find((t) => t.manifest.name === toolName);
    for (const id of tool?.manifest.secrets ?? []) {
      if (secretsById[id] !== undefined) secrets[id] = secretsById[id];
    }
    return {
      vaultPath,
      vault: createVaultContext(vaultPath),
      logger: createLogger(toolName, { logFilePath }),
      secrets,
    };
  };

  await createServer(load.tools, ctxFactory, HANDLER_TIMEOUT_MS);
}

main().catch((err) => {
  process.stderr.write(`tool-host fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
