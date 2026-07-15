import { spawn } from 'child_process';
import { createHash } from 'crypto';

import { acquireCursorAgentSpawnLock } from './cursorAgentSpawnLock';
import { resolveCursorLaunch } from './cursorLaunch';
import { forceKillCursorProcessTree } from './cursorProcessKill';

// Minimal, safe set used before any live discovery completes. Never empty so
// the picker always has something selectable. composer-1 is a real model (not
// an alias for auto), so it stays in the list.
export const STATIC_FALLBACK_MODEL_IDS: readonly string[] = [
  'auto',
  'composer-2',
  'composer-2-fast',
  'composer-1.5',
  'composer-1',
];

interface CursorModelCatalogEntry {
  ids: string[];
  fetchedAt: number;
}

const LIST_MODELS_TIMEOUT_MS = 10_000;
/** Discovery cache TTL — stale entries fall back until refresh succeeds. */
export const CURSOR_MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;
// Cursor model ids are alphanumeric plus `.`, `-`, `/`. Trailing `:` is
// disallowed so the `Tip:` footer line cursor-agent prints does not leak into
// the catalog (it would otherwise satisfy the regex).
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]*$/;
const TEXT_HEADER_PATTERN = /available models|models?:?$/i;
// cursor-agent prints a trailing `Tip: use --model <id> ...` hint that must be
// skipped before id extraction. The check is exact-prefix to avoid matching a
// plausible model id that happens to contain "tip".
const TEXT_FOOTER_PATTERN = /^tip\s*:/i;

function extractIdFromObject(entry: Record<string, unknown>): string | null {
  for (const key of ['modelId', 'id', 'model']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) {
      const candidate = value.trim();
      return MODEL_ID_PATTERN.test(candidate) ? candidate : null;
    }
  }
  const name = entry.name;
  if (typeof name === 'string' && MODEL_ID_PATTERN.test(name.trim())) {
    return name.trim();
  }
  return null;
}

function parseJsonModelList(stdout: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }

  const source = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { models?: unknown })?.models)
      ? (parsed as { models: unknown[] }).models
      : null;
  if (!source) {
    return null;
  }

  const ids: string[] = [];
  for (const entry of source) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (MODEL_ID_PATTERN.test(trimmed)) {
        ids.push(trimmed);
      }
    } else if (entry && typeof entry === 'object') {
      const id = extractIdFromObject(entry as Record<string, unknown>);
      if (id) {
        ids.push(id);
      }
    }
  }

  return ids;
}

function parseTextModelList(stdout: string): string[] {
  const ids: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (TEXT_FOOTER_PATTERN.test(line)) {
      continue;
    }

    // Strip common bullet markers.
    line = line.replace(/^[*\-•]\s*/, '').trim();
    // Strip trailing markers like "(current)" / "(default)".
    line = line.replace(/\s*\((?:current|default)\)\s*$/i, '').trim();

    if (!line || TEXT_HEADER_PATTERN.test(line)) {
      continue;
    }

    // The native format is `<id> - <pretty label>`. Prefer the explicit
    // separator so labels with their own spaces or hyphens never bleed in.
    // Fall back to the first whitespace-separated token for lenient parsers.
    const dashIdx = line.indexOf(' - ');
    const candidate = dashIdx > 0 ? line.slice(0, dashIdx) : line.split(/\s+/)[0];
    const token = candidate.trim();
    if (token && MODEL_ID_PATTERN.test(token)) {
      ids.push(token);
    }
  }
  return ids;
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Opaque cache identity scoped to the CLI, account, and backend. The raw path
 * and URL may contain usernames, credentials, or query tokens, so only this
 * digest is persisted to the vault cache. */
function cursorEnvironmentValue(env: Record<string, string>, key: string): string {
  if (process.platform !== 'win32') {
    return env[key] ?? '';
  }
  const match = Object.entries(env).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return match?.[1] ?? '';
}

export function buildCursorModelCatalogCliKey(
  cliPath: string,
  env: Record<string, string>,
): string {
  const slashPath = cliPath.trim().replace(/\\/g, '/');
  const normalizedPath = process.platform === 'win32' ? slashPath.toLowerCase() : slashPath;
  const rawBaseUrl = cursorEnvironmentValue(env, 'CURSOR_BASE_URL').trim();
  let baseUrl = rawBaseUrl;
  try {
    baseUrl = new URL(rawBaseUrl).toString();
  } catch {
    // Empty and non-standard endpoint values are still stable identity inputs.
  }
  const identity = [
    normalizedPath,
    cursorEnvironmentValue(env, 'CURSOR_API_KEY'),
    cursorEnvironmentValue(env, 'CURSOR_SESSION_TOKEN'),
    baseUrl,
  ].join('\0');
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return `cursor-cli:${digest}`;
}

function isCatalogFresh(entry: CursorModelCatalogEntry): boolean {
  return Date.now() - entry.fetchedAt <= CURSOR_MODEL_CATALOG_TTL_MS;
}

