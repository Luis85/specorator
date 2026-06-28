# Local Tool Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bundled stdio MCP server (`tool-host.mjs`) that the Claude provider spawns, which exposes user-authored `.mjs` scripts in `.specorator/tools/` as callable tools — opt-in, Node-required, with no in-plugin code evaluation.

**Architecture:** User scripts run inside a **separately-bundled `node` subprocess** loaded via native `import()` — never `Function`/`eval` in the plugin renderer (the blocker that reverted the 1.13 tool library; see `docs/superpowers/specs/2026-06-28-local-tool-host-mcp-design.md`). The host has two modes: **catalog** (`--catalog`: scan + print JSON of discovered tools/errors, then exit — used by the plugin to populate the settings list without executing code in-renderer) and **serve** (default: run the MCP stdio server). The plugin injects a synthetic `mcpServers['specorator']` stdio config into the Claude SDK at the existing cold-start and dynamic-update seams.

**Tech Stack:** TypeScript, esbuild (second `node`/`esm` build target), `@modelcontextprotocol/sdk` (low-level `Server` API, already a dependency at `~1.29.0`), Obsidian plugin API, Jest (unit + integration).

**Verification gate (run after every phase; hard gate at the end):**
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

---

## File Structure (blast radius)

**New — tool host (bundled to `tool-host.mjs`):**
- `src/tool-host/handlerResult.ts` — normalize handler return (string | MCP object) → `CallToolResult`.
- `src/tool-host/vaultContext.ts` — path-safe `ctx.vault` (read/write/exists/list, traversal-guarded).
- `src/tool-host/logger.ts` — `ctx.logger` (tool-tagged lines → `.specorator/tool-host.log` + stderr).
- `src/tool-host/runHandler.ts` — `try/catch` + timeout wrapper → `CallToolResult`.
- `src/tool-host/loadTools.ts` — discover `.mjs`, import via an injected importer, validate manifests → `{ tools, errors }`.
- `src/tool-host/catalog.ts` — build catalog JSON payload from a load result.
- `src/tool-host/server.ts` — wire the MCP low-level `Server` (ListTools/CallTool) over stdio.
- `src/tool-host/index.ts` — entry: parse argv, dispatch catalog vs serve.
- `src/tool-host/types.ts` — `ToolManifest`, `ToolModule`, `LoadedTool`, `LoadError`, `ToolHandlerCtx`, `CatalogPayload`.

**New — plugin side (Claude):**
- `src/providers/claude/toolHost/toolHostPaths.ts` — resolve absolute `tool-host.mjs` path, tools dir, node executable.
- `src/providers/claude/toolHost/ToolHostCatalog.ts` — spawn catalog mode, parse JSON → `{ tools, errors }`.
- `src/providers/claude/toolHost/buildToolHostServer.ts` — build the serve-mode stdio `McpServerConfig` (command/args/env + resolved secrets + disabled filter).
- `src/providers/claude/ui/localToolHostWidget.ts` — `mountClaudeLocalToolHostSection`.

**Modified:**
- `esbuild.config.mjs` — second build target + copy `tool-host.mjs`.
- `src/providers/claude/settings.ts` — `localToolHostEnabled` + `localToolHostDisabledTools`.
- `src/providers/claude/ui/claudeSettingsWidgets.ts` + `ClaudeSettingsTab.ts` — register + mount the section.
- `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts` — inject synthetic server (cold start).
- `src/providers/claude/runtime/ClaudeDynamicUpdates.ts` — inject synthetic server (dynamic update).
- `src/providers/claude/runtime/ClaudeChatRuntime.ts` — supply the `buildLocalToolHostServer` closure into both seams.
- i18n: `src/i18n/types/settings.ts` (or nearest) + all 10 locales — `settings.localToolHost.*`.
- `CLAUDE.md`, `src/core/CLAUDE.md` — storage rows.
- `scripts/check-artifacts.mjs` (if it asserts an artifact list) — add `tool-host.mjs`.
- `scripts/release.mjs` — `const ASSETS` list (currently `['main.js', 'manifest.json', 'styles.css']`) must include `tool-host.mjs`, or released/marketplace installs ship without the host and enabling local tools spawns a missing entrypoint.
- `.github/workflows/release.yml` — both `files:` upload lists must include `tool-host.mjs`.

**Tests (mirrored):**
- `tests/unit/tool-host/*.test.ts`
- `tests/unit/providers/claude/toolHost/*.test.ts`
- `tests/integration/providers/claude/localToolHostInjection.test.ts`

---

## Phase 0 — Baseline

### Task 0: Confirm green starting point

- [ ] **Step 1:** Confirm branch is `claude/custom-tools-local-mcp-ub526m` (already created).

Run: `git branch --show-current`
Expected: `claude/custom-tools-local-mcp-ub526m`

- [ ] **Step 2:** Confirm starting state builds.

Run: `npm run typecheck && npm run build`
Expected: PASS (emits `main.js`).

---

## Phase 1 — The tool host subprocess

### Task 1: Host types

**Files:**
- Create: `src/tool-host/types.ts`

- [ ] **Step 1: Write the types** (no test — pure declarations).

```ts
// src/tool-host/types.ts
/** MCP tool result content block (text-only for v1). */
export interface McpTextContent {
  type: 'text';
  text: string;
}

/** Raw MCP CallTool result a handler may return directly. */
export interface CallToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

/** JSON Schema object describing a tool's input (passed straight to MCP). */
export type JsonSchema = Record<string, unknown>;

export interface ToolManifest {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** SecretStorage-backed secret ids this tool needs (exposed via ctx.secrets). */
  secrets?: string[];
}

export interface ToolHandlerCtx {
  vaultPath: string;
  vault: {
    read(relPath: string): Promise<string>;
    write(relPath: string, content: string): Promise<void>;
    exists(relPath: string): Promise<boolean>;
    list(relPath: string): Promise<string[]>;
  };
  logger: {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  secrets: Record<string, string>;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolHandlerCtx,
) => Promise<string | CallToolResult> | string | CallToolResult;

export interface ToolModule {
  manifest: ToolManifest;
  handler: ToolHandler;
}

export interface LoadedTool {
  file: string;
  manifest: ToolManifest;
  handler: ToolHandler;
}

export interface LoadError {
  file: string;
  message: string;
}

export interface LoadResult {
  tools: LoadedTool[];
  errors: LoadError[];
}

export interface CatalogPayload {
  tools: Array<{ file: string; name: string; description: string; secrets: string[] }>;
  errors: LoadError[];
}
```

- [ ] **Step 2: Commit.**

```bash
git add src/tool-host/types.ts
git commit -m "feat(tool-host): host type contracts"
```

### Task 2: `handlerResult` — normalize handler return

**Files:**
- Create: `src/tool-host/handlerResult.ts`
- Test: `tests/unit/tool-host/handlerResult.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/tool-host/handlerResult.test.ts
import { toCallToolResult } from '@/tool-host/handlerResult';

describe('toCallToolResult', () => {
  it('wraps a string into a text content result', () => {
    expect(toCallToolResult('hi')).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });

  it('passes a well-formed MCP object through unchanged', () => {
    const obj = { content: [{ type: 'text' as const, text: 'x' }], isError: true };
    expect(toCallToolResult(obj)).toBe(obj);
  });

  it('coerces a non-string, non-result value to JSON text', () => {
    expect(toCallToolResult({ a: 1 } as unknown as string)).toEqual({
      content: [{ type: 'text', text: '{"a":1}' }],
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`toCallToolResult` not defined).

Run: `npm test -- tests/unit/tool-host/handlerResult.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/handlerResult.ts
import type { CallToolResult } from './types';

