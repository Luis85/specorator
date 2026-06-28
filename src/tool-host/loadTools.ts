import path from 'node:path';

import type { LoadedTool, LoadError, LoadResult, ToolModule } from './types';

export interface LoadDeps {
  readdir: (dir: string) => Promise<string[]>;
  importModule: (absPath: string) => Promise<ToolModule>;
}

export interface LoadOptions {
  /** Filenames to skip importing entirely — disabled tools must never execute (serve mode passes the disabled set). */
  skipFiles?: Set<string>;
  /** Per-file import timeout; a hung top-level `await` becomes a per-file load error instead of freezing the host. */
  importTimeoutMs?: number;
}

const DEFAULT_IMPORT_TIMEOUT_MS = 5_000;

function importWithTimeout(p: Promise<ToolModule>, ms: number, file: string): Promise<ToolModule> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`import of ${file} timed out after ${ms}ms`)), ms);
  });
  // Clear the timer on success/failure so a healthy import doesn't leave a live timer
  // keeping the --catalog process alive (and so unit tests don't leak open handles).
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function validateManifest(mod: ToolModule, file: string): LoadError | null {
  const m = mod?.manifest;
  if (!m || typeof m.name !== 'string' || typeof m.description !== 'string') {
    return { file, message: 'Invalid or missing `manifest` (need name, description, inputSchema)' };
  }
  // MCP ToolSchema requires an object-root JSON Schema; a non-object root would
  // poison the whole ListTools response, so reject it as a per-file load error.
  const schema = m.inputSchema as { type?: unknown } | null | undefined;
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    return { file, message: '`manifest.inputSchema` must be a JSON Schema object with root type "object"' };
  }
  // `secrets` is user-authored JS; a typo like `secrets: 'KEY'` would split into characters downstream.
  if (m.secrets !== undefined && (!Array.isArray(m.secrets) || m.secrets.some((s) => typeof s !== 'string'))) {
    return { file, message: '`manifest.secrets` must be a string array when present' };
  }
  if (typeof mod.handler !== 'function') {
    return { file, message: 'Missing `handler` export (must be a function)' };
  }
  return null;
}

export async function loadTools(dir: string, deps: LoadDeps, opts: LoadOptions = {}): Promise<LoadResult> {
  const skip = opts.skipFiles ?? new Set<string>();
  const importTimeoutMs = opts.importTimeoutMs ?? DEFAULT_IMPORT_TIMEOUT_MS;

  let entries: string[];
  try {
    entries = await deps.readdir(dir);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return { tools: [], errors: [] };
    throw err;
  }

  const tools: LoadedTool[] = [];
  const errors: LoadError[] = [];
  const seenNames = new Map<string, string>();   // tool name → first file that claimed it

  // Disabled files are never imported, so their top-level code never runs (and can't read secrets from env).
  // Files are sorted, so the first file alphabetically keeps a duplicated name deterministically.
  for (const file of entries.filter((f) => f.endsWith('.mjs') && !skip.has(f)).sort()) {
    try {
      const mod = await importWithTimeout(deps.importModule(path.join(dir, file)), importTimeoutMs, file);
      const invalid = validateManifest(mod, file);
      if (invalid) {
        errors.push(invalid);
        continue;
      }
      const name = mod.manifest.name;
      const firstFile = seenNames.get(name);
      if (firstFile) {
        // Two files sharing a name would shadow handlers and mismatch secrets — reject the later one.
        errors.push({ file, message: `Duplicate tool name "${name}" (already defined in ${firstFile})` });
        continue;
      }
      seenNames.set(name, file);
      tools.push({ file, manifest: mod.manifest, handler: mod.handler });
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { tools, errors };
}