export class CursorModelCatalogCache {
  private readonly entries = new Map<string, CursorModelCatalogEntry>();
  private readonly inFlight = new Map<string, Promise<string[]>>();

  get(cliKey?: string): string[] {
    const entry = cliKey ? this.entries.get(cliKey) : undefined;
    return entry && entry.ids.length > 0 && isCatalogFresh(entry)
      ? [...entry.ids]
      : [...STATIC_FALLBACK_MODEL_IDS];
  }

  isFresh(cliKey?: string): boolean {
    const entry = cliKey ? this.entries.get(cliKey) : undefined;
    return Boolean(entry?.ids.length && isCatalogFresh(entry));
  }

  refresh(cliKey: string, loader: () => Promise<string[]>): Promise<string[]> {
    const active = this.inFlight.get(cliKey);
    if (active) {
      return active;
    }

    const refresh = (async () => {
      try {
        const ids = await loader();
        if (ids.length > 0) {
          this.seed(cliKey, ids);
        }
      } catch {
        // A failed probe must not destroy the last good catalog.
      }
      return this.get(cliKey);
    })();
    this.inFlight.set(cliKey, refresh);
    void refresh.finally(() => {
      if (this.inFlight.get(cliKey) === refresh) {
        this.inFlight.delete(cliKey);
      }
    });
    return refresh;
  }

  reset(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  seed(cliKey: string, ids: readonly string[]): void {
    this.entries.set(cliKey, { ids: [...ids], fetchedAt: Date.now() });
  }
}

const modelCatalog = new CursorModelCatalogCache();
let testCatalogKey: string | null = null;

/**
 * Parses `cursor-agent --list-models` output. Tries JSON first (array of
 * strings, or array/object-wrapped objects carrying id/name/model), then falls
 * back to plain-text/bulleted parsing. Exported for unit testing.
 */
export function parseModelListOutput(stdout: string): string[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  const jsonIds = parseJsonModelList(trimmed);
  const ids = jsonIds ?? parseTextModelList(trimmed);
  return dedupe(ids);
}

function collectListModelsOutput(
  cliPath: string,
  env: Record<string, string>,
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const launch = resolveCursorLaunch(cliPath, ['--list-models']);
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: launch.extraEnv ? { ...env, ...launch.extraEnv } : env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      ...(launch.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });

    let stdout = '';
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      // This is a timed-out background probe, so reap the whole tree at once
      // rather than a SIGTERM the CLI (or a descendant) may ignore on Windows.
      void forceKillCursorProcessTree(child).finally(() => {
        reject(new Error('Timed out listing Cursor models'));
      });
    }, LIST_MODELS_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      }
    });

    child.on('close', () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(stdout);
      }
    });
  });
}

async function runListModels(
  cliPath: string,
  env: Record<string, string>,
  cwd: string,
): Promise<string> {
  const releaseSpawnLock = await acquireCursorAgentSpawnLock();
  try {
    return await collectListModelsOutput(cliPath, env, cwd);
  } finally {
    releaseSpawnLock();
  }
}

/**
 * Spawns the Cursor CLI to discover available models and refreshes the module
 * cache. On any error or empty result the existing good cache (or the static
 * fallback) is preserved and returned — discovery never destroys known ids.
 */
export async function refreshCursorModelCatalog(
  cliPath: string,
  env: Record<string, string>,
  cwd: string = process.cwd(),
): Promise<string[]> {
  if (!cliPath?.trim()) {
    return getCachedCursorModelIds(cliPath, env);
  }

  const cliKey = buildCursorModelCatalogCliKey(cliPath, env);
  return modelCatalog.refresh(cliKey, async () => {
    const stdout = await runListModels(cliPath, env, cwd);
    return parseModelListOutput(stdout);
  });
}

/** Returns cached discovered ids when fresh for this CLI, else the static fallback. */
export function getCachedCursorModelIds(
  cliPath?: string,
  env?: Record<string, string>,
): string[] {
  const cliKey = cliPath && env
    ? buildCursorModelCatalogCliKey(cliPath, env)
    : testCatalogKey ?? undefined;
  return modelCatalog.get(cliKey);
}

/** Whether the in-memory catalog is a fresh discovery (not static fallback). */
export function isCursorModelCatalogDiscoveryFresh(
  cliPath?: string,
  env?: Record<string, string>,
): boolean {
  const cliKey = cliPath && env
    ? buildCursorModelCatalogCliKey(cliPath, env)
    : testCatalogKey ?? undefined;
  return modelCatalog.isFresh(cliKey);
}

/** Clears the module cache. Test-only. */
export function resetCursorModelCatalog(): void {
  modelCatalog.reset();
  testCatalogKey = null;
}

/** Seeds the module cache with explicit ids. Test-only. */
export function seedCursorModelCatalogForTest(ids: readonly string[], cliKey = 'test-cli|noauth|'): void {
  modelCatalog.seed(cliKey, ids);
  testCatalogKey = cliKey;
}