function isCallToolResult(value: unknown): value is CallToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/** Normalize a handler's return value into an MCP CallToolResult. */
export function toCallToolResult(value: unknown): CallToolResult {
  if (typeof value === 'string') {
    return { content: [{ type: 'text', text: value }] };
  }
  if (isCallToolResult(value)) {
    return value;
  }
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- tests/unit/tool-host/handlerResult.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/handlerResult.ts tests/unit/tool-host/handlerResult.test.ts
git commit -m "feat(tool-host): normalize handler return to CallToolResult"
```

### Task 3: `vaultContext` — path-safe vault reader/writer

**Files:**
- Create: `src/tool-host/vaultContext.ts`
- Test: `tests/unit/tool-host/vaultContext.test.ts`

- [ ] **Step 1: Write the failing test.** (Uses a real temp dir via `node:os` tmpdir + `node:fs`.)

```ts
// tests/unit/tool-host/vaultContext.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVaultContext } from '@/tool-host/vaultContext';

describe('createVaultContext', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'vault-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writes then reads a vault-relative file, creating parent dirs', async () => {
    const vault = createVaultContext(root);
    await vault.write('a/b/note.md', 'hello');
    expect(await vault.exists('a/b/note.md')).toBe(true);
    expect(await vault.read('a/b/note.md')).toBe('hello');
  });

  it('lists files in a folder', async () => {
    const vault = createVaultContext(root);
    await vault.write('dir/one.md', '1');
    await vault.write('dir/two.md', '2');
    expect((await vault.list('dir')).sort()).toEqual(['one.md', 'two.md']);
  });

  it('rejects a traversal path that escapes the root', async () => {
    const vault = createVaultContext(root);
    await expect(vault.read('../escape.md')).rejects.toThrow(/outside the vault/i);
    await expect(vault.write('../../x', 'y')).rejects.toThrow(/outside the vault/i);
  });

  it('rejects an absolute path', async () => {
    const vault = createVaultContext(root);
    await expect(vault.read('/etc/passwd')).rejects.toThrow(/outside the vault/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- tests/unit/tool-host/vaultContext.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/vaultContext.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ToolHandlerCtx } from './types';

/** Resolve a vault-relative path, throwing if it escapes the vault root. */
function safeResolve(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${relPath}" is outside the vault root`);
  }
  return resolved;
}

export function createVaultContext(vaultPath: string): ToolHandlerCtx['vault'] {
  return {
    async read(relPath) {
      return fs.readFile(safeResolve(vaultPath, relPath), 'utf8');
    },
    async write(relPath, content) {
      const abs = safeResolve(vaultPath, relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
    },
    async exists(relPath) {
      try {
        await fs.access(safeResolve(vaultPath, relPath));
        return true;
      } catch {
        return false;
      }
    },
    async list(relPath) {
      const entries = await fs.readdir(safeResolve(vaultPath, relPath), { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- tests/unit/tool-host/vaultContext.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/vaultContext.ts tests/unit/tool-host/vaultContext.test.ts
git commit -m "feat(tool-host): path-safe vault context"
```

### Task 4: `logger` — tool-tagged logger

**Files:**
- Create: `src/tool-host/logger.ts`
- Test: `tests/unit/tool-host/logger.test.ts`

- [ ] **Step 1: Write the failing test.** (Inject a sink + a clock so the test is deterministic — no real file or `Date`.)

```ts
// tests/unit/tool-host/logger.test.ts
import { createLogger } from '@/tool-host/logger';

describe('createLogger', () => {
  it('emits tool-tagged, level-prefixed lines to the sink', () => {
    const lines: string[] = [];
    const log = createLogger('word_count', { sink: (l) => lines.push(l), now: () => 'T' });
    log.info('counted', { n: 3 });
    log.error('boom');
    expect(lines).toEqual([
      'T [info] [word_count] counted {"n":3}',
      'T [error] [word_count] boom',
    ]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- tests/unit/tool-host/logger.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/logger.ts
import { appendFileSync } from 'node:fs';
import type { ToolHandlerCtx } from './types';

export interface LoggerOptions {
  /** Where each formatted line goes. Default: stderr + append to logFilePath. */
  sink?: (line: string) => void;
  /** Timestamp source (injectable for tests). Default: ISO string. */
  now?: () => string;
  /** Absolute path of the host log file (used by the default sink). */
  logFilePath?: string;
}

function format(now: string, level: string, tool: string, message: string, data?: unknown): string {
  const tail = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  return `${now} [${level}] [${tool}] ${message}${tail}`;
}

export function createLogger(tool: string, options: LoggerOptions = {}): ToolHandlerCtx['logger'] {
  const now = options.now ?? (() => new Date().toISOString());
  const sink =
    options.sink ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
      if (options.logFilePath) {
        try {
          appendFileSync(options.logFilePath, `${line}\n`, 'utf8');
        } catch {
          /* logging must never throw */
        }
      }
    });
  const emit = (level: string, message: string, data?: unknown) =>
    sink(format(now(), level, tool, message, data));
  return {
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- tests/unit/tool-host/logger.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/logger.ts tests/unit/tool-host/logger.test.ts
git commit -m "feat(tool-host): tool-tagged logger"
```

### Task 5: `runHandler` — try/catch + timeout

**Files:**
- Create: `src/tool-host/runHandler.ts`
- Test: `tests/unit/tool-host/runHandler.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/tool-host/runHandler.test.ts
import { runHandler } from '@/tool-host/runHandler';
import type { ToolHandlerCtx } from '@/tool-host/types';

const ctx = {} as ToolHandlerCtx;

describe('runHandler', () => {
  it('returns the normalized result of a successful handler', async () => {
    const res = await runHandler(async () => 'ok', {}, ctx, 1000);
    expect(res).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('returns isError when the handler throws', async () => {
    const res = await runHandler(async () => { throw new Error('nope'); }, {}, ctx, 1000);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/nope/);
  });

  it('returns isError when the handler exceeds the timeout', async () => {
    const slow = () => new Promise<string>((r) => setTimeout(() => r('late'), 50));
    const res = await runHandler(slow, {}, ctx, 5);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/timed out/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- tests/unit/tool-host/runHandler.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/runHandler.ts
import { toCallToolResult } from './handlerResult';
import type { CallToolResult, ToolHandler, ToolHandlerCtx } from './types';

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export async function runHandler(
  handler: ToolHandler,
  input: Record<string, unknown>,
  ctx: ToolHandlerCtx,
  timeoutMs: number,
): Promise<CallToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Handler timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const value = await Promise.race([Promise.resolve(handler(input, ctx)), timeout]);
    return toCallToolResult(value);
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- tests/unit/tool-host/runHandler.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/runHandler.ts tests/unit/tool-host/runHandler.test.ts
git commit -m "feat(tool-host): handler try/catch + timeout wrapper"
```

### Task 6: `loadTools` — discover + import + validate

**Files:**
- Create: `src/tool-host/loadTools.ts`
- Test: `tests/unit/tool-host/loadTools.test.ts`

Inject the directory reader and the module importer so the test never touches real ESM `import()`.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/tool-host/loadTools.test.ts
import { loadTools } from '@/tool-host/loadTools';
import type { ToolModule } from '@/tool-host/types';

const goodModule: ToolModule = {
  manifest: { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
  handler: async () => 'ok',
};

describe('loadTools', () => {
  it('loads valid .mjs modules and ignores non-.mjs files', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['a.mjs', 'README.md'],
      importModule: async () => goodModule,
    });
    expect(res.tools.map((t) => t.manifest.name)).toEqual(['word_count']);
    expect(res.errors).toEqual([]);
  });

  it('records an error for a module missing a manifest, without sinking others', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['bad.mjs', 'good.mjs'],
      importModule: async (p) =>
        p.endsWith('good.mjs') ? goodModule : ({} as ToolModule),
    });
    expect(res.tools.map((t) => t.file)).toEqual(['good.mjs']);
    expect(res.errors).toEqual([{ file: 'bad.mjs', message: expect.stringMatching(/manifest/i) }]);
  });

  it('records an error when import throws', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['x.mjs'],
      importModule: async () => { throw new Error('syntax'); },
    });
    expect(res.tools).toEqual([]);
    expect(res.errors[0]).toEqual({ file: 'x.mjs', message: expect.stringMatching(/syntax/) });
  });

  it('returns empty when the directory does not exist', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); },
      importModule: async () => goodModule,
    });
    expect(res).toEqual({ tools: [], errors: [] });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- tests/unit/tool-host/loadTools.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/loadTools.ts
import path from 'node:path';
import type { LoadResult, LoadedTool, LoadError, ToolModule } from './types';

export interface LoadDeps {
  readdir: (dir: string) => Promise<string[]>;
  importModule: (absPath: string) => Promise<ToolModule>;
}

function validateManifest(mod: ToolModule, file: string): LoadError | null {
  const m = mod?.manifest;
  if (!m || typeof m.name !== 'string' || typeof m.description !== 'string' || typeof m.inputSchema !== 'object') {
    return { file, message: 'Invalid or missing `manifest` (need name, description, inputSchema)' };
  }
  if (typeof mod.handler !== 'function') {
    return { file, message: 'Missing `handler` export (must be a function)' };
  }
  return null;
}

export async function loadTools(dir: string, deps: LoadDeps): Promise<LoadResult> {
  let entries: string[];
  try {
    entries = await deps.readdir(dir);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return { tools: [], errors: [] };
    throw err;
  }

  const tools: LoadedTool[] = [];
  const errors: LoadError[] = [];

  for (const file of entries.filter((f) => f.endsWith('.mjs')).sort()) {
    try {
      const mod = await deps.importModule(path.join(dir, file));
      const invalid = validateManifest(mod, file);
      if (invalid) {
        errors.push(invalid);
        continue;
      }
      tools.push({ file, manifest: mod.manifest, handler: mod.handler });
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { tools, errors };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- tests/unit/tool-host/loadTools.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/loadTools.ts tests/unit/tool-host/loadTools.test.ts
git commit -m "feat(tool-host): discover + import + validate user tool modules"
```

### Task 7: `catalog` — build catalog payload

**Files:**
- Create: `src/tool-host/catalog.ts`
- Test: `tests/unit/tool-host/catalog.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/tool-host/catalog.test.ts
import { buildCatalog } from '@/tool-host/catalog';
import type { LoadResult } from '@/tool-host/types';

describe('buildCatalog', () => {
  it('maps a load result to file/name/description/secrets plus errors', () => {
    const load: LoadResult = {
      tools: [{ file: 'a.mjs', manifest: { name: 'a', description: 'da', inputSchema: {}, secrets: ['K'] }, handler: async () => '' }],
      errors: [{ file: 'b.mjs', message: 'bad' }],
    };
    expect(buildCatalog(load)).toEqual({
      tools: [{ file: 'a.mjs', name: 'a', description: 'da', secrets: ['K'] }],
      errors: [{ file: 'b.mjs', message: 'bad' }],
    });
  });

  it('defaults secrets to an empty array when the manifest omits them', () => {
    const load: LoadResult = {
      tools: [{ file: 'c.mjs', manifest: { name: 'c', description: 'dc', inputSchema: {} }, handler: async () => '' }],
      errors: [],
    };
    expect(buildCatalog(load).tools[0].secrets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- tests/unit/tool-host/catalog.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/catalog.ts
import type { CatalogPayload, LoadResult } from './types';

export function buildCatalog(load: LoadResult): CatalogPayload {
  return {
    tools: load.tools.map((t) => ({
      file: t.file,
      name: t.manifest.name,
      description: t.manifest.description,
      secrets: t.manifest.secrets ?? [],
    })),
    errors: load.errors,
  };
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- tests/unit/tool-host/catalog.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/catalog.ts tests/unit/tool-host/catalog.test.ts
git commit -m "feat(tool-host): catalog payload builder"
```

### Task 8: `server` — wire MCP low-level Server

**Files:**
- Create: `src/tool-host/server.ts`
- Test: `tests/unit/tool-host/server.test.ts`

The MCP SDK's high-level `McpServer.registerTool` expects a Zod shape; we want **plain JSON Schema**, so use the low-level `Server` with `ListToolsRequestSchema` / `CallToolRequestSchema` handlers. To keep this testable without a transport, export `buildToolHandlers(tools, ctxFactory, timeoutMs)` returning the two handler functions, and a thin `createServer` that registers them.

- [ ] **Step 1: Write the failing test** (tests the handler logic, not the SDK transport).

```ts
// tests/unit/tool-host/server.test.ts
import { buildToolHandlers } from '@/tool-host/server';
import type { LoadedTool, ToolHandlerCtx } from '@/tool-host/types';

const ctx = { logger: { info() {}, warn() {}, error() {} } } as unknown as ToolHandlerCtx;

const tool: LoadedTool = {
  file: 'wc.mjs',
  manifest: { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
  handler: async (input) => String((input.text as string).split(' ').length),
};

describe('buildToolHandlers', () => {
  it('lists registered tools with their JSON Schema', async () => {
    const { listTools } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await listTools();
    expect(res.tools).toEqual([
      { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
    ]);
  });

  it('routes a CallTool request to the matching handler', async () => {
    const { callTool } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await callTool({ params: { name: 'word_count', arguments: { text: 'a b c' } } });
    expect(res).toEqual({ content: [{ type: 'text', text: '3' }] });
  });

  it('returns isError for an unknown tool name', async () => {
    const { callTool } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await callTool({ params: { name: 'missing', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/unknown tool/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- tests/unit/tool-host/server.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/tool-host/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runHandler } from './runHandler';
import type { CallToolResult, LoadedTool, ToolHandlerCtx } from './types';

interface CallToolRequest {
  params: { name: string; arguments?: Record<string, unknown> };
}

export function buildToolHandlers(
  tools: LoadedTool[],
  ctxFactory: (toolName: string) => ToolHandlerCtx,
  timeoutMs: number,
) {
  const byName = new Map(tools.map((t) => [t.manifest.name, t]));
  return {
    async listTools() {
      return {
        tools: tools.map((t) => ({
          name: t.manifest.name,
          description: t.manifest.description,
          inputSchema: t.manifest.inputSchema,
        })),
      };
    },
    async callTool(req: CallToolRequest): Promise<CallToolResult> {
      const tool = byName.get(req.params.name);
      if (!tool) {
        return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
      }
      return runHandler(tool.handler, req.params.arguments ?? {}, ctxFactory(tool.manifest.name), timeoutMs);
    },
  };
}

export async function createServer(
  tools: LoadedTool[],
  ctxFactory: (toolName: string) => ToolHandlerCtx,
  timeoutMs: number,
): Promise<void> {
  const handlers = buildToolHandlers(tools, ctxFactory, timeoutMs);
  const server = new Server({ name: 'specorator', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => handlers.listTools());
  server.setRequestHandler(CallToolRequestSchema, (req) => handlers.callTool(req as CallToolRequest));
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- tests/unit/tool-host/server.test.ts`

> If `setRequestHandler`'s typing rejects the `CallToolRequest` cast, keep the `as CallToolRequest` cast — the SDK's request type is structurally compatible for `params.name`/`params.arguments`.

- [ ] **Step 5: Commit.**

```bash
git add src/tool-host/server.ts tests/unit/tool-host/server.test.ts
git commit -m "feat(tool-host): MCP server wiring (JSON Schema via low-level Server)"
```

### Task 9: `index` — entry + mode dispatch

**Files:**
- Create: `src/tool-host/index.ts`

No unit test (it's the I/O composition root — covered by the build smoke in Task 10 and integration in Task 21). It reads config from env, builds the per-tool `ctx`, and dispatches.

- [ ] **Step 1: Implement the entry.**

```ts
// src/tool-host/index.ts
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildCatalog } from './catalog';
import { createLogger } from './logger';
import { createServer } from './server';
import { createVaultContext } from './vaultContext';
import { loadTools } from './loadTools';
import type { ToolHandlerCtx, ToolModule } from './types';

const HANDLER_TIMEOUT_MS = 30_000;

function env(name: string): string {
  return process.env[name] ?? '';
}

async function main(): Promise<void> {
  const toolsDir = env('SPECORATOR_TOOLS_DIR');
  const vaultPath = env('SPECORATOR_VAULT_PATH');
  const disabled = new Set(env('SPECORATOR_DISABLED_TOOLS').split(',').map((s) => s.trim()).filter(Boolean));
  const logFilePath = vaultPath ? path.join(vaultPath, '.specorator', 'tool-host.log') : undefined;

  const load = await loadTools(toolsDir, {
    readdir: (dir) => fs.readdir(dir),
    importModule: (p) => import(pathToFileURL(p).href) as Promise<ToolModule>,
  });
  const active = load.tools.filter((t) => !disabled.has(t.manifest.name));

  if (process.argv.includes('--catalog')) {
    process.stdout.write(JSON.stringify(buildCatalog(load)));
    return;
  }

  const ctxFactory = (toolName: string): ToolHandlerCtx => {
    const secrets: Record<string, string> = {};
    const tool = active.find((t) => t.manifest.name === toolName);
    for (const id of tool?.manifest.secrets ?? []) {
      const v = process.env[`SPECORATOR_SECRET_${id}`];
      if (v !== undefined) secrets[id] = v;
    }
    return {
      vaultPath,
      vault: createVaultContext(vaultPath),
      logger: createLogger(toolName, { logFilePath }),
      secrets,
    };
  };

  await createServer(active, ctxFactory, HANDLER_TIMEOUT_MS);
}

main().catch((err) => {
  process.stderr.write(`tool-host fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Commit.**

```bash
git add src/tool-host/index.ts
git commit -m "feat(tool-host): entry with catalog/serve mode dispatch"
```

### Task 10: esbuild second target → `tool-host.mjs`

**Files:**
- Modify: `esbuild.config.mjs`

- [ ] **Step 1: Add a second build before the watch/rebuild dispatch.** Insert immediately after the `context` definition (after line 165), before the `if (prod)` block:

```js
// Second target: the tool host runs as a standalone Node ESM subprocess.
// It bundles @modelcontextprotocol/sdk and must NOT carry obsidian/electron.
const toolHostBuildOptions = {
  entryPoints: ['src/tool-host/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  logLevel: 'info',
  outfile: 'tool-host.mjs',
};
```

- [ ] **Step 2: Extend `copyToObsidian`'s file list** so the host ships alongside `main.js`. Change line 122:

```js
      const files = ['main.js', 'manifest.json', 'styles.css', 'tool-host.mjs'];
```

- [ ] **Step 3: Build the host in both prod and watch paths.** Replace the final `if (prod) { ... } else { ... }` block (lines 167–172) with:

```js
const toolHostContext = await esbuild.context(toolHostBuildOptions);

if (prod) {
  await context.rebuild();
  await toolHostContext.rebuild();
  process.exit(0);
} else {
  await context.watch();
  await toolHostContext.watch();
}
```

> Note: `copyToObsidian` is attached to the `main.js` build's `onEnd`. In watch mode the host file is emitted by its own context to the repo root; the copy step picks it up on the next `main.js` rebuild. For a one-shot `npm run build` (prod) the host is emitted before `process.exit`, so `check:artifacts` (Task, below) sees it.

- [ ] **Step 4: Build and verify the artifact exists.**

Run: `npm run build && ls -la tool-host.mjs`
Expected: `tool-host.mjs` exists at repo root; build prints no errors.

- [ ] **Step 5: Confirm the host has no obsidian/electron references** (sanity that the externals are right):

Run: `node -e "const s=require('fs').readFileSync('tool-host.mjs','utf8'); if(/require\(['\"]obsidian['\"]\)|from ['\"]obsidian['\"]/.test(s)) { console.error('LEAK: obsidian in tool-host'); process.exit(1);} console.log('clean');"`
Expected: `clean`

- [ ] **Step 6: Update `check:artifacts` if it asserts an artifact list.** Open `scripts/check-artifacts.mjs`; if it checks a fixed file list, add `'tool-host.mjs'`. If it only checks `main.js`, leave it.

Run: `npm run check:artifacts`
Expected: PASS.

- [ ] **Step 7: Ship the host in release assets.** Without this, a GitHub/marketplace release uploads only `main.js`/`manifest.json`/`styles.css`, so `resolveToolHostPaths` (Task 12) points at a `tool-host.mjs` that was never published.

In `scripts/release.mjs`, extend the assets constant:

```js
const ASSETS = ['main.js', 'manifest.json', 'styles.css', 'tool-host.mjs'];
```

In `.github/workflows/release.yml`, add `tool-host.mjs` to **both** `files:` upload lists (the two blocks currently listing `main.js` / `manifest.json` / `styles.css`):

```yaml
          files: |
            main.js
            manifest.json
            styles.css
            tool-host.mjs
```

- [ ] **Step 8: Commit.**

```bash
git add esbuild.config.mjs scripts/check-artifacts.mjs scripts/release.mjs .github/workflows/release.yml
git commit -m "build: bundle + release tool-host.mjs as a standalone node esm target"
```

---

## Phase 2 — Plugin settings & catalog

### Task 11: Settings fields

**Files:**
- Modify: `src/providers/claude/settings.ts`

- [ ] **Step 1: Add the two fields to the interface** (`ClaudeProviderSettings`, after `enableSonnet1M` on line 28):

```ts
  enableSonnet1M: boolean;
  localToolHostEnabled: boolean;
  localToolHostDisabledTools: string[];
```

- [ ] **Step 2: Add defaults** (in `DEFAULT_CLAUDE_PROVIDER_SETTINGS`, after `enableSonnet1M: false` on line 44):

```ts
  enableSonnet1M: false,
  localToolHostEnabled: false,
  localToolHostDisabledTools: [] as string[],
```

- [ ] **Step 3: Read them in `getClaudeProviderSettings`** (after the `enableSonnet1M` block, ~line 95):

```ts
    localToolHostEnabled: (config.localToolHostEnabled as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.localToolHostEnabled,
    localToolHostDisabledTools: Array.isArray(config.localToolHostDisabledTools)
      ? (config.localToolHostDisabledTools as string[])
      : [...DEFAULT_CLAUDE_PROVIDER_SETTINGS.localToolHostDisabledTools],
```

- [ ] **Step 4: Typecheck.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/providers/claude/settings.ts
git commit -m "feat(claude): local tool host settings fields"
```

### Task 12: `toolHostPaths` — resolve host path, tools dir, node

**Files:**
- Create: `src/providers/claude/toolHost/toolHostPaths.ts`
- Test: `tests/unit/providers/claude/toolHost/toolHostPaths.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/providers/claude/toolHost/toolHostPaths.test.ts
import path from 'node:path';
import { resolveToolHostPaths } from '@/providers/claude/toolHost/toolHostPaths';

describe('resolveToolHostPaths', () => {
  it('joins vault + plugin dir for the host entry and the tools dir', () => {
    const r = resolveToolHostPaths({ vaultPath: '/vault', pluginDir: '.obsidian/plugins/specorator' });
    expect(r.hostEntry).toBe(path.join('/vault', '.obsidian/plugins/specorator', 'tool-host.mjs'));
    expect(r.toolsDir).toBe(path.join('/vault', '.specorator', 'tools'));
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- tests/unit/providers/claude/toolHost/toolHostPaths.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/providers/claude/toolHost/toolHostPaths.ts
import path from 'node:path';

export interface ToolHostPathsInput {
  vaultPath: string;
  /** Plugin folder relative to the vault root (Obsidian `manifest.dir`). */
  pluginDir: string;
}

export interface ToolHostPaths {
  hostEntry: string;
  toolsDir: string;
}

export function resolveToolHostPaths(input: ToolHostPathsInput): ToolHostPaths {
  return {
    hostEntry: path.join(input.vaultPath, input.pluginDir, 'tool-host.mjs'),
    toolsDir: path.join(input.vaultPath, '.specorator', 'tools'),
  };
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- tests/unit/providers/claude/toolHost/toolHostPaths.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/providers/claude/toolHost/toolHostPaths.ts tests/unit/providers/claude/toolHost/toolHostPaths.test.ts
git commit -m "feat(claude): resolve tool host paths"
```

### Task 13: `buildToolHostServer` — synthetic stdio config

**Files:**
- Create: `src/providers/claude/toolHost/buildToolHostServer.ts`
- Test: `tests/unit/providers/claude/toolHost/buildToolHostServer.test.ts`

This returns the `McpStdioServerConfig` injected as `mcpServers['specorator']`, or `null` when disabled / no node. Secrets resolve synchronously via the same `(id) => secretStore.get(id)` resolver used by `McpServerManager`.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/providers/claude/toolHost/buildToolHostServer.test.ts
import { buildToolHostServer } from '@/providers/claude/toolHost/buildToolHostServer';

const base = {
  enabled: true,
  nodePath: '/usr/bin/node',
  hostEntry: '/vault/plugin/tool-host.mjs',
  toolsDir: '/vault/.specorator/tools',
  vaultPath: '/vault',
  baseEnv: { PATH: '/usr/bin' },
  disabledTools: ['old_tool'],
  declaredSecrets: ['OPENAI_API_KEY'],
  resolveSecret: (id: string) => (id === 'OPENAI_API_KEY' ? 'sk-test' : null),
};

describe('buildToolHostServer', () => {
  it('returns null when disabled', () => {
    expect(buildToolHostServer({ ...base, enabled: false })).toBeNull();
  });

  it('returns null when node is unresolved', () => {
    expect(buildToolHostServer({ ...base, nodePath: null })).toBeNull();
  });

  it('builds an stdio config pointing node at the host entry with env', () => {
    const cfg = buildToolHostServer(base);
    expect(cfg).toMatchObject({
      type: 'stdio',
      command: '/usr/bin/node',
      args: ['/vault/plugin/tool-host.mjs'],
    });
    expect(cfg!.env).toMatchObject({
      PATH: '/usr/bin',
      SPECORATOR_TOOLS_DIR: '/vault/.specorator/tools',
      SPECORATOR_VAULT_PATH: '/vault',
      SPECORATOR_DISABLED_TOOLS: 'old_tool',
      SPECORATOR_SECRET_OPENAI_API_KEY: 'sk-test',
    });
  });

  it('omits a declared secret that does not resolve', () => {
    const cfg = buildToolHostServer({ ...base, resolveSecret: () => null });
    expect(cfg!.env).not.toHaveProperty('SPECORATOR_SECRET_OPENAI_API_KEY');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- tests/unit/providers/claude/toolHost/buildToolHostServer.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/providers/claude/toolHost/buildToolHostServer.ts
import type { McpStdioServerConfig } from '../../../core/types/mcp';

export interface BuildToolHostServerInput {
  enabled: boolean;
  nodePath: string | null;
  hostEntry: string;
  toolsDir: string;
  vaultPath: string;
  /** Curated base env for the child (from curateStdioMcpEnv). */
  baseEnv: Record<string, string>;
  disabledTools: string[];
  declaredSecrets: string[];
  resolveSecret: (id: string) => string | null;
}

export function buildToolHostServer(input: BuildToolHostServerInput): McpStdioServerConfig | null {
  if (!input.enabled || !input.nodePath) return null;

  const env: Record<string, string> = {
    ...input.baseEnv,
    SPECORATOR_TOOLS_DIR: input.toolsDir,
    SPECORATOR_VAULT_PATH: input.vaultPath,
    SPECORATOR_DISABLED_TOOLS: input.disabledTools.join(','),
  };
  for (const id of input.declaredSecrets) {
    const value = input.resolveSecret(id);
    if (value !== null) env[`SPECORATOR_SECRET_${id}`] = value;
  }

  return { type: 'stdio', command: input.nodePath, args: [input.hostEntry], env };
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- tests/unit/providers/claude/toolHost/buildToolHostServer.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/providers/claude/toolHost/buildToolHostServer.ts tests/unit/providers/claude/toolHost/buildToolHostServer.test.ts
git commit -m "feat(claude): build synthetic tool-host stdio config"
```

### Task 14: `ToolHostCatalog` — spawn catalog mode, parse JSON

**Files:**
- Create: `src/providers/claude/toolHost/ToolHostCatalog.ts`
- Test: `tests/unit/providers/claude/toolHost/ToolHostCatalog.test.ts`

Inject the spawn function so the test never starts a real process.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/providers/claude/toolHost/ToolHostCatalog.test.ts
import { readCatalog } from '@/providers/claude/toolHost/ToolHostCatalog';

function fakeSpawn(stdout: string, code = 0) {
  return () =>
    Promise.resolve({ stdout, stderr: '', code });
}

describe('readCatalog', () => {
  it('parses catalog JSON from stdout', async () => {
    const payload = { tools: [{ file: 'a.mjs', name: 'a', description: 'd' }], errors: [] };
    const res = await readCatalog({ runCatalog: fakeSpawn(JSON.stringify(payload)) });
    expect(res).toEqual(payload);
  });

  it('returns an empty catalog when the process fails', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('boom', 1) });
    expect(res).toEqual({ tools: [], errors: [] });
  });

  it('returns an empty catalog on unparseable stdout', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('not json') });
    expect(res).toEqual({ tools: [], errors: [] });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- tests/unit/providers/claude/toolHost/ToolHostCatalog.test.ts`

- [ ] **Step 3: Implement.**

```ts
// src/providers/claude/toolHost/ToolHostCatalog.ts
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
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- tests/unit/providers/claude/toolHost/ToolHostCatalog.test.ts`

- [ ] **Step 5: Add a real spawn helper** (no test — thin `child_process` wrapper that produces the `runCatalog` thunk). Append to the same file:

```ts
import { spawn } from 'node:child_process';

export function spawnCatalogRunner(
  nodePath: string,
  hostEntry: string,
  env: Record<string, string>,
): () => Promise<CatalogRunResult> {
  return () =>
    new Promise((resolve, reject) => {
      const child = spawn(nodePath, [hostEntry, '--catalog'], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, code }));
    });
}
```

- [ ] **Step 6: Typecheck + commit.**

Run: `npm run typecheck`

```bash
git add src/providers/claude/toolHost/ToolHostCatalog.ts tests/unit/providers/claude/toolHost/ToolHostCatalog.test.ts
git commit -m "feat(claude): read tool-host catalog via spawned --catalog run"
```

---

## Phase 3 — Settings UI

### Task 15: i18n keys

**Files:**
- Modify: `src/i18n/types/settings.ts` (verify exact file via grep below), all 10 `src/i18n/locales/*.json`

- [ ] **Step 1: Find the settings i18n type file.**

Run: `git grep -l "settings.mcpServers.name" src/i18n`
Expected: the type-union file + `en.json` (and siblings). Use the type-union file for Step 2.

- [ ] **Step 2: Add the key union members** (in the settings i18n type union, alongside `'settings.mcpServers.name'`):

```ts
  | 'settings.localToolHost.name'
  | 'settings.localToolHost.desc'
  | 'settings.localToolHost.enable'
  | 'settings.localToolHost.nodeMissing'
  | 'settings.localToolHost.noTools'
  | 'settings.localToolHost.trustWarning'
  | 'settings.localToolHost.loadError'
```

- [ ] **Step 3: Add the block to every locale.** In each `src/i18n/locales/*.json`, add under `settings` (English values shown; translate or copy English for the others to preserve key parity — the parity test only checks keys exist):

```json
"localToolHost": {
  "name": "Local tool host",
  "desc": "Run user-authored Node scripts from .specorator/tools as MCP tools. Requires Node installed. Scripts run with full Node access — only enable code you trust.",
  "enable": "Enable local tool host",
  "nodeMissing": "Node was not found on PATH. Install Node to use local tools.",
  "noTools": "No tools found in .specorator/tools.",
  "trustWarning": "Tools run as a Node subprocess with full filesystem and network access.",
  "loadError": "Failed to load"
}
```

- [ ] **Step 4: Validate JSON + key parity.**

Run: `npm test -- tests/unit/i18n` *(or the locale-parity test path; find via `git grep -l "locale" tests/unit/i18n`)*
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/i18n
git commit -m "i18n: local tool host settings strings"
```

### Task 16: Settings section widget

**Files:**
- Create: `src/providers/claude/ui/localToolHostWidget.ts`
- Modify: `src/providers/claude/ui/claudeSettingsWidgets.ts`, `src/providers/claude/ui/ClaudeSettingsTab.ts`

Follow the `mountClaudeMcpSection` pattern (widget = `(host, context) => void`). The widget reads settings, renders a toggle, and — when enabled — lists catalog tools with per-tool enable/disable + error badges. It builds the catalog runner from `buildToolHostServer` + `spawnCatalogRunner`.

- [ ] **Step 1: Implement the widget.**

```ts
// src/providers/claude/ui/localToolHostWidget.ts
import { Setting } from 'obsidian';
import type { ProviderSettingsWidgetMount } from '../../../core/providers/types';
import { getClaudeProviderSettings, updateClaudeProviderSettings } from '../settings';
import { resolveToolHostPaths } from '../toolHost/toolHostPaths';
import { buildToolHostServer } from '../toolHost/buildToolHostServer';
import { readCatalog, spawnCatalogRunner } from '../toolHost/ToolHostCatalog';
import { curateStdioMcpEnv } from '../../../utils/env';
import { findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import { t } from '../../../i18n';

export const mountClaudeLocalToolHostSection: ProviderSettingsWidgetMount = (host, context) => {
  const plugin = context.plugin;
  const settingsBag = plugin.settings as unknown as Record<string, unknown>;
  const claude = getClaudeProviderSettings(settingsBag);

  host.createEl('p', { text: t('settings.localToolHost.desc'), cls: 'setting-item-description' });

  new Setting(host)
    .setName(t('settings.localToolHost.enable'))
    .addToggle((toggle) =>
      toggle.setValue(claude.localToolHostEnabled).onChange(async (value) => {
        updateClaudeProviderSettings(settingsBag, { localToolHostEnabled: value });
        await plugin.saveSettings();
        context.refreshDisplay?.();
      }),
    );

  if (!claude.localToolHostEnabled) return;

  const vaultPath = plugin.getVaultPath();
  const nodePath = findNodeExecutable(getEnhancedPath());
  if (!nodePath) {
    host.createEl('p', { text: t('settings.localToolHost.nodeMissing'), cls: 'setting-item-description mod-warning' });
    return;
  }

  const paths = resolveToolHostPaths({ vaultPath, pluginDir: plugin.manifest.dir ?? '' });
  const server = buildToolHostServer({
    enabled: true,
    nodePath,
    hostEntry: paths.hostEntry,
    toolsDir: paths.toolsDir,
    vaultPath,
    baseEnv: curateStdioMcpEnv({}),
    disabledTools: claude.localToolHostDisabledTools,
    declaredSecrets: [],
    resolveSecret: (id) => plugin.secretStore.get(id),
  });

  const listEl = host.createDiv({ cls: 'specorator-tool-host-list' });
  void readCatalog({ runCatalog: spawnCatalogRunner(nodePath, paths.hostEntry, server?.env ?? {}) }).then(
    (catalog) => {
      if (catalog.tools.length === 0 && catalog.errors.length === 0) {
        listEl.createEl('p', { text: t('settings.localToolHost.noTools'), cls: 'setting-item-description' });
        return;
      }
      for (const tool of catalog.tools) {
        const disabled = claude.localToolHostDisabledTools.includes(tool.name);
        new Setting(listEl)
          .setName(tool.name)
          .setDesc(tool.description)
          .addToggle((toggle) =>
            toggle.setValue(!disabled).onChange(async (enabled) => {
              const next = new Set(getClaudeProviderSettings(settingsBag).localToolHostDisabledTools);
              if (enabled) next.delete(tool.name);
              else next.add(tool.name);
              updateClaudeProviderSettings(settingsBag, { localToolHostDisabledTools: [...next] });
              await plugin.saveSettings();
            }),
          );
      }
      for (const err of catalog.errors) {
        new Setting(listEl).setName(`${t('settings.localToolHost.loadError')}: ${err.file}`).setDesc(err.message);
      }
    },
  );
};
```

> Two helper assumptions to verify during implementation: `plugin.getVaultPath()` (grep `getVaultPath` in `src/main.ts` — if absent, use `(plugin.app.vault.adapter as FileSystemAdapter).getBasePath()`), and `context.refreshDisplay` (grep the widget `context` type in `src/core/providers/settingsWidgets.ts`; if absent, re-render by calling the tab's display — match how `mountClaudeMcpSection`'s `broadcastMcpReload` obtains re-render). If neither exists, drop the `refreshDisplay?.()` call and let the toggle re-render on next settings open.

- [ ] **Step 2: Register the widget** in `claudeSettingsWidgets.ts` — add the import and the map entry (next to `mcpServers: mountClaudeMcpSection` at line 283):

```ts
import { mountClaudeLocalToolHostSection } from './localToolHostWidget';
// ...
  mcpServers: mountClaudeMcpSection,
  localToolHost: mountClaudeLocalToolHostSection,
```

- [ ] **Step 3: Mount it in the tab** — in `ClaudeSettingsTab.ts`, add the import (near line 22) and a section after the MCP section (after line 136):

```ts
import { mountClaudeLocalToolHostSection } from './localToolHostWidget';
// ... after mountClaudeMcpSection(container, widgetCtx); :

    // --- Local Tool Host ---

    new Setting(container).setName(t('settings.localToolHost.name')).setHeading();

    mountClaudeLocalToolHostSection(container, widgetCtx);
```

- [ ] **Step 4: Typecheck + lint.**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Resolve the helper assumptions from Step 1's note if typecheck flags them.)

- [ ] **Step 5: Commit.**

```bash
git add src/providers/claude/ui/localToolHostWidget.ts src/providers/claude/ui/claudeSettingsWidgets.ts src/providers/claude/ui/ClaudeSettingsTab.ts
git commit -m "feat(claude): local tool host settings section"
```

### Task 17: Section style

**Files:**
- Modify: `src/style/settings/mcp-settings.css` (or nearest settings stylesheet)

- [ ] **Step 1: Add a minimal list style** (only if the list needs spacing — keep it tiny to respect the CSS ratchet, no `!important`):

```css
.specorator-tool-host-list {
  margin-top: var(--size-4-2);
}
```

- [ ] **Step 2: CSS ratchet.**

Run: `npm run check:css`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/style
git commit -m "style(claude): tool host settings list spacing"
```

---

## Phase 4 — Wire into the Claude runtime

### Task 18: Inject the synthetic server at cold start

**Files:**
- Modify: `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`

- [ ] **Step 1: Add the optional closure to `QueryOptionsContext`** (interface at lines 32–42):

```ts
  pluginManager: AppPluginManager;
  /** Returns the synthetic local-tool-host stdio config, or null when off. */
  buildLocalToolHostServer?: () => McpServerConfig | null;
  boundAgentPrompt?: string;
```

Add the import at the top if not present:

```ts
import type { McpServerConfig } from '../../../core/types/mcp';
```

- [ ] **Step 2: Inject after `getActiveServers`** (the `mcpServers` block at lines 226–232). Change it to:

```ts
  const mcpServers: Record<string, unknown> = {
    ...ctx.mcpManager.getActiveServers(combinedMentions),
  };

  const localToolHost = ctx.buildLocalToolHostServer?.();
  if (localToolHost) {
    mcpServers['specorator'] = localToolHost;
  }

  if (Object.keys(mcpServers).length > 0) {
    options.mcpServers = mcpServers as typeof options.mcpServers;
  }
```

- [ ] **Step 3: Typecheck.** `npm run typecheck` → PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts
git commit -m "feat(claude): inject local tool host at cold start"
```

### Task 19: Inject the synthetic server on dynamic update

**Files:**
- Modify: `src/providers/claude/runtime/ClaudeDynamicUpdates.ts`

- [ ] **Step 1: Add the closure to `ClaudeDynamicUpdateDeps`** (grep `ClaudeDynamicUpdateDeps` for the type; add alongside `mcpManager`):

```ts
  buildLocalToolHostServer?: () => McpServerConfig | null;
```

Import `McpServerConfig` from `../../../core/types/mcp` if not already imported.

- [ ] **Step 2: Inject in `updateMcpServers`** (after `const mcpServers = deps.mcpManager.getActiveServers(combinedMentions);` at line ~187):

```ts
  const mcpServers = deps.mcpManager.getActiveServers(combinedMentions);
  const localToolHost = deps.buildLocalToolHostServer?.();
  const merged = localToolHost ? { ...mcpServers, specorator: localToolHost } : mcpServers;
  const mcpServersKey = JSON.stringify(merged);
```

Then replace the later `vetActiveServersForRuntime(mcpServers)` and `serverConfigs` assembly to operate on `merged` instead of `mcpServers` (grep within the function; the synthetic stdio config is loopback-free so it passes vetting unchanged).

- [ ] **Step 3: Typecheck.** `npm run typecheck` → PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/providers/claude/runtime/ClaudeDynamicUpdates.ts
git commit -m "feat(claude): inject local tool host on dynamic mcp update"
```

### Task 20: Supply the closure from the runtime

**Files:**
- Modify: `src/providers/claude/runtime/ClaudeChatRuntime.ts`

Build one closure (capturing plugin, vault path, settings, secret resolver, curated env) and pass it into both the cold-start `QueryOptionsContext` and the dynamic-update deps.

- [ ] **Step 1: Add a private field + the closure helper** on the runtime. The closure is sync (called per-turn at both seams), so it reads a cached union of declared secret ids rather than spawning catalog mode on the hot path:

```ts
/** Union of `manifest.secrets` across discovered tools, refreshed from the catalog. */
private declaredToolSecretIds: string[] = [];

private makeLocalToolHostServerBuilder(): () => McpServerConfig | null {
  return () => {
    const claude = getClaudeProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    if (!claude.localToolHostEnabled) return null;
    const vaultPath = this.plugin.getVaultPath();
    const nodePath = findNodeExecutable(getEnhancedPath());
    const paths = resolveToolHostPaths({ vaultPath, pluginDir: this.plugin.manifest.dir ?? '' });
    return buildToolHostServer({
      enabled: true,
      nodePath,
      hostEntry: paths.hostEntry,
      toolsDir: paths.toolsDir,
      vaultPath,
      baseEnv: curateStdioMcpEnv({}),
      disabledTools: claude.localToolHostDisabledTools,
      declaredSecrets: this.declaredToolSecretIds,
      resolveSecret: (id) => this.plugin.secretStore.get(id),
    });
  };
}

/** Spawn catalog mode, cache the union of declared secret ids. Best-effort; never throws. */
async refreshDeclaredToolSecretIds(): Promise<void> {
  const claude = getClaudeProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
  const nodePath = findNodeExecutable(getEnhancedPath());
  if (!claude.localToolHostEnabled || !nodePath) {
    this.declaredToolSecretIds = [];
    return;
  }
  const vaultPath = this.plugin.getVaultPath();
  const paths = resolveToolHostPaths({ vaultPath, pluginDir: this.plugin.manifest.dir ?? '' });
  const env = {
    ...curateStdioMcpEnv({}),
    SPECORATOR_TOOLS_DIR: paths.toolsDir,
    SPECORATOR_VAULT_PATH: vaultPath,
  };
  const catalog = await readCatalog({ runCatalog: spawnCatalogRunner(nodePath, paths.hostEntry, env) });
  this.declaredToolSecretIds = [...new Set(catalog.tools.flatMap((t) => t.secrets))];
}
```

Add the imports (`getClaudeProviderSettings`, `resolveToolHostPaths`, `buildToolHostServer`, `findNodeExecutable`, `getEnhancedPath`, `curateStdioMcpEnv`, `McpServerConfig`, `readCatalog`, `spawnCatalogRunner`).

- [ ] **Step 2: Pass it into the cold-start `QueryOptionsContext`** — find where the runtime builds the `QueryOptionsContext` (grep `mcpManager:` in this file) and add:

```ts
  buildLocalToolHostServer: this.makeLocalToolHostServerBuilder(),
```

- [ ] **Step 3: Pass it into the dynamic-update deps** — find where `ClaudeDynamicUpdateDeps` is assembled (grep `mcpManager` again) and add the same line.

- [ ] **Step 4: Refresh the cached declared-secret ids when the tool set can change.** Call `void this.refreshDeclaredToolSecretIds()` (a) once during the runtime's init/ready path, and (b) on the `.specorator/tools` `vault.on('modify')` watcher (the same watcher the settings list uses; if the runtime doesn't own one, add a `registerEvent(app.vault.on('modify', …))` filtered to the tools dir). This keeps `ctx.secrets` populated for secret-declaring tools. **Staleness caveat (documented, acceptable for v1):** a tool added mid-session that declares a *new* secret sees it only after the next refresh (file-watch tick or settings re-open); the synthetic config's `mcpServersKey` already changes when the resolved env changes, so the next turn re-spawns the host with the secret present.

- [ ] **Step 5: Add a unit test** for `refreshDeclaredToolSecretIds` deduping the union (inject a fake `runCatalog` via the same seam `ToolHostCatalog` tests use, or extract the union step as a small pure helper `unionSecretIds(catalog)` and test that). Assert `['A','B']` from tools declaring `['A']` and `['A','B']`.

- [ ] **Step 6: Typecheck + full test + build.**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/providers/claude/runtime/ClaudeChatRuntime.ts tests/unit/providers/claude
git commit -m "feat(claude): supply local tool host builder + declared-secret cache to both mcp seams"
```

> **How declared secrets flow (v1, end-to-end):** the host reports each tool's `manifest.secrets` in catalog mode (Task 7) → the runtime caches their union via `refreshDeclaredToolSecretIds` (Step 4) → `buildToolHostServer` resolves each id through `secretStore.get` and emits `SPECORATOR_SECRET_<id>` into the host env (Task 13) → the host's `ctx.secrets` exposes the subset each tool declared (Task 9). The sync per-turn closure reads the cache, so no catalog spawn sits on the hot path.

---

## Phase 5 — Integration test, docs, final gate

### Task 21: Integration test — injection end to end

**Files:**
- Create: `tests/integration/providers/claude/localToolHostInjection.test.ts`

- [ ] **Step 1: Write the test** (verifies the cold-start builder injects `specorator` only when enabled). Use the existing integration harness style; assert on the built `mcpServers` map.

```ts
// tests/integration/providers/claude/localToolHostInjection.test.ts
import { buildToolHostServer } from '@/providers/claude/toolHost/buildToolHostServer';

describe('local tool host injection (config-level)', () => {
  const builder = (enabled: boolean) =>
    buildToolHostServer({
      enabled,
      nodePath: '/usr/bin/node',
      hostEntry: '/v/p/tool-host.mjs',
      toolsDir: '/v/.specorator/tools',
      vaultPath: '/v',
      baseEnv: {},
      disabledTools: [],
      declaredSecrets: [],
      resolveSecret: () => null,
    });

  it('produces a server only when enabled', () => {
    expect(builder(false)).toBeNull();
    const cfg = builder(true);
    const mcpServers: Record<string, unknown> = {};
    if (cfg) mcpServers['specorator'] = cfg;
    expect(Object.keys(mcpServers)).toEqual(['specorator']);
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

Run: `npm run test -- --selectProjects integration tests/integration/providers/claude/localToolHostInjection.test.ts`

- [ ] **Step 3: Commit.**

```bash
git add tests/integration/providers/claude/localToolHostInjection.test.ts
git commit -m "test(claude): local tool host injection is gated on enable"
```

### Task 22: Docs — storage rows + architecture

**Files:**
- Modify: `CLAUDE.md`, `src/core/CLAUDE.md`

- [ ] **Step 1: Add storage rows to the `CLAUDE.md` Storage table:**

```markdown
| `.specorator/tools/*.mjs` | User-authored local tool scripts (Claude tool host) |
| `.specorator/tool-host.log` | Local tool host log (written by `ctx.logger`) |
```

- [ ] **Step 2: Add a one-line architecture note** under the Claude adaptor bullet noting the bundled `tool-host.mjs` stdio server and its `.specorator/tools/` source.

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md src/core/CLAUDE.md
git commit -m "docs: record local tool host storage + architecture"
```

### Task 23: Final gate + ratchets

- [ ] **Step 1: Full gate.**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all PASS.

- [ ] **Step 2: Ratchets** (the new code grows LOC/quality; re-record per `docs/build-ci/quality-gates.md` if they flag growth).

Run: `npm run check:loc && npm run check:css && npm run check:quality && npm run check:artifacts`
Expected: PASS (re-baseline where the gate doc instructs).

- [ ] **Step 3: Manual smoke (optional, documented for the reviewer).** With a vault that has `.specorator/tools/wordCount.mjs` (the spec's example) and the toggle on, send a Claude turn asking it to count words; confirm `mcp__specorator__word_count` runs and `.specorator/tool-host.log` gets a line.

- [ ] **Step 4: Final commit if anything changed in Steps 1–2.**

```bash
git add -A
git commit -m "chore: re-baseline ratchets for local tool host"
```

---

## Deferred (explicitly out of scope; revisit later)

- **TypeScript authoring** (Node-native type-stripping, Node ≥23).
- **Codex / Cursor / Opencode wiring** — the host is provider-neutral; later work is per-provider config marshalling only.
- **Dedicated Tool Library view + in-app editor.**
- **Hot reload via MCP `tools/list_changed`** — v1 reload happens on settings re-open and on the next turn's `setMcpServers` (env/key change). A `fs.watch` + `list_changed` push from the host is a refinement.

---

## Self-Review

**Spec coverage:**
- Bundled stdio host + native `import()` (no eval) → Tasks 1–10.
- Plain-JS/ESM authoring contract (`manifest` + `handler`, JSON Schema, string|object return) → Tasks 1, 2, 6, 8.
- `ctx.vault` (path-safe), `ctx.logger`, `ctx.secrets` → Tasks 3, 4, 9; declared secrets flow end-to-end via catalog (Task 7) → runtime cache (Task 20) → `buildToolHostServer` env (Task 13) → host `ctx.secrets` (Task 9).
- Ship the host in release assets (`scripts/release.mjs`, `release.yml`) → Task 10 Step 7.
- Claude-only injection at both seams → Tasks 18–20.
- Opt-in toggle + Node check + discovered-tool list + per-tool disable + error badges → Tasks 11, 16.
- Lazy start (server is `null` when disabled / no node; SDK only spawns when injected) → Tasks 13, 18, 19.
- Per-script isolation + handler timeout/throw → Tasks 5, 6.
- Storage rows (`.specorator/tools/`, `tool-host.log`) → Task 22.
- Testing (host units, plugin units, integration) → Tasks 2–8, 12–14, 21.

**Placeholder scan:** No "TBD"/"handle edge cases" — every code step shows code. The two runtime-wiring tasks (19, 20) say "grep for X" only to *locate* an exact existing assembly site, then show the exact lines to add; this is location guidance, not missing content.

**Type consistency:** `ToolHandlerCtx`, `LoadedTool`, `CatalogPayload`, `McpStdioServerConfig`/`McpServerConfig`, `buildToolHostServer`, `resolveToolHostPaths`, `readCatalog`, `buildToolHandlers`, `toCallToolResult`, `createVaultContext`, `createLogger`, `runHandler`, `loadTools`, `buildCatalog` are defined once and reused with consistent signatures across tasks. Env var names (`SPECORATOR_TOOLS_DIR`, `SPECORATOR_VAULT_PATH`, `SPECORATOR_DISABLED_TOOLS`, `SPECORATOR_SECRET_*`) match between `buildToolHostServer` (Task 13) and the host entry (Task 9).
</content>
