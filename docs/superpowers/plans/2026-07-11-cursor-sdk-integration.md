---
title: Cursor SDK integration — implementation plan
date: 2026-07-11
status: draft
scope: cursor-sdk-migration
spec: "[[2026-07-11-cursor-sdk-integration-design]]"
---

# Cursor SDK Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `cursor-agent` CLI subprocess integration with the official `@cursor/sdk` (in-process local agent), then delete the 20-file CLI orchestration cluster (the one-shot `~/.cursor/mcp.json` cleanup survives — see spec).

**Architecture:** The provider-neutral `ChatRuntime` seam does not move. A rewritten `CursorChatRuntime` holds an SDK `Agent` handle per turn (`Agent.create` / `Agent.resume(chatSessionId)`), streams via a two-channel adapter (`send({ onDelta })` typing deltas + `run.stream()` lifecycle messages) into the existing `StreamChunk` union, and answers AskUserQuestion through an in-process custom tool. Aux services, history, and the model catalog move onto `Agent.prompt`-style one-shots, `Agent.messages.list`/`Agent.listRuns`, and `Cursor.models.list()`.

**Tech Stack:** `@cursor/sdk@^1.0.23` (verified API — see spec "Verified facts"), TypeScript, Jest (unit + integration, `@/` path alias), esbuild bundling (CJS build of the SDK).

**Read the spec first:** `docs/superpowers/specs/2026-07-11-cursor-sdk-integration-design.md`. It contains the verified SDK facts (message unions, options shapes, helper-binary discovery, permission-mode mapping table) that this plan implements. Locked decisions: `CURSOR_API_KEY` required, clean history break, full cut.

**Conventions used below**

- All paths repo-relative. Tests mirror `src/` under `tests/unit/` and `tests/integration/`.
- Run single test files with `npm run test -- tests/unit/path/to/file.test.ts`. Full gate: `npm run typecheck && npm run lint && npm run test && npm run build`.
- Every new runtime file imports SDK **types only** via `import type { ... } from '@cursor/sdk'` where possible; only `CursorChatRuntime`, `CursorSdkAuxRunner`, the history service, and the model catalog import SDK **values** (`Agent`, `Cursor`). Unit tests mock `@cursor/sdk` with `jest.mock` factories so the real dist never loads under Jest.
- No `console.*`; log via `plugin.logger?.scope('cursor-sdk')` where a logger is available.
- The 21 legacy CLI files stay in place (unused by the new runtime) until Task 12 deletes them in one sweep — the tree stays green after every task.

---

### Task 1: Add `@cursor/sdk` and prove the bundle stays loadable

**Files:**
- Modify: `package.json` (dependency)
- Modify: `scripts/check-artifacts.mjs` — only if the `import.meta` assertion below does not already exist (it does not as of writing)

- [ ] **Step 1: Install the dependency**

```bash
npm install @cursor/sdk@^1.0.23
```

Expected: `package.json` gains `"@cursor/sdk": "^1.0.23"` under `dependencies`; platform package `@cursor/sdk-<platform>` lands under `node_modules/@cursor/` via optionalDependencies. `engines.node >=22.13.0` is already satisfied.

- [ ] **Step 2: Build and assert the bundle is CJS-clean**

```bash
npm run build
node -e "const s=require('fs').readFileSync('main.js','utf8'); if(s.includes('import.meta')) { console.error('FAIL: import.meta leaked into main.js'); process.exit(1);} console.log('OK: no import.meta in bundle');"
npm run check:artifacts
```

Expected: build succeeds (esbuild resolves the SDK's `require` condition → `dist/cjs`, which has no `import.meta`); both checks print OK. If `import.meta` DOES appear, add a filter for `@cursor/sdk` to the existing `patchSdkImportMeta` plugin in `esbuild.config.mjs` (same pattern as the `@openai/codex-sdk` / `@anthropic-ai/claude-agent-sdk` entries) and re-run.

- [ ] **Step 3: Sanity-import the SDK types in a scratch typecheck**

```bash
node -e "const {Agent, Cursor} = require('@cursor/sdk'); console.log(typeof Agent.create, typeof Cursor.models.list);"
```

Expected: `function function`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(cursor): add @cursor/sdk dependency"
```

---

### Task 2: SDK environment resolution (`cursorSdkEnv.ts`)

Resolves `CURSOR_API_KEY` / `CURSOR_BASE_URL` from provider env (settings box first, host env fallback — same precedence `buildAllowlistedSubprocessEnvironment` produced), rejects loopback base URLs (TLS footgun, see spec), and discovers a ripgrep path for `CURSOR_RIPGREP_PATH`.

**Files:**
- Create: `src/providers/cursor/runtime/cursorSdkEnv.ts`
- Modify: `src/providers/cursor/runtime/CursorBinaryLocator.ts` (add `findRipgrepBinaryPath`)
- Test: `tests/unit/providers/cursor/runtime/cursorSdkEnv.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  resolveCursorSdkEnvironment,
  sanitizeCursorSdkHostEnv,
} from '@/providers/cursor/runtime/cursorSdkEnv';
import type { PluginContext } from '@/core/types/PluginContext';

function pluginWith(env: Record<string, string>): PluginContext {
  return {
    getResolvedEnvironmentVariables: (providerId: string) =>
      providerId === 'cursor' ? env : {},
  } as unknown as PluginContext;
}

