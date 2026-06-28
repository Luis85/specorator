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

/**
 * Validate the manifest's `inputSchema` against the constraints the MCP client enforces on
 * `tools/list` — a violation here would poison the WHOLE list, so we reject the file instead.
 * Returns an error message, or null when valid.
 */
function validateInputSchema(value: unknown): string | null {
  const schema = value as { type?: unknown; properties?: unknown; required?: unknown } | null | undefined;
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    return '`manifest.inputSchema` must be a JSON Schema object with root type "object"';
  }
  const props = schema.properties;
  if (
    props !== undefined &&
    (typeof props !== 'object' || props === null ||
      Object.values(props as Record<string, unknown>).some((v) => typeof v !== 'object' || v === null))
  ) {
    return '`manifest.inputSchema.properties` values must be schema objects';
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((r) => typeof r !== 'string'))) {
    return '`manifest.inputSchema.required` must be an array of strings';
  }
  // Returned verbatim in tools/list and JSON-RPC-serialized; a cycle or BigInt would throw there.
  try {
    JSON.stringify(schema);
  } catch {
    return '`manifest.inputSchema` must be JSON-serializable (no cycles or BigInt)';
  }
  return null;
}

function validateManifest(mod: ToolModule, file: string): LoadError | null {
  const m = mod?.manifest;
  if (!m || typeof m.name !== 'string' || typeof m.description !== 'string') {
    return { file, message: 'Invalid or missing `manifest` (need name, description, inputSchema)' };
  }
  const schemaError = validateInputSchema(m.inputSchema);
  if (schemaError) return { file, message: schemaError };
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
  const files = entries.filter((f) => f.endsWith('.mjs') && !skip.has(f)).sort();

  // Import in PARALLEL so N hung files time out concurrently (~importTimeoutMs total) instead of
  // sequentially (N × timeout) — otherwise many bad files race the outer catalog deadline and the
  // whole scan fails instead of surfacing per-file load errors.
  const settled = await Promise.all(
    files.map(async (file) => {
      try {
        const mod = await importWithTimeout(deps.importModule(path.join(dir, file)), importTimeoutMs, file);
        return { file, ok: true as const, mod };
      } catch (err) {
        return { file, ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  // Process in sorted order so duplicate-name resolution stays deterministic (first file wins).
  for (const result of settled) {
    if (!result.ok) {
      errors.push({ file: result.file, message: result.error });
      continue;
    }
    const { file, mod } = result;
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
  }

  return { tools, errors };
}