describe('resolveCursorSdkEnvironment', () => {
  const HOST_KEY = 'CURSOR_API_KEY';
  let savedKey: string | undefined;
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedKey = process.env[HOST_KEY];
    savedUrl = process.env.CURSOR_BASE_URL;
    delete process.env[HOST_KEY];
    delete process.env.CURSOR_BASE_URL;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[HOST_KEY];
    else process.env[HOST_KEY] = savedKey;
    if (savedUrl === undefined) delete process.env.CURSOR_BASE_URL;
    else process.env.CURSOR_BASE_URL = savedUrl;
  });

  it('prefers the settings-box key over the host env key', () => {
    process.env[HOST_KEY] = 'host-key';
    const env = resolveCursorSdkEnvironment(pluginWith({ CURSOR_API_KEY: 'settings-key' }));
    expect(env.apiKey).toBe('settings-key');
  });

  it('falls back to the host env key', () => {
    process.env[HOST_KEY] = 'host-key';
    const env = resolveCursorSdkEnvironment(pluginWith({}));
    expect(env.apiKey).toBe('host-key');
  });

  it('returns null apiKey when neither source has one', () => {
    const env = resolveCursorSdkEnvironment(pluginWith({}));
    expect(env.apiKey).toBeNull();
  });

  it('passes a normal base URL through', () => {
    const env = resolveCursorSdkEnvironment(
      pluginWith({ CURSOR_API_KEY: 'k', CURSOR_BASE_URL: 'https://api.example.com' }),
    );
    expect(env.baseUrl).toBe('https://api.example.com');
    expect(env.rejectedLoopbackBaseUrl).toBe(false);
  });

  it('rejects loopback base URLs and flags the rejection', () => {
    for (const url of ['http://localhost:8080', 'https://127.0.0.1/x']) {
      const env = resolveCursorSdkEnvironment(
        pluginWith({ CURSOR_API_KEY: 'k', CURSOR_BASE_URL: url }),
      );
      expect(env.baseUrl).toBeNull();
      expect(env.rejectedLoopbackBaseUrl).toBe(true);
    }
  });

  it('sanitizeCursorSdkHostEnv clears loopback SDK vars the host process carries', () => {
    // The SDK reads these directly from process.env in-process; a loopback
    // value triggers its NODE_TLS_REJECT_UNAUTHORIZED=0 side effect.
    process.env.CURSOR_API_BASE_URL = 'http://localhost:9999';
    process.env.CURSOR_BACKEND_URL = 'https://127.0.0.1:8443';
    process.env.CURSOR_BASE_URL = 'http://localhost:1234';
    sanitizeCursorSdkHostEnv();
    expect(process.env.CURSOR_API_BASE_URL).toBeUndefined();
    expect(process.env.CURSOR_BACKEND_URL).toBeUndefined();
    expect(process.env.CURSOR_BASE_URL).toBeUndefined();
    delete process.env.CURSOR_API_BASE_URL;
    delete process.env.CURSOR_BACKEND_URL;
  });

  it('sanitizeCursorSdkHostEnv leaves non-loopback host values alone', () => {
    process.env.CURSOR_API_BASE_URL = 'https://api.cursor.com';
    sanitizeCursorSdkHostEnv();
    expect(process.env.CURSOR_API_BASE_URL).toBe('https://api.cursor.com');
    delete process.env.CURSOR_API_BASE_URL;
  });

  it('trims whitespace and treats blank values as absent', () => {
    const env = resolveCursorSdkEnvironment(pluginWith({ CURSOR_API_KEY: '  ' }));
    expect(env.apiKey).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkEnv.test.ts
```

Expected: FAIL — `Cannot find module '@/providers/cursor/runtime/cursorSdkEnv'`.

- [ ] **Step 3: Implement**

Add to `src/providers/cursor/runtime/CursorBinaryLocator.ts`:

```typescript
/** PATH discovery for ripgrep, wired into CURSOR_RIPGREP_PATH for @cursor/sdk. */
export function findRipgrepBinaryPath(
  additionalPath?: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const binaryNames = platform === 'win32' ? ['rg.exe', 'rg'] : ['rg'];
  return findBinaryOnPath(binaryNames, additionalPath);
}
```

Create `src/providers/cursor/runtime/cursorSdkEnv.ts`:

```typescript
import type { PluginContext } from '../../../core/types/PluginContext';
import { getEnhancedPath } from '../../../utils/env';
import { findRipgrepBinaryPath } from './CursorBinaryLocator';

export interface CursorSdkEnvironment {
  /** Resolved API key, or null when neither settings env nor host env has one. */
  apiKey: string | null;
  /** Non-loopback base URL override, or null. */
  baseUrl: string | null;
  /** True when a configured base URL was dropped for pointing at loopback. */
  rejectedLoopbackBaseUrl: boolean;
  /** Absolute rg path for CURSOR_RIPGREP_PATH, or null when not discoverable. */
  ripgrepPath: string | null;
}

function readTrimmed(source: Record<string, string>, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isLoopbackUrl(url: string): boolean {
  return /:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(url);
}

/**
 * Resolves the values the SDK needs from the provider environment. Settings-box
 * env wins over host env (same precedence the subprocess allowlist produced).
 * Loopback base URLs are rejected: the SDK's local executor sets
 * NODE_TLS_REJECT_UNAUTHORIZED=0 process-wide for loopback backends, which must
 * never happen inside Obsidian.
 */
export function resolveCursorSdkEnvironment(plugin: PluginContext): CursorSdkEnvironment {
  const customEnv = plugin.getResolvedEnvironmentVariables('cursor');
  const hostEnv = process.env as Record<string, string>;

  const apiKey = readTrimmed(customEnv, 'CURSOR_API_KEY') ?? readTrimmed(hostEnv, 'CURSOR_API_KEY');

  const rawBaseUrl =
    readTrimmed(customEnv, 'CURSOR_BASE_URL') ?? readTrimmed(hostEnv, 'CURSOR_BASE_URL');
  const rejectedLoopbackBaseUrl = !!rawBaseUrl && isLoopbackUrl(rawBaseUrl);
  const baseUrl = rawBaseUrl && !rejectedLoopbackBaseUrl ? rawBaseUrl : null;

  const ripgrepPath =
    readTrimmed(customEnv, 'CURSOR_RIPGREP_PATH')
    ?? findRipgrepBinaryPath(getEnhancedPath(customEnv.PATH));

  return { apiKey, baseUrl, rejectedLoopbackBaseUrl, ripgrepPath };
}

/** SDK-read env vars whose loopback values trigger the process-wide TLS bypass. */
const SDK_BASE_URL_ENV_KEYS = ['CURSOR_API_BASE_URL', 'CURSOR_BACKEND_URL', 'CURSOR_BASE_URL'] as const;

/**
 * Clears loopback-pointing SDK base-URL vars from the HOST env. The SDK runs
 * in-process and reads process.env directly, so a loopback var Obsidian was
 * launched with would trigger NODE_TLS_REJECT_UNAUTHORIZED=0 process-wide even
 * when Specorator never passes it as an option. Non-loopback values are left
 * alone (legitimate enterprise base-URL overrides).
 */
export function sanitizeCursorSdkHostEnv(): void {
  for (const key of SDK_BASE_URL_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && isLoopbackUrl(value)) {
      delete process.env[key];
    }
  }
}

/**
 * Applies the in-process env the SDK reads at agent creation. The SDK runs in
 * our process, so process.env IS its configuration surface. Always sanitizes
 * loopback host vars first; the settings-box base URL is applied via
 * CURSOR_API_BASE_URL only when a safe override exists.
 */
export function applyCursorSdkProcessEnv(env: CursorSdkEnvironment): void {
  sanitizeCursorSdkHostEnv();
  if (env.ripgrepPath) {
    process.env.CURSOR_RIPGREP_PATH = env.ripgrepPath;
  }
  if (env.baseUrl) {
    process.env.CURSOR_API_BASE_URL = env.baseUrl;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkEnv.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/cursorSdkEnv.ts src/providers/cursor/runtime/CursorBinaryLocator.ts tests/unit/providers/cursor/runtime/cursorSdkEnv.test.ts
git commit -m "feat(cursor): resolve SDK env (api key, base url guard, ripgrep path)"
```

---

### Task 3: Agent options + prompt text builders (`cursorSdkOptions.ts`)

Encodes the spec's permission-mode table and re-homes the history-recovery prompt prepend from `cursorCliPrompt.ts` (which dies in Task 12).

**Files:**
- Create: `src/providers/cursor/runtime/cursorSdkOptions.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorSdkOptions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  buildCursorAgentOptions,
  buildCursorSdkPromptText,
  resolveCursorSdkModelSelection,
} from '@/providers/cursor/runtime/cursorSdkOptions';
import type { ChatMessage } from '@/core/types';

describe('buildCursorAgentOptions', () => {
  const base = {
    apiKey: 'key-1',
    cwd: '/vault',
    modelId: 'sonnet-4',
  };

  it('maps normal mode to explicit sandbox-off with auto-review', () => {
    const options = buildCursorAgentOptions({ ...base, permissionMode: 'normal' });
    expect(options.apiKey).toBe('key-1');
    expect(options.model).toEqual({ id: 'sonnet-4' });
    expect(options.mode).toBe('agent');
    expect(options.local).toMatchObject({
      cwd: '/vault',
      sandboxOptions: { enabled: false },
      autoReview: true,
      settingSources: ['project', 'user'],
    });
  });

  it('maps plan mode to plan + normal sandbox posture', () => {
    const options = buildCursorAgentOptions({ ...base, permissionMode: 'plan' });
    expect(options.mode).toBe('plan');
    expect(options.local?.sandboxOptions).toEqual({ enabled: false });
    expect(options.local?.autoReview).toBe(true);
  });

  it('maps yolo to sandbox-off without auto-review', () => {
    const options = buildCursorAgentOptions({ ...base, permissionMode: 'yolo' });
    expect(options.mode).toBe('agent');
    expect(options.local?.autoReview).toBe(false);
  });

  it('always sets settingSources so vault/global agents stay loadable', () => {
    for (const permissionMode of ['normal', 'plan', 'yolo'] as const) {
      const options = buildCursorAgentOptions({ ...base, permissionMode });
      expect(options.local?.settingSources).toEqual(['project', 'user']);
    }
  });

  it('omits model when none resolved', () => {
    const options = buildCursorAgentOptions({ ...base, modelId: undefined, permissionMode: 'normal' });
    expect(options.model).toBeUndefined();
  });

  it('attaches custom tools when provided', () => {
    const tool = { description: 'ask', execute: async () => 'ok' };
    const options = buildCursorAgentOptions({
      ...base,
      permissionMode: 'normal',
      customTools: { ask_user: tool },
    });
    expect(options.local?.customTools).toEqual({ ask_user: tool });
  });
});

describe('buildCursorSdkPromptText', () => {
  const history: ChatMessage[] = [
    { id: 'u1', role: 'user', content: 'earlier question', timestamp: 1 } as ChatMessage,
    { id: 'a1', role: 'assistant', content: 'earlier answer', timestamp: 2 } as ChatMessage,
  ];

  it('returns the turn prompt unchanged when resuming', () => {
    const text = buildCursorSdkPromptText({
      prompt: 'current prompt',
      requestText: 'current prompt',
      resumeSessionId: 'agent-1',
      conversationHistory: history,
    });
    expect(text).toBe('current prompt');
  });

  it('prepends recovered history when starting fresh with prior messages', () => {
    const text = buildCursorSdkPromptText({
      prompt: 'current prompt',
      requestText: 'current prompt',
      resumeSessionId: null,
      conversationHistory: history,
    });
    expect(text).toContain('earlier question');
    expect(text).toContain('current prompt');
    expect(text.indexOf('earlier question')).toBeLessThan(text.indexOf('current prompt'));
  });

  it('prepends the bound agent persona as a leading directive', () => {
    const text = buildCursorSdkPromptText({
      prompt: 'current prompt',
      requestText: 'current prompt',
      resumeSessionId: 'agent-1',
      boundAgentPrompt: 'You are the vault librarian.',
    });
    expect(text.startsWith('You are the vault librarian.')).toBe(true);
    expect(text).toContain('current prompt');
  });
});

describe('resolveCursorSdkModelSelection', () => {
  it('resolves a family+mode into a runnable id via the shared resolver', () => {
    // 'auto' is mode-independent and always resolvable without catalog state.
    expect(resolveCursorSdkModelSelection('auto', undefined, [])).toBe('auto');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkOptions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/providers/cursor/runtime/cursorSdkOptions.ts`:

```typescript
import type { AgentOptions, SDKCustomTool } from '@cursor/sdk';

import type { ChatMessage } from '../../../core/types';
import { buildContextFromHistory, buildPromptWithHistoryContext } from '../../../utils/context';
import { resolveCursorModelSelectionForCli } from './cursorCliModel';
import type { CursorPermissionMode } from './cursorSdkTypes';

export interface BuildCursorAgentOptionsInput {
  apiKey: string;
  cwd: string;
  permissionMode: CursorPermissionMode;
  modelId?: string;
  customTools?: Record<string, SDKCustomTool>;
  /** Resume target; when set the options are passed to Agent.resume. */
  agentId?: string;
}

/**
 * Encodes the spec's permission-mode table. sandboxOptions is ALWAYS explicit:
 * leaving it unset defers to ~/.cursor/sandbox.json / SDK defaults, and the
 * cursorsandbox helper is unreachable inside Obsidian (argv[1]-relative
 * discovery), so enabled:true would hard-fail. `normal`/`plan` compensate with
 * Cursor's Auto-review classifier; `yolo` matches the CLI's --force posture.
 */
export function buildCursorAgentOptions(input: BuildCursorAgentOptionsInput): AgentOptions {
  const { apiKey, cwd, permissionMode, modelId, customTools, agentId } = input;

  return {
    apiKey,
    ...(modelId ? { model: { id: modelId } } : {}),
    ...(agentId ? { agentId } : {}),
    mode: permissionMode === 'plan' ? 'plan' : 'agent',
    local: {
      cwd,
      sandboxOptions: { enabled: false },
      autoReview: permissionMode !== 'yolo',
      settingSources: ['project', 'user'],
      ...(customTools ? { customTools } : {}),
    },
  };
}

/** Read-only-ish posture for aux one-shots (no `ask` mode exists in the SDK). */
export function buildCursorAuxAgentOptions(
  input: Omit<BuildCursorAgentOptionsInput, 'permissionMode' | 'customTools'>,
): AgentOptions {
  const options = buildCursorAgentOptions({ ...input, permissionMode: 'plan' });
  return { ...options, mode: 'plan' };
}

/** Thin seam over the shared family+mode resolver so callers stay CLI-agnostic. */
export function resolveCursorSdkModelSelection(
  familyValue: string | undefined,
  reasoningMode: string | undefined,
  knownModelIds: readonly string[] | { catalogIds: readonly string[]; enabledIds: readonly string[] },
): string | undefined {
  return resolveCursorModelSelectionForCli(familyValue, reasoningMode, knownModelIds);
}

export interface BuildCursorSdkPromptTextInput {
  prompt: string;
  requestText: string;
  resumeSessionId?: string | null;
  conversationHistory?: ChatMessage[];
  boundAgentPrompt?: string;
}

/**
 * Re-homed from cursorCliPrompt.buildCursorAgentPrompt (the temp-file argv
 * machinery is gone — the SDK takes a string). When no session is being
 * resumed but prior messages exist (session invalidation), the recovered
 * history is prepended; the bound-agent persona leads the prompt because the
 * runtime has no per-turn system-prompt channel.
 */
export function buildCursorSdkPromptText(input: BuildCursorSdkPromptTextInput): string {
  const { requestText, resumeSessionId, conversationHistory, boundAgentPrompt } = input;
  let prompt = input.prompt;

  if (!resumeSessionId && conversationHistory && conversationHistory.length > 0) {
    const historyContext = buildContextFromHistory(conversationHistory);
    prompt = buildPromptWithHistoryContext(historyContext, prompt, requestText, conversationHistory);
  }

  if (boundAgentPrompt) {
    prompt = `${boundAgentPrompt}\n\n---\n\n${prompt}`;
  }

  return prompt;
}
```

Create `src/providers/cursor/runtime/cursorSdkTypes.ts` (the `CursorPermissionMode` type currently lives in `cursorLaunchArgs.ts`, which Task 12 deletes — move it now and re-export from the old site until deletion):

```typescript
export type CursorPermissionMode = 'yolo' | 'plan' | 'normal';
```

And in `src/providers/cursor/runtime/cursorLaunchArgs.ts`, replace the local declaration with a re-export so existing imports keep compiling until Task 12:

```typescript
export type { CursorPermissionMode } from './cursorSdkTypes';
```

> Note: check the actual import in `utils/context` — the history helpers used by `cursorCliPrompt.ts` are `buildContextFromHistory` / `buildPromptWithHistoryContext`. Import them from the same module path `cursorCliPrompt.ts` uses today (open that file and copy its import specifier verbatim).

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkOptions.test.ts
```

Expected: PASS. Also run the launch-args suite to prove the type move broke nothing:

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorLaunchArgs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/cursorSdkOptions.ts src/providers/cursor/runtime/cursorSdkTypes.ts src/providers/cursor/runtime/cursorLaunchArgs.ts tests/unit/providers/cursor/runtime/cursorSdkOptions.test.ts
git commit -m "feat(cursor): SDK agent options builder with explicit permission-mode mapping"
```

---

### Task 4: Typed tool-call mapping (`cursorSdkToolMapping.ts`)

Maps the SDK's typed `ToolCall` union onto canonical tool names + inputs, re-homes `CURSOR_CANONICAL_TOOL_NAMES` and the result-length cap out of `cursorToolNormalization.ts` (dies in Task 12).

**Files:**
- Create: `src/providers/cursor/runtime/cursorSdkToolMapping.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorSdkToolMapping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  CURSOR_SDK_CANONICAL_TOOL_NAMES,
  capCursorSdkToolResult,
  mapCursorSdkToolCompletion,
  mapCursorSdkToolStart,
} from '@/providers/cursor/runtime/cursorSdkToolMapping';
import {
  TOOL_BASH, TOOL_EDIT, TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_READ, TOOL_SUBAGENT,
  TOOL_TODO_WRITE, TOOL_WRITE,
} from '@/core/tools/toolNames';

describe('mapCursorSdkToolStart', () => {
  it('maps known ToolCall kinds to canonical names with their args as input', () => {
    const cases: Array<[string, unknown, string]> = [
      ['read', { path: 'a.md' }, TOOL_READ],
      ['shell', { command: 'ls' }, TOOL_BASH],
      ['grep', { pattern: 'x' }, TOOL_GREP],
      ['glob', { globPattern: '*.md' }, TOOL_GLOB],
      ['ls', { path: '.' }, TOOL_LS],
      ['edit', { path: 'a.md' }, TOOL_EDIT],
      ['write', { path: 'b.md' }, TOOL_WRITE],
      ['task', { prompt: 'sub' }, TOOL_SUBAGENT],
      ['updateTodos', { todos: [] }, TOOL_TODO_WRITE],
    ];
    for (const [kind, args, expected] of cases) {
      const mapped = mapCursorSdkToolStart({ type: kind, args } as never);
      expect(mapped.name).toBe(expected);
      expect(mapped.input).toEqual(args);
    }
  });

  it('surfaces createPlan starts under the CreatePlan name used for plan detection', () => {
    const mapped = mapCursorSdkToolStart({ type: 'createPlan', args: { plan: 'x' } } as never);
    expect(mapped.name).toBe('CreatePlan');
  });

  it('falls back to the raw kind for unknown tool call shapes', () => {
    const mapped = mapCursorSdkToolStart({ type: 'somethingNew', args: { a: 1 } } as never);
    expect(mapped.name).toBe('somethingNew');
    expect(mapped.input).toEqual({ a: 1 });
  });

  it('tolerates missing args', () => {
    const mapped = mapCursorSdkToolStart({ type: 'read' } as never);
    expect(mapped.input).toEqual({});
  });
});

describe('mapCursorSdkToolCompletion', () => {
  it('renders success results as capped text content', () => {
    const mapped = mapCursorSdkToolCompletion({
      type: 'shell',
      args: { command: 'ls' },
      result: { status: 'success', value: { exitCode: 0, stdout: 'file.md', stderr: '', signal: '', executionTime: 3 } },
    } as never, 'completed');
    expect(mapped.isError).toBe(false);
    expect(mapped.content).toContain('file.md');
  });

  it('marks error results and surfaces the message', () => {
    const mapped = mapCursorSdkToolCompletion({
      type: 'shell',
      args: { command: 'x' },
      result: { status: 'error', error: 'command not found' },
    } as never, 'error');
    expect(mapped.isError).toBe(true);
    expect(mapped.content).toContain('command not found');
  });

  it('caps very large results', () => {
    const big = 'x'.repeat(300_000);
    const mapped = mapCursorSdkToolCompletion(
      { type: 'read', args: {}, result: { status: 'success', value: big } } as never,
      'completed',
    );
    expect(mapped.content.length).toBeLessThan(120_000);
    expect(mapped.content).toContain('truncated');
  });
});

describe('capCursorSdkToolResult', () => {
  it('passes short strings through untouched', () => {
    expect(capCursorSdkToolResult('short')).toBe('short');
  });
});

describe('CURSOR_SDK_CANONICAL_TOOL_NAMES', () => {
  it('contains the canonical names the mapper can emit', () => {
    for (const name of [TOOL_READ, TOOL_BASH, TOOL_GREP, TOOL_GLOB, TOOL_LS, TOOL_EDIT, TOOL_WRITE, TOOL_SUBAGENT, TOOL_TODO_WRITE]) {
      expect(CURSOR_SDK_CANONICAL_TOOL_NAMES.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkToolMapping.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/providers/cursor/runtime/cursorSdkToolMapping.ts`:

```typescript
import type { ToolCall } from '@cursor/sdk';

import {
  TOOL_BASH, TOOL_EDIT, TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_MCP, TOOL_READ,
  TOOL_SUBAGENT, TOOL_TODO_WRITE, TOOL_WRITE,
} from '../../../core/tools/toolNames';

/** Rendered under this name so plan-completion detection has one anchor. */
export const CURSOR_SDK_PLAN_TOOL_NAME = 'CreatePlan';

// A single tool result (e.g. a whole-vault audit) can be many megabytes.
// Rendering that synchronously freezes Obsidian's UI thread, so displayed
// content is capped. The agent still received the full result in-process.
export const MAX_CURSOR_SDK_TOOL_RESULT_CHARS = 100_000;

const KIND_TO_CANONICAL: Readonly<Record<string, string>> = {
  read: TOOL_READ,
  shell: TOOL_BASH,
  grep: TOOL_GREP,
  glob: TOOL_GLOB,
  ls: TOOL_LS,
  edit: TOOL_EDIT,
  write: TOOL_WRITE,
  delete: TOOL_WRITE,
  mcp: TOOL_MCP,
  task: TOOL_SUBAGENT,
  updateTodos: TOOL_TODO_WRITE,
  createPlan: CURSOR_SDK_PLAN_TOOL_NAME,
  readLints: 'ReadLints',
  semSearch: 'SemSearch',
};

export const CURSOR_SDK_CANONICAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  Object.values(KIND_TO_CANONICAL),
);

export function capCursorSdkToolResult(value: string): string {
  if (value.length <= MAX_CURSOR_SDK_TOOL_RESULT_CHARS) {
    return value;
  }
  const omitted = value.length - MAX_CURSOR_SDK_TOOL_RESULT_CHARS;
  return `${value.slice(0, MAX_CURSOR_SDK_TOOL_RESULT_CHARS)}\n… [truncated ${omitted} characters]`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export interface MappedCursorToolStart {
  name: string;
  input: Record<string, unknown>;
}

export function mapCursorSdkToolStart(toolCall: ToolCall): MappedCursorToolStart {
  const record = asRecord(toolCall);
  const kind = typeof record.type === 'string' ? record.type : 'tool';
  return {
    name: KIND_TO_CANONICAL[kind] ?? kind,
    input: asRecord(record.args),
  };
}

export interface MappedCursorToolCompletion {
  content: string;
  isError: boolean;
}

function renderResultValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function mapCursorSdkToolCompletion(
  toolCall: ToolCall,
  status: 'completed' | 'error',
): MappedCursorToolCompletion {
  const record = asRecord(toolCall);
  const result = asRecord(record.result);
  const resultStatus = typeof result.status === 'string' ? result.status : undefined;
  const isError = status === 'error' || resultStatus === 'error';

  if (isError) {
    const message =
      typeof result.error === 'string' && result.error.trim()
        ? result.error
        : renderResultValue(record.result ?? 'Tool call failed');
    return { content: capCursorSdkToolResult(message), isError: true };
  }

  const payload = 'value' in result ? result.value : record.result ?? '';
  return { content: capCursorSdkToolResult(renderResultValue(payload)), isError: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkToolMapping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/cursorSdkToolMapping.ts tests/unit/providers/cursor/runtime/cursorSdkToolMapping.test.ts
git commit -m "feat(cursor): typed SDK tool-call mapping with result caps"
```

---

### Task 5: Two-channel stream adapter (`cursorSdkStreamAdapter.ts`)

The heart of the migration: one ordered `StreamChunk` queue fed by `onDelta` updates (typing effect) and `run.stream()` messages (lifecycle), replacing the NDJSON reducer, its snapshot-dedup heuristics, and the chunk tracker.

**Files:**
- Create: `src/providers/cursor/runtime/cursorSdkStreamAdapter.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorSdkStreamAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { createCursorSdkStreamAdapter } from '@/providers/cursor/runtime/cursorSdkStreamAdapter';
import type { StreamChunk } from '@/core/types';

async function collect(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

const USAGE = {
  inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0, totalTokens: 170,
};

describe('cursorSdkStreamAdapter', () => {
  it('streams text deltas and drops the duplicate whole-message assistant text', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleDelta({ type: 'text-delta', text: 'Hel' } as never);
    adapter.handleDelta({ type: 'text-delta', text: 'lo' } as never);
    adapter.handleMessage({
      type: 'assistant', agent_id: 'a', run_id: 'r',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
    } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);

    const chunks = await collect(adapter.chunks());
    const texts = chunks.filter((c) => c.type === 'text');
    expect(texts.map((c) => (c as { content: string }).content)).toEqual(['Hel', 'lo']);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('emits assistant text from messages when no deltas were seen', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleMessage({
      type: 'assistant', agent_id: 'a', run_id: 'r',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Whole answer' }] },
    } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);

    const chunks = await collect(adapter.chunks());
    expect(chunks.some((c) => c.type === 'text' && c.content === 'Whole answer')).toBe(true);
  });

  it('maps thinking deltas', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleDelta({ type: 'thinking-delta', text: 'hmm' } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    const chunks = await collect(adapter.chunks());
    expect(chunks.some((c) => c.type === 'thinking' && c.content === 'hmm')).toBe(true);
  });

  it('maps tool_call running/completed to tool_use/tool_result', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleMessage({
      type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'c1', name: 'shell',
      status: 'running', args: { type: 'shell', args: { command: 'ls' } },
    } as never);
    adapter.handleMessage({
      type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'c1', name: 'shell',
      status: 'completed',
      args: { type: 'shell', args: { command: 'ls' }, result: { status: 'success', value: 'ok' } },
    } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);

    const chunks = await collect(adapter.chunks());
    const use = chunks.find((c) => c.type === 'tool_use');
    const result = chunks.find((c) => c.type === 'tool_result');
    expect(use).toMatchObject({ id: 'c1', name: 'Bash', input: { command: 'ls' } });
    expect(result).toMatchObject({ id: 'c1' });
  });

  it('emits usage through buildUsageInfo with the stamped model', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleMessage({ type: 'usage', agent_id: 'a', run_id: 'r', usage: USAGE } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    const chunks = await collect(adapter.chunks());
    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    expect((usage as { usage: { model: string } }).usage.model).toBe('sonnet-4');
  });

  it('drops usage when no model is known (usage contract)', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: undefined });
    adapter.handleMessage({ type: 'usage', agent_id: 'a', run_id: 'r', usage: USAGE } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    const chunks = await collect(adapter.chunks());
    expect(chunks.some((c) => c.type === 'usage')).toBe(false);
  });

  it('adopts the model from the system init message', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: undefined });
    adapter.handleMessage({
      type: 'system', subtype: 'init', agent_id: 'a', run_id: 'r', model: { id: 'gpt-5' },
    } as never);
    adapter.handleMessage({ type: 'usage', agent_id: 'a', run_id: 'r', usage: USAGE } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    const chunks = await collect(adapter.chunks());
    expect((chunks.find((c) => c.type === 'usage') as { usage: { model: string } }).usage.model).toBe('gpt-5');
  });

  it('flags planCompleted when a CreatePlan tool completes during a plan turn', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: true, model: 'sonnet-4' });
    adapter.handleMessage({
      type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'p1', name: 'createPlan',
      status: 'running', args: { type: 'createPlan', args: {} },
    } as never);
    adapter.handleMessage({
      type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'p1', name: 'createPlan',
      status: 'completed', args: { type: 'createPlan', args: {}, result: { status: 'success', value: 'plan.md' } },
    } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    await collect(adapter.chunks());
    expect(adapter.getTurnMetadata()).toEqual({ planCompleted: true });
  });

  it('emits error + done on a failed run result', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.finalize({ id: 'r', status: 'error', error: { message: 'boom' } } as never);
    const chunks = await collect(adapter.chunks());
    expect(chunks).toEqual([{ type: 'error', content: 'boom' }, { type: 'done' }]);
  });

  it('suppresses the error chunk on cancellation but still closes with done', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.finalize({ id: 'r', status: 'cancelled' } as never, { canceled: true });
    const chunks = await collect(adapter.chunks());
    expect(chunks).toEqual([{ type: 'done' }]);
  });

  it('fails the stream with error + done when the pump throws', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.fail(new Error('transport died'));
    const chunks = await collect(adapter.chunks());
    expect(chunks).toEqual([{ type: 'error', content: 'transport died' }, { type: 'done' }]);
  });

  it('maps shell-output-delta to tool_output for the active call', async () => {
    const adapter = createCursorSdkStreamAdapter({ isPlanTurn: false, model: 'sonnet-4' });
    adapter.handleDelta({ type: 'shell-output-delta', callId: 'c9', output: 'partial…' } as never);
    adapter.finalize({ id: 'r', status: 'finished' } as never);
    const chunks = await collect(adapter.chunks());
    expect(chunks.some((c) => c.type === 'tool_output' && c.id === 'c9')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkStreamAdapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/providers/cursor/runtime/cursorSdkStreamAdapter.ts`:

```typescript
import type { InteractionUpdate, RunResult, SDKMessage } from '@cursor/sdk';

import { buildUsageInfo } from '../../../core/providers/usage';
import type { ChatTurnMetadata } from '../../../core/runtime/types';
import type { StreamChunk } from '../../../core/types';
import { getCursorModelContextWindow } from './cursorModelWindowCatalog';
import {
  CURSOR_SDK_PLAN_TOOL_NAME,
  mapCursorSdkToolCompletion,
  mapCursorSdkToolStart,
} from './cursorSdkToolMapping';

export interface CursorSdkStreamAdapterInput {
  isPlanTurn: boolean;
  /** Model id resolved at send time; the system init message can override it. */
  model: string | undefined;
}

export interface CursorSdkFinalizeFlags {
  canceled?: boolean;
}

export interface CursorSdkStreamAdapter {
  handleDelta(update: InteractionUpdate): void;
  handleMessage(message: SDKMessage): void;
  finalize(result: RunResult, flags?: CursorSdkFinalizeFlags): void;
  /** Terminal failure of the pump itself (transport error, thrown iterator). */
  fail(error: unknown): void;
  chunks(): AsyncGenerator<StreamChunk>;
  getTurnMetadata(): ChatTurnMetadata;
  /** Latest agent id observed on any message (session id for persistence). */
  getAgentId(): string | null;
}

/** Single-consumer async queue: push() feeds, end() closes, chunks() drains. */
class ChunkQueue {
  private buffer: StreamChunk[] = [];
  private notify: (() => void) | null = null;
  private ended = false;

  push(chunk: StreamChunk): void {
    if (this.ended) return;
    this.buffer.push(chunk);
    this.notify?.();
  }

  end(): void {
    this.ended = true;
    this.notify?.();
  }

  async *drain(): AsyncGenerator<StreamChunk> {
    for (;;) {
      while (this.buffer.length > 0) {
        yield this.buffer.shift() as StreamChunk;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.notify = resolve;
      });
      this.notify = null;
    }
  }
}

export function createCursorSdkStreamAdapter(
  input: CursorSdkStreamAdapterInput,
): CursorSdkStreamAdapter {
  const queue = new ChunkQueue();
  let model = input.model;
  let agentId: string | null = null;
  let sawDeltaText = false;
  let sawDeltaThinking = false;
  let sawPlanToolComplete = false;
  let terminal = false;
  /** tool_call `running` events already emitted, to pair completions. */
  const startedCalls = new Set<string>();

  function emitUsage(usage: {
    inputTokens: number; outputTokens: number; cacheReadTokens: number;
    cacheWriteTokens: number; totalTokens: number;
  }): void {
    // Usage contract: never emit without a model (see core/providers/usage).
    if (!model) return;
    queue.push({
      type: 'usage',
      usage: buildUsageInfo({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadTokens,
        contextTokens: usage.inputTokens + usage.cacheReadTokens + usage.outputTokens,
        contextWindow: getCursorModelContextWindow(model),
        contextWindowIsAuthoritative: false,
      }),
      sessionId: agentId,
    });
  }

  function handleToolCall(message: Extract<SDKMessage, { type: 'tool_call' }>): void {
    const callId = message.call_id;
    // `args` carries the typed ToolCall envelope on live messages.
    const toolCall = (message.args ?? { type: message.name }) as never;
    if (message.status === 'running') {
      if (startedCalls.has(callId)) return;
      startedCalls.add(callId);
      const start = mapCursorSdkToolStart(toolCall);
      queue.push({ type: 'tool_use', id: callId, name: start.name, input: start.input });
      return;
    }
    // completed | error — synthesize the start if the running event was missed.
    if (!startedCalls.has(callId)) {
      const start = mapCursorSdkToolStart(toolCall);
      startedCalls.add(callId);
      queue.push({ type: 'tool_use', id: callId, name: start.name, input: start.input });
    }
    const completion = mapCursorSdkToolCompletion(toolCall, message.status === 'error' ? 'error' : 'completed');
    if (input.isPlanTurn && !completion.isError) {
      const start = mapCursorSdkToolStart(toolCall);
      if (start.name === CURSOR_SDK_PLAN_TOOL_NAME) {
        sawPlanToolComplete = true;
      }
    }
    queue.push({
      type: 'tool_result',
      id: callId,
      content: completion.content,
      ...(completion.isError ? { isError: true } : {}),
    });
  }

  return {
    handleDelta(update: InteractionUpdate): void {
      const u = update as { type: string; text?: string; callId?: string; output?: string };
      switch (u.type) {
        case 'text-delta':
          if (u.text) {
            sawDeltaText = true;
            queue.push({ type: 'text', content: u.text });
          }
          return;
        case 'thinking-delta':
          if (u.text) {
            sawDeltaThinking = true;
            queue.push({ type: 'thinking', content: u.text });
          }
          return;
        case 'shell-output-delta':
          if (u.callId && u.output) {
            queue.push({ type: 'tool_output', id: u.callId, content: u.output });
          }
          return;
        default:
          // tool-call-started/completed arrive authoritatively via stream();
          // remaining delta kinds carry nothing the chat surface renders.
          return;
      }
    },

    handleMessage(message: SDKMessage): void {
      if ('agent_id' in message && typeof message.agent_id === 'string') {
        agentId = message.agent_id;
      }
      switch (message.type) {
        case 'system':
          if (message.model?.id) model = message.model.id;
          return;
        case 'assistant': {
          if (sawDeltaText) return; // already streamed via deltas
          let text = '';
          for (const block of message.message.content) {
            if (block.type === 'text') text += block.text;
          }
          if (text) queue.push({ type: 'text', content: text });
          return;
        }
        case 'thinking':
          if (!sawDeltaThinking && message.text) {
            queue.push({ type: 'thinking', content: message.text });
          }
          return;
        case 'tool_call':
          handleToolCall(message);
          return;
        case 'usage':
          emitUsage(message.usage);
          return;
        case 'status':
          if (message.status === 'ERROR' && message.message) {
            queue.push({ type: 'error', content: message.message });
          }
          return;
        case 'user':
        case 'request':
        case 'task':
        default:
          return;
      }
    },

    finalize(result: RunResult, flags?: CursorSdkFinalizeFlags): void {
      if (terminal) return;
      terminal = true;
      if (flags?.canceled) {
        queue.push({ type: 'done' });
        queue.end();
        return;
      }
      if (result.status === 'error') {
        queue.push({ type: 'error', content: result.error?.message ?? 'Cursor Agent run failed' });
      }
      if (result.usage) emitUsage(result.usage);
      queue.push({ type: 'done' });
      queue.end();
    },

    fail(error: unknown): void {
      if (terminal) return;
      terminal = true;
      const message = error instanceof Error ? error.message : String(error);
      queue.push({ type: 'error', content: message });
      queue.push({ type: 'done' });
      queue.end();
    },

    chunks(): AsyncGenerator<StreamChunk> {
      return queue.drain();
    },

    getTurnMetadata(): ChatTurnMetadata {
      return input.isPlanTurn && sawPlanToolComplete ? { planCompleted: true } : {};
    },

    getAgentId(): string | null {
      return agentId;
    },
  };
}
```

> `getCursorModelContextWindow` — this is the existing lookup in `cursorModelWindowCatalog.ts`. Open that file and use its actual exported name (it may be e.g. `resolveCursorContextWindow`); adjust the import, not the catalog. If the lookup returns `undefined` for unknown models, pass `undefined` through — `buildUsageInfo` handles the absent-window case (`clampPercentage` guards `window <= 0`). Also note: `RunResult.usage` (cumulative) is emitted only in `finalize` when present, AFTER any per-turn `usage` message — the UI keeps the last usage chunk, which is the more complete one.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkStreamAdapter.test.ts
```

Expected: PASS (13 tests). Also run the cross-provider usage contract:

```bash
npm run test -- tests/unit/providers/shared/usageContractMatrix.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/cursorSdkStreamAdapter.ts tests/unit/providers/cursor/runtime/cursorSdkStreamAdapter.test.ts
git commit -m "feat(cursor): two-channel SDK stream adapter replacing NDJSON reducer"
```

---

### Task 6: AskUserQuestion custom tool (`cursorSdkAskUserTool.ts`)

**Files:**
- Create: `src/providers/cursor/runtime/cursorSdkAskUserTool.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorSdkAskUserTool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { buildCursorAskUserTool } from '@/providers/cursor/runtime/cursorSdkAskUserTool';
import type { AskUserQuestionCallback } from '@/core/runtime/types';

describe('buildCursorAskUserTool', () => {
  it('forwards the question payload to askUser and returns the answers as text', async () => {
    const askUser: AskUserQuestionCallback = async (input) => {
      expect((input.questions as unknown[]).length).toBe(1);
      return { 'Which db?': 'sqlite' };
    };
    const tool = buildCursorAskUserTool(askUser, () => undefined);
    const result = await tool.execute(
      { questions: [{ question: 'Which db?', options: [{ label: 'sqlite' }] }] },
      {},
    );
    expect(String(result)).toContain('Which db?');
    expect(String(result)).toContain('sqlite');
  });

  it('returns a neutral no-answer result when the user dismisses', async () => {
    const tool = buildCursorAskUserTool(async () => null, () => undefined);
    const result = await tool.execute({ questions: [] }, {});
    expect(String(result)).toContain('did not answer');
  });

  it('returns a neutral result instead of throwing when askUser rejects (abort)', async () => {
    const tool = buildCursorAskUserTool(async () => {
      throw new Error('aborted');
    }, () => undefined);
    const result = await tool.execute({ questions: [] }, {});
    expect(String(result)).toContain('did not answer');
  });

  it('formats multi-select answers', async () => {
    const tool = buildCursorAskUserTool(async () => ({ Scope: ['a', 'b'] }), () => undefined);
    const result = await tool.execute({ questions: [] }, {});
    expect(String(result)).toContain('a, b');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkAskUserTool.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/providers/cursor/runtime/cursorSdkAskUserTool.ts`:

```typescript
import type { SDKCustomTool } from '@cursor/sdk';

import type { AskUserQuestionCallback } from '../../../core/runtime/types';

export const CURSOR_ASK_USER_TOOL_NAME = 'ask_user';

const NO_ANSWER_RESULT =
  'The user did not answer. Proceed with your best judgment and note any assumption you make.';

/**
 * AskUserQuestion over the SDK's in-process custom-tool channel: the model
 * calls `ask_user`, the shared modal collects the answer, and the tool result
 * delivers it back mid-turn — no auto-resumed follow-up turn (the old one-shot
 * CLI hack). Abort/dismiss resolves to a neutral result so the run completes.
 */
export function buildCursorAskUserTool(
  askUser: AskUserQuestionCallback,
  getSignal: () => AbortSignal | undefined,
): SDKCustomTool {
  return {
    description:
      'Ask the user one or more clarifying questions and wait for their answer. '
      + 'Use this whenever you need a decision or missing information from the user '
      + 'before continuing.',
    inputSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The complete question to ask.' },
              header: { type: 'string', description: 'Short label (max 12 chars).' },
              multiSelect: { type: 'boolean' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['label'],
                },
              },
            },
            required: ['question'],
          },
        },
      },
      required: ['questions'],
    },
    async execute(args) {
      let answers: Record<string, string | string[]> | null;
      try {
        answers = await askUser(args as Record<string, unknown>, getSignal());
      } catch {
        return NO_ANSWER_RESULT;
      }
      if (!answers || Object.keys(answers).length === 0) {
        return NO_ANSWER_RESULT;
      }
      const lines = Object.entries(answers).map(([question, answer]) => {
        const rendered = Array.isArray(answer) ? answer.join(', ') : answer;
        return `- ${question}: ${rendered}`;
      });
      return `The user answered:\n${lines.join('\n')}`;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorSdkAskUserTool.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/cursorSdkAskUserTool.ts tests/unit/providers/cursor/runtime/cursorSdkAskUserTool.test.ts
git commit -m "feat(cursor): in-process ask_user custom tool for AskUserQuestion"
```

---

### Task 7: Shared SDK mock helper for tests

Every remaining task mocks `@cursor/sdk`. Centralize the scripted fake.

**Files:**
- Create: `tests/helpers/cursorSdkMock.ts`

- [ ] **Step 1: Write the helper** (no TDD — it IS test infrastructure; its consumers are the tests in Tasks 8–11 and 13)

```typescript
import type { InteractionUpdate, RunResult, SDKMessage } from '@cursor/sdk';

export interface ScriptedRun {
  messages: SDKMessage[];
  deltas?: InteractionUpdate[];
  result: RunResult;
  /** Resolves when cancel() is called on this run. */
  onCancel?: () => void;
}

export interface FakeSendCall {
  message: unknown;
  options: Record<string, unknown> | undefined;
}

/**
 * Builds the object jest.mock('@cursor/sdk') factories return. Scripted runs
 * are consumed in order; each send() drains the next script: deltas fire via
 * options.onDelta first, then stream() yields the messages, then wait()
 * resolves the result.
 */
export function createCursorSdkMock(scripts: ScriptedRun[]) {
  const sendCalls: FakeSendCall[] = [];
  const createCalls: Record<string, unknown>[] = [];
  const resumeCalls: Array<{ agentId: string; options: Record<string, unknown> | undefined }> = [];
  const closed: string[] = [];
  let nextAgentSerial = 0;

  function makeRun(script: ScriptedRun, onDelta?: (args: { update: InteractionUpdate }) => unknown) {
    let cancelled = false;
    return {
      id: `run-${script.result.id}`,
      agentId: 'agent-under-test',
      status: 'running',
      supports: () => true,
      unsupportedReason: () => undefined,
      onDidChangeStatus: () => () => {},
      async *stream(): AsyncGenerator<SDKMessage, void> {
        for (const update of script.deltas ?? []) {
          await Promise.resolve(onDelta?.({ update }));
        }
        for (const message of script.messages) {
          if (cancelled) return;
          yield message;
        }
      },
      async conversation() {
        return [];
      },
      async wait(): Promise<RunResult> {
        return cancelled ? { ...script.result, status: 'cancelled' } : script.result;
      },
      async cancel(): Promise<void> {
        cancelled = true;
        script.onCancel?.();
      },
    };
  }

  function makeAgent(agentId: string) {
    return {
      agentId,
      model: undefined,
      async send(message: unknown, options?: Record<string, unknown>) {
        sendCalls.push({ message, options });
        const script = scripts.shift();
        if (!script) throw new Error('cursorSdkMock: no scripted run left for send()');
        return makeRun(script, options?.onDelta as never);
      },
      close() {
        closed.push(agentId);
      },
      async reload() {},
      async [Symbol.asyncDispose]() {},
      async listArtifacts() { return []; },
      async downloadArtifact() { return Buffer.alloc(0); },
    };
  }

  return {
    sendCalls,
    createCalls,
    resumeCalls,
    closed,
    module: {
      Agent: {
        create: jest.fn(async (options: Record<string, unknown>) => {
          createCalls.push(options);
          nextAgentSerial += 1;
          return makeAgent(`agent-${nextAgentSerial}`);
        }),
        resume: jest.fn(async (agentId: string, options?: Record<string, unknown>) => {
          resumeCalls.push({ agentId, options });
          return makeAgent(agentId);
        }),
        prompt: jest.fn(),
        list: jest.fn(async () => ({ items: [] })),
        listRuns: jest.fn(async () => ({ items: [] })),
        getRun: jest.fn(),
        messages: { list: jest.fn(async () => []) },
      },
      Cursor: {
        configure: jest.fn(),
        me: jest.fn(),
        models: { list: jest.fn(async () => []) },
        repositories: { list: jest.fn(async () => []) },
      },
    },
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/cursorSdkMock.ts
git commit -m "test(cursor): scripted @cursor/sdk mock helper"
```

---

### Task 8: Rewrite `CursorChatRuntime` on the SDK

**Files:**
- Rewrite: `src/providers/cursor/runtime/CursorChatRuntime.ts`
- Modify: `src/providers/cursor/registration.ts` (canonical tool names import swap)
- Test: rewrite `tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts`

- [ ] **Step 1: Write the failing tests** (replace the existing file's content wholesale — the old tests exercise the spawn path, which is gone)

```typescript
import type { RuntimeHost } from '@/core/runtime/RuntimeHost';
import type { PluginContext } from '@/core/types/PluginContext';
import type { StreamChunk } from '@/core/types';
import { createCursorSdkMock, type ScriptedRun } from '../../../../helpers/cursorSdkMock';

const sdkMockRef: { current: ReturnType<typeof createCursorSdkMock> | null } = { current: null };

jest.mock('@cursor/sdk', () => ({
  get Agent() { return sdkMockRef.current!.module.Agent; },
  get Cursor() { return sdkMockRef.current!.module.Cursor; },
}));

// Import AFTER the mock declaration.
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';

function makeHost(): RuntimeHost {
  return {
    approval: async () => 'cancel',
    dismissApproval: () => {},
    askUser: async () => null,
    exitPlanMode: async () => null,
    permissionModeSync: () => {},
    autoTurn: () => {},
    getSubagentState: () => ({ hasRunning: false }),
  };
}

function makePlugin(overrides?: { env?: Record<string, string>; permissionMode?: string }): PluginContext {
  return {
    app: {},
    settings: { permissionMode: overrides?.permissionMode ?? 'normal', model: 'auto' },
    getResolvedEnvironmentVariables: () => overrides?.env ?? { CURSOR_API_KEY: 'test-key' },
    logger: { scope: () => ({ debug() {}, info() {}, warn() {}, error() {}, isEnabled: () => false }) },
  } as unknown as PluginContext;
}

const FINISHED: ScriptedRun = {
  deltas: [{ type: 'text-delta', text: 'Hi' } as never],
  messages: [
    { type: 'system', subtype: 'init', agent_id: 'agent-1', run_id: 'r1', model: { id: 'auto' } } as never,
  ],
  result: { id: 'r1', status: 'finished', result: 'Hi' } as never,
};

async function drain(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('CursorChatRuntime (SDK)', () => {
  beforeEach(() => { sdkMockRef.current = createCursorSdkMock([FINISHED]); });

  it('is ready only when an API key resolves', async () => {
    const withKey = new CursorChatRuntime(makePlugin(), makeHost());
    expect(await withKey.ensureReady()).toBe(true);

    const withoutKey = new CursorChatRuntime(makePlugin({ env: {} }), makeHost());
    expect(await withoutKey.ensureReady()).toBe(false);
  });

  it('creates a new agent when no session exists and streams chunks', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    const turn = runtime.prepareTurn({ text: 'hello' });
    const chunks = await drain(runtime.query(turn));

    expect(chunks[0]).toMatchObject({ type: 'user_message_start' });
    expect(chunks[1]).toEqual({ type: 'assistant_message_start' });
    expect(chunks.some((c) => c.type === 'text' && c.content === 'Hi')).toBe(true);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
    expect(sdkMockRef.current!.module.Agent.create).toHaveBeenCalledTimes(1);
    expect(runtime.getSessionId()).toBe('agent-1');
  });

  it('resumes when the synced conversation carries a chatSessionId', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    runtime.syncConversationState({ sessionId: null, providerState: { chatSessionId: 'agent-9' } });
    await drain(runtime.query(runtime.prepareTurn({ text: 'again' })));
    expect(sdkMockRef.current!.module.Agent.resume).toHaveBeenCalledWith('agent-9', expect.anything());
  });

  it('errors cleanly without an API key', async () => {
    const runtime = new CursorChatRuntime(makePlugin({ env: {} }), makeHost());
    const chunks = await drain(runtime.query(runtime.prepareTurn({ text: 'x' })));
    expect(chunks.some((c) => c.type === 'error' && /CURSOR_API_KEY/.test(c.content))).toBe(true);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('closes the agent after the turn', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    await drain(runtime.query(runtime.prepareTurn({ text: 'x' })));
    expect(sdkMockRef.current!.closed.length).toBe(1);
  });

  it('cancel() cancels the active run and the stream still terminates with done', async () => {
    const cancelSeen: string[] = [];
    sdkMockRef.current = createCursorSdkMock([{
      ...FINISHED,
      onCancel: () => cancelSeen.push('cancelled'),
    }]);
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    const gen = runtime.query(runtime.prepareTurn({ text: 'long' }));
    const first = await gen.next(); // user_message_start
    expect(first.done).toBe(false);
    runtime.cancel();
    const rest: StreamChunk[] = [];
    for await (const c of gen) rest.push(c);
    expect(rest[rest.length - 1]).toEqual({ type: 'done' });
  });

  it('exposes planCompleted metadata after a plan turn completes the plan tool', async () => {
    sdkMockRef.current = createCursorSdkMock([{
      messages: [
        { type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'p1', name: 'createPlan', status: 'running', args: { type: 'createPlan', args: {} } } as never,
        { type: 'tool_call', agent_id: 'a', run_id: 'r', call_id: 'p1', name: 'createPlan', status: 'completed', args: { type: 'createPlan', args: {}, result: { status: 'success', value: 'ok' } } } as never,
      ],
      result: { id: 'r', status: 'finished' } as never,
    }]);
    const runtime = new CursorChatRuntime(makePlugin({ permissionMode: 'plan' }), makeHost());
    await drain(runtime.query(runtime.prepareTurn({ text: 'plan it' })));
    expect(runtime.consumeTurnMetadata()).toMatchObject({ planCompleted: true });
  });

  it('passes images through as SDK user-message images', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    const turn = runtime.prepareTurn({
      text: 'see this',
      images: [{ id: 'i1', name: 'shot.png', mediaType: 'image/png', data: 'AAAA' } as never],
    });
    await drain(runtime.query(turn));
    const [call] = sdkMockRef.current!.sendCalls;
    expect(call.message).toMatchObject({ images: [{ data: 'AAAA', mimeType: 'image/png' }] });
  });

  it('registers the ask_user custom tool on agent options', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    await drain(runtime.query(runtime.prepareTurn({ text: 'x' })));
    const [options] = sdkMockRef.current!.createCalls;
    const local = options.local as { customTools?: Record<string, unknown> };
    expect(local.customTools).toHaveProperty('ask_user');
  });

  it('buildSessionUpdates persists the agent id as chatSessionId', async () => {
    const runtime = new CursorChatRuntime(makePlugin(), makeHost());
    await drain(runtime.query(runtime.prepareTurn({ text: 'x' })));
    const updates = runtime.buildSessionUpdates({ conversation: null, sessionInvalidated: false });
    expect(updates.updates.sessionId).toBe('agent-1');
    expect(updates.updates.providerState).toMatchObject({ chatSessionId: 'agent-1' });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npm run test -- tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts
```

Expected: FAIL (old runtime spawns processes / different constructor expectations).

- [ ] **Step 3: Implement the rewrite**

Replace `src/providers/cursor/runtime/CursorChatRuntime.ts` wholesale:

```typescript
import { Agent } from '@cursor/sdk';
import type { AgentOptions, Run, SDKAgent, SDKImage, SDKUserMessage } from '@cursor/sdk';

import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderCapabilities, ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { RuntimeHost } from '../../../core/runtime/RuntimeHost';
import type {
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  PreparedChatTurn,
  SessionUpdateResult,
} from '../../../core/runtime/types';
import type { ChatMessage, Conversation, ImageAttachment, SlashCommand, StreamChunk } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { getVaultPath } from '../../../utils/path';
import { CURSOR_PROVIDER_CAPABILITIES } from '../capabilities';
import { encodeCursorTurn } from '../prompt/encodeCursorTurn';
import { asSettingsBag } from '../../../core/types/settings';
import { getCursorState, resolveCursorSessionId } from '../types';
import { getCursorEnabledModels } from '../settings';
import { getCachedCursorModelIds } from './cursorModelCatalog';
import { cleanupStaleCursorMcpServer } from './cursorMcpCleanup';
import { buildCursorAskUserTool } from './cursorSdkAskUserTool';
import { applyCursorSdkProcessEnv, resolveCursorSdkEnvironment } from './cursorSdkEnv';
import {
  buildCursorAgentOptions,
  buildCursorSdkPromptText,
  resolveCursorSdkModelSelection,
} from './cursorSdkOptions';
import { createCursorSdkStreamAdapter } from './cursorSdkStreamAdapter';

export class CursorChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'cursor';

  private plugin: PluginContext;
  private readonly host: RuntimeHost;
  private ready = false;
  private readyListeners = new Set<(ready: boolean) => void>();
  private canceled = false;
  private lastSessionId: string | null = null;
  private activeResumeId: string | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private activeRun: Run | null = null;
  private activeAgent: SDKAgent | null = null;
  private askAbortController: AbortController | null = null;
  /**
   * One-shot guard for the dropped-tool-library `~/.cursor/mcp.json` migration.
   * Retained under the SDK: settingSources ['project','user'] re-reads user
   * Cursor settings, so the dead loopback entry would cost retries every send.
   */
  private staleMcpCleaned = false;

  constructor(plugin: PluginContext, host: RuntimeHost) {
    this.plugin = plugin;
    this.host = host;
  }

  getCapabilities(): Readonly<ProviderCapabilities> {
    return CURSOR_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return encodeCursorTurn(request);
  }

  consumeTurnMetadata(): ChatTurnMetadata {
    const metadata = { ...this.turnMetadata };
    this.turnMetadata = {};
    return metadata;
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(conversation: ChatRuntimeConversationState | null): void {
    this.activeResumeId = conversation ? resolveCursorSessionId(conversation) : null;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const env = resolveCursorSdkEnvironment(this.plugin);
    const nextReady = !!env.apiKey;
    if (this.ready !== nextReady) {
      this.ready = nextReady;
      for (const listener of this.readyListeners) listener(nextReady);
    }
    return nextReady;
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    this.turnMetadata = {};
    this.canceled = false;
    this.askAbortController?.abort();
    this.askAbortController = new AbortController();

    yield { type: 'user_message_start', content: turn.persistedContent };
    yield { type: 'assistant_message_start' };

    const env = resolveCursorSdkEnvironment(this.plugin);
    if (!env.apiKey) {
      yield {
        type: 'error',
        content: 'CURSOR_API_KEY not configured. Add it under Settings → Cursor → Environment.',
      };
      yield { type: 'done' };
      return;
    }
    applyCursorSdkProcessEnv(env);

    const permissionMode = this.plugin.settings.permissionMode;
    const isPlanTurn = permissionMode === 'plan';
    const resumeId = this.activeResumeId;
    const modelId = this.resolveModelId(queryOptions);

    const options = buildCursorAgentOptions({
      apiKey: env.apiKey,
      cwd: getVaultPath(this.plugin.app) ?? process.cwd(),
      permissionMode,
      modelId,
      customTools: {
        ask_user: buildCursorAskUserTool(
          (input, signal) => this.host.askUser(input, signal),
          () => this.askAbortController?.signal,
        ),
      },
    });

    const adapter = createCursorSdkStreamAdapter({ isPlanTurn, model: modelId });

    if (!this.staleMcpCleaned) {
      this.staleMcpCleaned = true;
      await cleanupStaleCursorMcpServer();
    }

    let agent: SDKAgent;
    try {
      agent = resumeId ? await Agent.resume(resumeId, options) : await Agent.create(options);
    } catch (error) {
      yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
      yield { type: 'done' };
      return;
    }
    this.activeAgent = agent;
    this.lastSessionId = agent.agentId;

    const promptText = buildCursorSdkPromptText({
      prompt: turn.prompt,
      requestText: turn.request.text,
      resumeSessionId: resumeId,
      conversationHistory,
      boundAgentPrompt: queryOptions?.boundAgentPrompt,
    });
    const message: SDKUserMessage = {
      text: promptText,
      ...(turn.request.images?.length
        ? { images: turn.request.images.map(toCursorSdkImage) }
        : {}),
    };

    // Pump runs concurrently with the consumer loop; every outcome funnels
    // through the adapter so the chunk stream always terminates with `done`.
    const pump = (async () => {
      const run = await agent.send(message, {
        mode: isPlanTurn ? 'plan' : 'agent',
        onDelta: ({ update }) => adapter.handleDelta(update),
      });
      this.activeRun = run;
      if (this.canceled) {
        await run.cancel();
      }
      for await (const sdkMessage of run.stream()) {
        adapter.handleMessage(sdkMessage);
      }
      const result = await run.wait();
      adapter.finalize(result, { canceled: this.canceled });
    })();
    pump.catch((error) => adapter.fail(error));

    try {
      for await (const chunk of adapter.chunks()) {
        yield chunk;
      }
    } finally {
      await pump.catch(() => {});
      this.activeRun = null;
      this.activeAgent = null;
      this.askAbortController?.abort();
      this.askAbortController = null;
      agent.close();

      const agentId = adapter.getAgentId() ?? agent.agentId;
      if (agentId) {
        this.lastSessionId = agentId;
        this.activeResumeId = agentId;
      }
      this.turnMetadata = { ...this.turnMetadata, ...adapter.getTurnMetadata() };
    }
  }

  private resolveModelId(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    const settingsBag = asSettingsBag(this.plugin.settings);
    const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(settingsBag, 'cursor');
    const familyValue =
      queryOptions?.model
      ?? (typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : undefined);
    const mode = typeof snapshot.effortLevel === 'string' ? snapshot.effortLevel : undefined;
    return resolveCursorSdkModelSelection(familyValue, mode, {
      catalogIds: getCachedCursorModelIds(),
      enabledIds: getCursorEnabledModels(settingsBag),
    });
  }

  cancel(): void {
    this.canceled = true;
    this.askAbortController?.abort();
    const run = this.activeRun;
    if (run) {
      void run.cancel().catch(() => {});
    }
  }

  resetSession(): void {
    this.lastSessionId = null;
    this.activeResumeId = null;
  }

  getSessionId(): string | null {
    return this.lastSessionId;
  }

  consumeSessionInvalidation(): boolean {
    return false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  async cleanup(): Promise<void> {
    this.cancel();
    this.activeAgent?.close();
    this.activeAgent = null;
    this.readyListeners.clear();
  }

  // rewind() omitted — Cursor Agent does not support rewind
  // (supportsRewind: false). Callers gate on capability; ADR-0001 Phase 2.

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    if (params.sessionInvalidated && params.conversation) {
      return { updates: { sessionId: null, providerState: undefined } };
    }
    const sid = this.lastSessionId;
    const existing = params.conversation ? getCursorState(params.conversation.providerState) : {};
    const providerState: Record<string, unknown> = { ...existing };
    if (sid) {
      providerState.chatSessionId = sid;
    }
    return {
      updates: {
        sessionId: sid,
        providerState: Object.keys(providerState).length > 0 ? providerState : undefined,
      },
    };
  }

  resolveSessionIdForFork(_conversation: Conversation | null): string | null {
    return null;
  }
}

function toCursorSdkImage(image: ImageAttachment): SDKImage {
  return { data: image.data, mimeType: image.mediaType };
}
```

In `src/providers/cursor/registration.ts`, swap the canonical-names import:

```typescript
// before
import { CURSOR_CANONICAL_TOOL_NAMES } from './runtime/cursorToolNormalization';
// after
import { CURSOR_SDK_CANONICAL_TOOL_NAMES } from './runtime/cursorSdkToolMapping';
```

and use `canonicalToolNames: CURSOR_SDK_CANONICAL_TOOL_NAMES`.

> Import provenance (verified): `asSettingsBag` is exported from `src/core/types/settings.ts:250`; `getCursorEnabledModels` from `../settings` (both already imported this way by `cursorQueryLaunch.ts`).
> Session-id validation: `agent.agentId` values flow into `providerState`; they are SDK-generated (not user input), and the old `isValidCursorSessionId` guard protected **path joins** into `~/.cursor/chats/` which no longer happen. The history service (Task 9) passes ids to SDK APIs, not `path.join` — no validation call needed, but never interpolate the id into a filesystem path.

- [ ] **Step 4: Run the tests**

```bash
npm run test -- tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts
npm run typecheck
```

Expected: PASS / clean. (The legacy modules the runtime no longer imports still compile standalone.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/runtime/CursorChatRuntime.ts src/providers/cursor/registration.ts tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts
git commit -m "feat(cursor): rewrite CursorChatRuntime on @cursor/sdk"
```

---

### Task 9: Rewrite the history service on SDK APIs

**Files:**
- Rewrite: `src/providers/cursor/history/CursorConversationHistoryService.ts`
- Create: `src/providers/cursor/history/cursorSdkHistoryMapping.ts`
- Delete (in Task 12; unused after this task): `src/providers/cursor/history/cursorHistoryStore.ts`
- Test: rewrite `tests/unit/providers/cursor/history/CursorConversationHistoryService.test.ts`, create `tests/unit/providers/cursor/history/cursorSdkHistoryMapping.test.ts`

- [ ] **Step 1: Write the failing mapping test** (`cursorSdkHistoryMapping.test.ts`)

```typescript
import { mapCursorAgentMessagesToChat } from '@/providers/cursor/history/cursorSdkHistoryMapping';

describe('mapCursorAgentMessagesToChat', () => {
  it('maps user and assistant text messages in order', () => {
    const messages = mapCursorAgentMessagesToChat([
      { type: 'user', uuid: 'u1', agent_id: 'a', message: { role: 'user', content: [{ type: 'text', text: 'question' }] } },
      { type: 'assistant', uuid: 'a1', agent_id: 'a', message: { role: 'assistant', content: [{ type: 'text', text: 'answer' }] } },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'question' });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'answer' });
  });

  it('attaches tool_use blocks as tool calls on the assistant message', () => {
    const messages = mapCursorAgentMessagesToChat([
      {
        type: 'assistant', uuid: 'a1', agent_id: 'a',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'running' },
            { type: 'tool_use', id: 't1', name: 'shell', input: { command: 'ls' } },
          ],
        },
      },
    ]);
    expect(messages[0].toolCalls?.[0]).toMatchObject({ id: 't1', name: 'Bash' });
  });

  it('skips unparseable payloads without throwing', () => {
    const messages = mapCursorAgentMessagesToChat([
      { type: 'assistant', uuid: 'x', agent_id: 'a', message: 42 },
      { type: 'user', uuid: 'u1', agent_id: 'a', message: { role: 'user', content: [{ type: 'text', text: 'ok' }] } },
    ]);
    expect(messages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the mapping**

```bash
npm run test -- tests/unit/providers/cursor/history/cursorSdkHistoryMapping.test.ts
```

Create `src/providers/cursor/history/cursorSdkHistoryMapping.ts`:

```typescript
import type { AgentMessage } from '@cursor/sdk';

import type { ChatMessage, ToolCallInfo } from '../../../core/types';
import { mapCursorSdkToolStart } from '../../runtime/cursorSdkToolMapping';

interface ParsedBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

function blocksOf(message: unknown): ParsedBlock[] {
  if (!message || typeof message !== 'object') return [];
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content)
    ? content.filter((b): b is ParsedBlock => !!b && typeof b === 'object')
    : [];
}

/**
 * Maps Agent.messages.list payloads onto ChatMessages. Tool results are not
 * present in the message list (clean-break v1 limitation): tool calls render
 * with name+input only. Unparseable entries are skipped, never thrown.
 */
export function mapCursorAgentMessagesToChat(messages: AgentMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let serial = 0;

  for (const entry of messages) {
    const blocks = blocksOf(entry.message);
    if (blocks.length === 0) continue;
    serial += 1;

    let text = '';
    const toolCalls: ToolCallInfo[] = [];
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text += block.text;
      } else if (block.type === 'tool_use' && typeof block.id === 'string') {
        const mapped = mapCursorSdkToolStart({
          type: typeof block.name === 'string' ? block.name : 'tool',
          args: block.input,
        } as never);
        // Historical tool calls are finished; results are not present in the
        // message-list payload (documented v1 limitation).
        toolCalls.push({ id: block.id, name: mapped.name, input: mapped.input, status: 'completed' });
      }
    }
    if (!text && toolCalls.length === 0) continue;

    out.push({
      id: entry.uuid || `cursor-history-${serial}`,
      role: entry.type === 'user' ? 'user' : 'assistant',
      content: text,
      timestamp: serial,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    } as ChatMessage);
  }
  return out;
}
```

> `ChatMessage` / `ToolCallInfo` field names: mirror what `cursorHistoryStore.ts` produces today (`buildChatMessagesFromCursorHistoryRecords`) — open it and copy the exact object shapes (e.g. whether tool calls live on `toolCalls` and which fields `ToolCallInfo` requires). The test above encodes the intended shape; adjust BOTH to the real contract before implementing.

- [ ] **Step 3: Rewrite the history service + its test**

Test (`CursorConversationHistoryService.test.ts`, replace wholesale):

```typescript
import { createCursorSdkMock } from '../../../../helpers/cursorSdkMock';

const sdkMockRef: { current: ReturnType<typeof createCursorSdkMock> | null } = { current: null };
jest.mock('@cursor/sdk', () => ({
  get Agent() { return sdkMockRef.current!.module.Agent; },
  get Cursor() { return sdkMockRef.current!.module.Cursor; },
}));

import { CursorConversationHistoryService } from '@/providers/cursor/history/CursorConversationHistoryService';

const CONVO = {
  id: 'c1', providerId: 'cursor', sessionId: 'agent-7',
  providerState: { chatSessionId: 'agent-7' },
} as never;

describe('CursorConversationHistoryService (SDK)', () => {
  beforeEach(() => { sdkMockRef.current = createCursorSdkMock([]); });

  it('loads messages via Agent.messages.list keyed by the stored agent id', async () => {
    sdkMockRef.current!.module.Agent.messages.list.mockResolvedValue([
      { type: 'user', uuid: 'u1', agent_id: 'agent-7', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } },
      { type: 'assistant', uuid: 'a1', agent_id: 'agent-7', message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] } },
    ]);
    const service = new CursorConversationHistoryService();
    const outcome = await service.loadMessages(CONVO, { vaultPath: '/vault' } as never);
    expect(outcome.kind).toBe('loaded');
    expect(sdkMockRef.current!.module.Agent.messages.list).toHaveBeenCalledWith(
      'agent-7',
      expect.objectContaining({ cwd: '/vault' }),
    );
  });

  it('returns empty when the agent has no messages', async () => {
    sdkMockRef.current!.module.Agent.messages.list.mockResolvedValue([]);
    const service = new CursorConversationHistoryService();
    const outcome = await service.loadMessages(CONVO, { vaultPath: '/vault' } as never);
    expect(outcome.kind).toBe('empty');
  });

  it('returns an error outcome (never throws) when the SDK call fails', async () => {
    sdkMockRef.current!.module.Agent.messages.list.mockRejectedValue(new Error('nope'));
    const service = new CursorConversationHistoryService();
    const outcome = await service.loadMessages(CONVO, { vaultPath: '/vault' } as never);
    expect(outcome.kind).toBe('error');
  });

  it('extractLastUsage reads the latest run usage and never throws', async () => {
    sdkMockRef.current!.module.Agent.listRuns.mockResolvedValue({
      items: [{ usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 15 }, model: { id: 'sonnet-4' } }],
    });
    const service = new CursorConversationHistoryService();
    const usage = await service.extractLastUsage?.(CONVO, { vaultPath: '/vault' } as never);
    expect(usage?.model).toBe('sonnet-4');

    sdkMockRef.current!.module.Agent.listRuns.mockRejectedValue(new Error('x'));
    await expect(service.extractLastUsage?.(CONVO, { vaultPath: '/vault' } as never)).resolves.toBeNull();
  });
});
```

Implementation sketch for the service rewrite (the exact base-class hooks come from `BaseHistoryService` — keep `computeCacheKey` keyed on the agent id, mirror the current outcome shapes):

```typescript
import { Agent } from '@cursor/sdk';

import { buildUsageInfo } from '../../../core/providers/usage';
import { resolveCursorSessionId } from '../types';
import { getCursorModelContextWindow } from '../runtime/cursorModelWindowCatalog';
import { mapCursorAgentMessagesToChat } from './cursorSdkHistoryMapping';

// Inside the class (extends BaseHistoryService<CursorProviderState> like today):
// - loadMessages: resolveCursorSessionId(conversation) → null ⇒ empty outcome;
//   Agent.messages.list(agentId, { cwd: ctx.vaultPath }) → mapCursorAgentMessagesToChat
//   → 'loaded' | 'empty'; catch ⇒ 'error' outcome with the message, sourceRef `sdk:${agentId}`.
// - extractLastUsage: Agent.listRuns(agentId, { runtime: 'local', cwd }) →
//   last item with usage → buildUsageInfo({ model: run.model?.id ?? fallback from settings,
//   inputTokens, outputTokens, cacheReadInputTokens: cacheReadTokens,
//   contextTokens: input+cacheRead+output, contextWindow: getCursorModelContextWindow(model),
//   contextWindowIsAuthoritative: false }); any failure ⇒ null.
// - deleteConversationSession: v1 no-op that logs at debug — Agent.delete is
//   cloud-only and local store row surgery is out of scope (spec §history).
```

Write the full class following the current file's structure (open it side-by-side; the outcome literals `loaded`/`empty`/`error` and `sourceRef` field are already defined there — reuse them verbatim).

- [ ] **Step 4: Run the tests**

```bash
npm run test -- tests/unit/providers/cursor/history/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/history/ tests/unit/providers/cursor/history/
git commit -m "feat(cursor): history hydration via Agent.messages.list (clean break)"
```

---

### Task 10: Aux runner on the SDK (`CursorSdkAuxRunner`)

**Files:**
- Create: `src/providers/cursor/runtime/CursorSdkAuxRunner.ts`
- Modify: `src/providers/cursor/auxiliary/CursorTitleGenerationService.ts`, `CursorInstructionRefineService.ts`, `CursorInlineEditService.ts` (constructor swap: `new CursorAuxCliRunner(plugin)` → `new CursorSdkAuxRunner(plugin)`)
- Test: `tests/unit/providers/cursor/runtime/CursorSdkAuxRunner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { createCursorSdkMock, type ScriptedRun } from '../../../../helpers/cursorSdkMock';

const sdkMockRef: { current: ReturnType<typeof createCursorSdkMock> | null } = { current: null };
jest.mock('@cursor/sdk', () => ({
  get Agent() { return sdkMockRef.current!.module.Agent; },
  get Cursor() { return sdkMockRef.current!.module.Cursor; },
}));

import { CursorSdkAuxRunner } from '@/providers/cursor/runtime/CursorSdkAuxRunner';
import type { PluginContext } from '@/core/types/PluginContext';

const plugin = {
  app: {},
  settings: {},
  getResolvedEnvironmentVariables: () => ({ CURSOR_API_KEY: 'k' }),
} as unknown as PluginContext;

const OK: ScriptedRun = {
  messages: [],
  result: { id: 'r1', status: 'finished', result: 'Generated Title' } as never,
};

describe('CursorSdkAuxRunner', () => {
  beforeEach(() => { sdkMockRef.current = createCursorSdkMock([OK]); });

  it('runs a one-shot plan-mode agent and returns the result text', async () => {
    const runner = new CursorSdkAuxRunner(plugin);
    const chunks: string[] = [];
    const text = await runner.query(
      { systemPrompt: 'You generate titles.', onTextChunk: (t) => chunks.push(t) },
      'Chat about databases',
    );
    expect(text).toBe('Generated Title');
    expect(chunks).toEqual(['Generated Title']);
    const [options] = sdkMockRef.current!.createCalls;
    expect(options.mode).toBe('plan');
    expect(sdkMockRef.current!.closed).toHaveLength(1);
  });

  it('resumes its own aux session on the second query and resets cleanly', async () => {
    sdkMockRef.current = createCursorSdkMock([OK, OK, OK]);
    const runner = new CursorSdkAuxRunner(plugin);
    await runner.query({ systemPrompt: 's' }, 'p1');
    await runner.query({ systemPrompt: 's' }, 'p2');
    expect(sdkMockRef.current!.module.Agent.resume).toHaveBeenCalledTimes(1);
    runner.reset();
    await runner.query({ systemPrompt: 's' }, 'p3');
    expect(sdkMockRef.current!.module.Agent.create).toHaveBeenCalledTimes(2);
  });

  it('throws on a failed run', async () => {
    sdkMockRef.current = createCursorSdkMock([
      { messages: [], result: { id: 'r', status: 'error', error: { message: 'quota' } } as never },
    ]);
    const runner = new CursorSdkAuxRunner(plugin);
    await expect(runner.query({ systemPrompt: 's' }, 'p')).rejects.toThrow('quota');
  });

  it('throws a clear error without an API key', async () => {
    const keyless = { ...plugin, getResolvedEnvironmentVariables: () => ({}) } as unknown as PluginContext;
    const runner = new CursorSdkAuxRunner(keyless);
    await expect(runner.query({ systemPrompt: 's' }, 'p')).rejects.toThrow(/CURSOR_API_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Create `src/providers/cursor/runtime/CursorSdkAuxRunner.ts`:

```typescript
import { Agent } from '@cursor/sdk';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type { PluginContext } from '../../../core/types/PluginContext';
import { getVaultPath } from '../../../utils/path';
import { buildCursorAuxAgentOptions, resolveCursorSdkModelSelection } from './cursorSdkOptions';
import { applyCursorSdkProcessEnv, resolveCursorSdkEnvironment } from './cursorSdkEnv';
import { getCachedCursorModelIds } from './cursorModelCatalog';

const AUX_TEXT_ONLY_DIRECTIVE =
  'Reply with plain text only. Do not create, modify, or delete any files.';

/**
 * One-shot aux transforms (title generation, instruction refine, inline edit)
 * over a short-lived SDK agent. Plan mode + a text-only directive replace the
 * CLI's read-only `--mode ask` posture (the SDK has no ask mode); aux runs can
 * never escalate to yolo. The aux session id persists across queries so
 * refine iterations share context, mirroring the CLI runner.
 */
export class CursorSdkAuxRunner implements AuxQueryRunner {
  private plugin: PluginContext;
  private agentId: string | null = null;

  constructor(plugin: PluginContext) {
    this.plugin = plugin;
  }

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const env = resolveCursorSdkEnvironment(this.plugin);
    if (!env.apiKey) {
      throw new Error('CURSOR_API_KEY not configured for Cursor auxiliary queries.');
    }
    applyCursorSdkProcessEnv(env);

    const modelId = resolveCursorSdkModelSelection(config.model, undefined, {
      catalogIds: getCachedCursorModelIds(),
      enabledIds: [],
    });
    const options = buildCursorAuxAgentOptions({
      apiKey: env.apiKey,
      cwd: getVaultPath(this.plugin.app) ?? process.cwd(),
      ...(modelId ? { modelId } : {}),
    });

    const agent = this.agentId
      ? await Agent.resume(this.agentId, options)
      : await Agent.create(options);
    try {
      const run = await agent.send(
        `${config.systemPrompt}\n\n${AUX_TEXT_ONLY_DIRECTIVE}\n\n${prompt}`,
        { mode: 'plan' },
      );
      const abort = config.abortController?.signal;
      const onAbort = () => void run.cancel().catch(() => {});
      abort?.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await run.wait();
        if (result.status !== 'finished') {
          throw new Error(result.error?.message ?? `Cursor aux run ${result.status}`);
        }
        const text = result.result ?? '';
        this.agentId = agent.agentId;
        config.onTextChunk?.(text);
        return text;
      } finally {
        abort?.removeEventListener('abort', onAbort);
      }
    } finally {
      agent.close();
    }
  }

  reset(): void {
    this.agentId = null;
  }
}
```

Swap the constructor in each of the three aux services, e.g. `CursorTitleGenerationService.ts`:

```typescript
// before
import { CursorAuxCliRunner } from '../runtime/CursorAuxCliRunner';
      createRunner: () => new CursorAuxCliRunner(plugin),
// after
import { CursorSdkAuxRunner } from '../runtime/CursorSdkAuxRunner';
      createRunner: () => new CursorSdkAuxRunner(plugin),
```

(`CursorInstructionRefineService` / `CursorInlineEditService` pass the runner to `super(...)` — same one-line swap.)

- [ ] **Step 3: Run the tests**

```bash
npm run test -- tests/unit/providers/cursor/runtime/CursorSdkAuxRunner.test.ts tests/unit/providers/cursor/auxiliary/
```

Expected: PASS (aux service tests may need their runner mock swapped to the new class name — update those test doubles, not the services).

- [ ] **Step 4: Commit**

```bash
git add src/providers/cursor/runtime/CursorSdkAuxRunner.ts src/providers/cursor/auxiliary/ tests/unit/providers/cursor/
git commit -m "feat(cursor): aux services on one-shot SDK runs"
```

---

### Task 11: Model catalog via `Cursor.models.list()`

**Files:**
- Modify: `src/providers/cursor/runtime/cursorModelCatalog.ts` — replace the `spawn(cli, ['--list-models'])` path inside `refreshCursorModelCatalog` with an SDK call; keep the cache, static fallback, and `seedCursorModelCatalogForTest`
- Modify: `src/providers/cursor/app/CursorWorkspaceServices.ts` — the warm-up call no longer needs a CLI path
- Test: update `tests/unit/providers/cursor/runtime/cursorModelCatalog.test.ts`

- [ ] **Step 1: Update the test** — replace spawn-mocking with the SDK mock:

```typescript
const sdkMockRef: { current: ReturnType<typeof createCursorSdkMock> | null } = { current: null };
jest.mock('@cursor/sdk', () => ({
  get Agent() { return sdkMockRef.current!.module.Agent; },
  get Cursor() { return sdkMockRef.current!.module.Cursor; },
}));

it('refreshes ids from Cursor.models.list and merges variants', async () => {
  sdkMockRef.current = createCursorSdkMock([]);
  sdkMockRef.current!.module.Cursor.models.list.mockResolvedValue([
    { id: 'sonnet-4', displayName: 'Sonnet 4' },
    { id: 'sonnet-4-thinking', displayName: 'Sonnet 4 Thinking' },
    { id: 'gpt-5', displayName: 'GPT-5' },
  ]);
  await refreshCursorModelCatalog({ apiKey: 'k' });
  expect(getCachedCursorModelIds()).toEqual(expect.arrayContaining(['sonnet-4', 'sonnet-4-thinking', 'gpt-5']));
});

it('keeps the static fallback when the SDK call fails', async () => {
  sdkMockRef.current = createCursorSdkMock([]);
  sdkMockRef.current!.module.Cursor.models.list.mockRejectedValue(new Error('offline'));
  resetCursorModelCatalog();
  await refreshCursorModelCatalog({ apiKey: 'k' });
  expect(getCachedCursorModelIds()).toEqual(expect.arrayContaining([...STATIC_FALLBACK_MODEL_IDS]));
});
```

Keep the existing cache/reset/seed tests; delete only the spawn/`parseModelListOutput` cases (that parser dies with the CLI). Adjust `refreshCursorModelCatalog`'s signature from `(cliPath, ...)` to `({ apiKey })` — update its call sites (`CursorWorkspaceServices.ts` warm-up, `visibleModelsPicker.ts` refresh) to pass the key from `resolveCursorSdkEnvironment(plugin).apiKey`, skipping refresh when null.

- [ ] **Step 2: Implement** — inside `refreshCursorModelCatalog`, replace the spawn with:

```typescript
import { Cursor } from '@cursor/sdk';
// ...
const models = await Cursor.models.list({ apiKey });
const ids = models.map((m) => m.id).filter((id) => typeof id === 'string' && id.trim());
```

then feed `ids` into the same cache-merge the CLI path used (static fallback on empty/throw, existing timeout semantics can drop — the SDK call has its own network handling; keep a `Promise.race` timeout only if the current tests assert one).

- [ ] **Step 3: Run the tests**

```bash
npm run test -- tests/unit/providers/cursor/runtime/cursorModelCatalog.test.ts tests/unit/providers/cursor/runtime/cursorModelFamily.realCatalog.test.ts tests/unit/providers/cursor/ui/
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/providers/cursor/runtime/cursorModelCatalog.ts src/providers/cursor/app/CursorWorkspaceServices.ts src/providers/cursor/ui/visibleModelsPicker.ts tests/unit/providers/cursor/
git commit -m "feat(cursor): model catalog via Cursor.models.list"
```

---### Task 12: Delete the legacy CLI cluster + prompt-encoder cleanup

**Files — Delete (21 source files + their tests):**

```text
src/providers/cursor/runtime/cursorStreamMapper.ts
src/providers/cursor/runtime/cursorToolNormalization.ts
src/providers/cursor/runtime/cursorToolNameMap.ts
src/providers/cursor/runtime/cursorToolInputMapping.ts
src/providers/cursor/runtime/cursorToolValueCoercion.ts
src/providers/cursor/runtime/cursorGrepFormatting.ts
src/providers/cursor/runtime/cursorTaskPayload.ts
src/providers/cursor/runtime/cursorTaskSubagent.ts
src/providers/cursor/runtime/cursorAskUserQuestion.ts
src/providers/cursor/runtime/cursorAgentSpawnLock.ts
src/providers/cursor/runtime/cursorProcessKill.ts
src/providers/cursor/runtime/cursorLaunchArgs.ts
src/providers/cursor/runtime/cursorLaunch.ts
src/providers/cursor/runtime/cursorWindowsSpawn.ts
src/providers/cursor/runtime/cursorCliPrompt.ts
src/providers/cursor/runtime/cursorAgentEnv.ts
src/providers/cursor/runtime/cursorQueryLaunch.ts
src/providers/cursor/runtime/cursorQueryLifecycle.ts
src/providers/cursor/runtime/cursorQueryProcessing.ts
src/providers/cursor/runtime/cursorUsageMapping.ts
src/providers/cursor/runtime/CursorAuxCliRunner.ts
src/providers/cursor/history/cursorHistoryStore.ts
```

(Also `CursorAuxCliRunner.ts` and `cursorHistoryStore.ts` — superseded in Tasks 9–10; 23 files total once those two are counted.)

**Files — Modify:**
- `src/providers/cursor/prompt/encodeCursorTurn.ts` — delete the image-count hint block (images are native now; keep the current-note and agent-mention hints)
- `src/providers/cursor/runtime/CursorTaskResultInterpreter.ts` — it imports from `cursorTaskPayload`; re-home the two helpers it actually uses into the interpreter file (or a new `cursorSdkTaskResult.ts`) with their existing tests
- `src/providers/cursor/ui/cursorSettingsWidgets.ts` — update the env-box description string (drop the `~/.cursor/chats/...` path claim; state that CURSOR_API_KEY is required for the SDK runtime)
- `src/core/runtime/types.ts` — update the `autoFollowUpText` doc comment (Cursor no longer uses it; the seam stays)
- `src/features/chat/...` — grep for the Cursor-specific auto-follow-up trigger; if `InputController`'s auto-send is generic over `ChatTurnMetadata.autoFollowUpText`, leave it (provider-neutral seam), delete nothing

- [ ] **Step 1: Delete files and fix stragglers**

```bash
git rm src/providers/cursor/runtime/{cursorStreamMapper,cursorToolNormalization,cursorToolNameMap,cursorToolInputMapping,cursorToolValueCoercion,cursorGrepFormatting,cursorTaskPayload,cursorTaskSubagent,cursorAskUserQuestion,cursorAgentSpawnLock,cursorProcessKill,cursorLaunchArgs,cursorLaunch,cursorWindowsSpawn,cursorCliPrompt,cursorAgentEnv,cursorQueryLaunch,cursorQueryLifecycle,cursorQueryProcessing,cursorUsageMapping,CursorAuxCliRunner}.ts
git rm src/providers/cursor/history/cursorHistoryStore.ts
npm run typecheck 2>&1 | head -50
```

Expected: a bounded list of dangling imports — fix each by moving to the new modules (`cursorSdkTypes` for `CursorPermissionMode`, `cursorSdkToolMapping` for tool names/caps, etc.). Iterate `typecheck` until clean.

- [ ] **Step 2: Delete the orphaned tests**

```bash
git rm tests/unit/providers/cursor/runtime/{cursorStreamMapper.fixture,cursorAskUserQuestion,cursorAskUserQuestionStream.fixture,cursorAgentSpawnLock,cursorAgentSpawnLockRecovery,cursorAgentSpawnSerialization,cursorProcessKill,cursorLaunch,cursorLaunchArgs,cursorCliPrompt,cursorCliPromptTempFile,cursorAgentEnv,cursorGrepFormatting,CursorAuxCliRunner,cursorQueryLifecycle}.test.ts
# cursorMcpCleanup.ts and its test are KEPT — see spec §File plan (settingSources re-reads ~/.cursor/mcp.json).
# plus any remaining *.test.ts that imported a deleted module — let Jest tell you:
npm run test 2>&1 | grep -E "Cannot find module|FAIL" | head -20
```

Iterate until the full suite is green.

- [ ] **Step 3: Full gate + ratchet baselines**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
npm run check:loc
npm run check:quality
```

The LOC guard and quality ratchet should IMPROVE (net-negative diff). If the baselines require locking in improved numbers (see `docs/build-ci/quality-gates.md`), update `scripts/quality-baseline.json` per its documented procedure in this same commit.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(cursor)!: delete hand-rolled cursor-agent CLI orchestration

The SDK runtime replaces the NDJSON reducer, tool normalization, spawn
lock, process-tree kill, launch args, Windows shell env, prompt temp
files, MCP cleanup migration, and the AskUserQuestion follow-up hack."
```

---

### Task 13: Integration smoke (`tests/integration/providers/cursor/`)

Closes hardening item T22 with the mocked SDK exercising runtime + adapter + options end-to-end.

**Files:**
- Create: `tests/integration/providers/cursor/cursorSdkRuntime.integration.test.ts`

- [ ] **Step 1: Write the test** — same mock pattern as Task 8, but assert the full turn contract in one place:

```typescript
// jest.mock('@cursor/sdk', ...) exactly as in Task 8, reusing createCursorSdkMock.
// Scenario 1 — full turn: text deltas + tool call + usage → chunk sequence is
//   [user_message_start, assistant_message_start, text*, tool_use, tool_result, usage, done]
//   and buildSessionUpdates persists the agent id.
// Scenario 2 — resume: second query on a synced conversation calls Agent.resume
//   with the persisted id and passes settingSources ['project','user'].
// Scenario 3 — ask_user: scripted run whose send() options are captured; invoke
//   options.local.customTools.ask_user.execute({questions:[...]}) with a host
//   whose askUser resolves an answer; assert the tool result contains it.
// Scenario 4 — cancel mid-stream: runtime.cancel() → stream ends with done, no error chunk.
// Scenario 5 — plan turn: createPlan completes → consumeTurnMetadata().planCompleted === true.
```

Write these five scenarios as real code following Task 8's helpers (factor shared setup into a local `describe` block; ~150 lines).

- [ ] **Step 2: Run integration project**

```bash
npm run test -- --selectProjects integration
```

Expected: PASS including the new file. (If the integration project config needs the `tests/integration/providers/cursor/` path registered, mirror how `tests/integration/providers/` handles other providers — check `jest.config` `projects` globs; most likely no change needed.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/providers/cursor/
git commit -m "test(cursor): SDK runtime integration smoke (T22)"
```

---

### Task 14: Docs, spec status, and final verification

**Files:**
- Modify: `CLAUDE.md` — Cursor bullets in "Architecture Status", the provider table row, and the Storage table (`.cursor` transcript row → SDK state under `~/.cursor/projects/`; drop the spawn-lock/NDJSON description; describe SDK runtime, `ask_user` custom tool, `CURSOR_API_KEY` requirement)
- Modify: `docs/product/user-manuals/install-cursor.md` — replace CLI-login instructions with API-key setup (Cursor Dashboard → API Keys); keep CLI install only as optional (`rg` discovery is PATH-based)
- Modify: `docs/superpowers/specs/2026-07-11-cursor-sdk-integration-design.md` — frontmatter `status: draft` → `status: implemented`; record the M1 sandbox-check outcome in the risks section
- Modify: `docs/issues/cursor-integration-hardening-pr2.md` — mark T22 landed; note the ACP-transport items are moot for Cursor (no longer a subprocess consumer)

- [ ] **Step 1: Update the docs above** (each is a focused edit; keep CLAUDE.md wording in the existing style)

- [ ] **Step 2: Full gate one last time**

```bash
npm run typecheck && npm run lint && npm run test && npm run build && npm run check:loc && npm run check:css && npm run check:artifacts && npm run check:quality
```

Expected: all green.

- [ ] **Step 3: In-app verification (manual / `verify` skill)** — the strategy-C safety net. In a real vault with a real `CURSOR_API_KEY`:
  1. Send a turn → text streams token-by-token; tool calls render with names and results.
  2. Follow-up turn → resumes the same agent (session id stable across turns).
  3. Restart Obsidian, reopen the conversation → history hydrates from the SDK store.
  4. Plan mode (Shift+Tab) → plan turn completes → post-plan approval card appears.
  5. Attach an image → model describes it (native image path).
  6. Prompt "ask me a clarifying question before answering" → `ask_user` modal appears; answer flows back mid-turn.
  7. Cancel mid-stream → stream stops promptly, no orphaned processes (Activity Monitor / Task Manager), next turn works.
  8. Remove `CURSOR_API_KEY` → provider reports not-ready with the actionable notice.
  9. **M1 sandbox check** (do this FIRST, during Task 8, not last): attempt one turn with `sandboxOptions: { enabled: true }` hardcoded on macOS/Linux; record whether it errors ("sandboxing is not supported") or works. If it works, flip `buildCursorAgentOptions` to `enabled: true` for non-win32 normal/plan (update the Task 3 tests) and delete the spec's degradation note; if it errors, keep `enabled: false` + add the one-time notice copy in settings.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "docs(cursor): SDK integration docs, install guide, spec status"
git push -u origin claude/cursor-sdk-integration-ymy4gb
```

---

## Task ordering & green-tree invariant

Tasks 1–11 are purely additive or behavior-swapping behind existing seams — the suite stays green after each. Task 12 is the single destructive sweep, executed only after the SDK path owns every consumer. Task 13–14 close testing and docs. If a task must be split across sessions, split at commit boundaries only.

## Out of scope (per spec non-goals)

Live async subagent lifecycle (`agents: {}` fast-follow), SDK-native MCP management, persistent-runtime promotion, fork/rewind, pre-migration conversation resumption, and any settings-UI redesign beyond copy updates.
