---
title: Subprocess PATH and Lifecycle Hardening
date: 2026-06-28
status: draft
scope: core/transport, core/providers, utils/env, providers/claude, providers/opencode, features/chat/services
---

# Subprocess PATH and Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Specorator child-process spawn resolve a single, complete PATH (fixing the Windows duplicate `Path`/`PATH` key that can hide `git`/`bash` from Cursor and others) and reap whole process trees on teardown.

**Architecture:** One shared `withCanonicalPath()` helper in `utils/env.ts` collapses all case-variants of the PATH key into exactly one `PATH` entry at every spawn site, removing the Windows case-insensitive-lookup ambiguity. `getExtraBinaryPaths()` gains Git install dirs (incl. per-user). `AgentSubprocess` spawns detached on POSIX and tears down by process group (POSIX) or `taskkill /T` (Windows). `opencodeSqlite` gets the enhanced PATH it currently lacks.

**Tech Stack:** TypeScript, Node `child_process`, Jest (unit + integration projects), Obsidian/Electron runtime.

**Why (root-cause summary):** On Windows, `{ ...process.env, PATH: x }` and the allowlist copy+override both produce an env object with two keys — `Path` (OS-cased, raw GUI PATH, often missing `Git\bin`) and `PATH` (enhanced). Windows env lookup is case-insensitive with no defined winner between duplicate-case keys, so a child (e.g. `cursor-agent` and the `git`/`bash` it spawns) can resolve the stale `Path`. Collapsing to a single key removes the ambiguity on every libuv version. Separately, `AgentSubprocess` (Opencode/ACP) kills only the direct child on POSIX, orphaning grandchildren.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/utils/env.ts` | Env/PATH assembly helpers | Add `withCanonicalPath()` |
| `src/core/providers/subprocessEnvironmentAllowlist.ts` | Allowlisted CLI env (Cursor/Codex/Opencode) | Collapse to single PATH via helper |
| `src/providers/claude/runtime/claudeColdStartQuery.ts` | Claude cold-start SDK options | Dedupe spawn env |
| `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts` | Claude persistent-query SDK options | Dedupe spawn env |
| `src/providers/claude/runtime/customSpawn.ts` | Claude SDK spawn chokepoint | Defensive single-key dedupe |
| `src/features/chat/services/GitService.ts` | `git status` probe | Dedupe exec env |
| `src/features/chat/services/BangBashService.ts` | `!` bash mode | Dedupe exec env |
| `src/providers/opencode/runtime/OpencodeChatRuntime.ts` | Opencode ACP process spawn env | Dedupe spawn env |
| `src/utils/binaryPaths.ts` | GUI-PATH extra bin dirs | Add Windows Git dirs (incl. per-user) |
| `src/providers/opencode/history/opencodeSqlite.ts` | `sqlite3` CLI fallback | Pass enhanced PATH to `spawnSync` |
| `src/core/transport/AgentSubprocess.ts` | Shared stdio subprocess lifecycle | Detached spawn + group/tree kill |

---

## Task 1: `withCanonicalPath()` helper (Fix 1 foundation)

**Files:**
- Modify: `src/utils/env.ts` (add export near `getEnhancedPath`, ~line 150)
- Test: `tests/unit/utils/env.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/utils/env.test.ts`:

```typescript
import { withCanonicalPath } from '@/utils/env';

describe('withCanonicalPath', () => {
  it('collapses duplicate case-variant PATH keys into a single uppercase PATH', () => {
    const out = withCanonicalPath({ Path: 'C:\\old', PATH: 'C:\\new' }, 'C:\\enhanced');
    expect(out.PATH).toBe('C:\\enhanced');
    expect(out.Path).toBeUndefined();
    expect(Object.keys(out).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
  });

  it('keeps every non-PATH key untouched', () => {
    const out = withCanonicalPath({ HOME: '/h', ComSpec: 'cmd.exe', Path: '/old' }, '/new');
    expect(out.HOME).toBe('/h');
    expect(out.ComSpec).toBe('cmd.exe');
    expect(out.PATH).toBe('/new');
  });

  it('falls back to the existing PATH-variant value when no override is given', () => {
    const out = withCanonicalPath({ Path: '/existing', HOME: '/h' });
    expect(out.PATH).toBe('/existing');
    expect(out.Path).toBeUndefined();
  });

  it('drops undefined values and omits PATH entirely when none resolvable', () => {
    const out = withCanonicalPath({ HOME: '/h', EMPTY: undefined });
    expect(out).toEqual({ HOME: '/h' });
    expect('PATH' in out).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit --testPathPattern "utils/env" -t "withCanonicalPath"`
Expected: FAIL — `withCanonicalPath is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/env.ts`, add after `getEnhancedPath` (after line 150):

```typescript
/**
 * Collapse every case-variant of the PATH key (Windows yields `Path`, the
 * override sets `PATH`) into exactly one `PATH` entry. Windows env lookup is
 * case-insensitive with no defined winner between duplicate-case keys, so a
 * child could otherwise resolve a stale PATH. `pathValue` wins when provided;
 * otherwise the last-seen existing PATH-variant value is preserved.
 */
export function withCanonicalPath(
  env: Record<string, string | undefined>,
  pathValue?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  let fallback: string | undefined;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (/^path$/i.test(key)) {
      fallback = value;
      continue;
    }
    out[key] = value;
  }
  const resolved = pathValue ?? fallback;
  if (resolved !== undefined) {
    out.PATH = resolved;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit --testPathPattern "utils/env" -t "withCanonicalPath"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/env.ts tests/unit/utils/env.test.ts
git commit -m "$(cat <<'EOF'
feat(env): add withCanonicalPath to collapse duplicate PATH keys

Windows spawn envs end up with both `Path` and `PATH`; the case-insensitive
child lookup has no defined winner. Single-key helper removes the ambiguity.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Collapse PATH in the allowlist (Cursor/Codex/Opencode)

**Files:**
- Modify: `src/core/providers/subprocessEnvironmentAllowlist.ts:115-137`
- Test: `tests/unit/core/providers/subprocessEnvironmentAllowlist.test.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorAgentEnv.test.ts` (regression guard)

- [ ] **Step 1: Write the failing test**

Replace the existing `'matches the allowlist case-insensitively for Windows-style mixed-case env keys'` test body in `subprocessEnvironmentAllowlist.test.ts` so the `Path` assertion expects a single canonical key, and add a new collapse test:

```typescript
  it('matches the allowlist case-insensitively for Windows-style mixed-case env keys', () => {
    const result = buildAllowlistedSubprocessEnvironment({
      processEnv: {
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
        ProgramFiles: 'C:\\Program Files',
        ProgramData: 'C:\\ProgramData',
        windir: 'C:\\Windows',
        Path: 'C:\\Windows\\System32',
      },
      customEnv: {},
      providerPrefixPattern: /^CURSOR_/i,
    });
    expect(result.ComSpec).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(result.ProgramFiles).toBe('C:\\Program Files');
    expect(result.ProgramData).toBe('C:\\ProgramData');
    expect(result.windir).toBe('C:\\Windows');
    // PATH is now canonicalized to a single uppercase key (no stale `Path`).
    expect(result.PATH).toBe('C:\\Windows\\System32');
    expect(result.Path).toBeUndefined();
  });

  it('collapses a copied `Path` plus a pathOverride into a single `PATH`', () => {
    const result = buildAllowlistedSubprocessEnvironment({
      processEnv: { Path: 'C:\\stale' },
      customEnv: {},
      providerPrefixPattern: /^CURSOR_/i,
      pathOverride: 'C:\\enhanced;C:\\Program Files\\Git\\bin',
    });
    expect(result.PATH).toBe('C:\\enhanced;C:\\Program Files\\Git\\bin');
    expect(result.Path).toBeUndefined();
    expect(Object.keys(result).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit --testPathPattern "subprocessEnvironmentAllowlist"`
Expected: FAIL — `result.Path` still defined / `result.PATH` undefined when no override.

- [ ] **Step 3: Write minimal implementation**

In `src/core/providers/subprocessEnvironmentAllowlist.ts`:

Add the import at the top (after the file's existing header comment, before the allowlist `Set`):

```typescript
import { withCanonicalPath } from '../../utils/env';
```

Replace the tail of `buildAllowlistedSubprocessEnvironment` (currently lines 133-136):

```typescript
  if (opts.pathOverride !== undefined) {
    out.PATH = opts.pathOverride;
  }
  return out;
```

with:

```typescript
  // Collapse any copied `Path` (Windows OS-casing) plus the optional override
  // into a single canonical `PATH` so the child has no duplicate-case ambiguity.
  return withCanonicalPath(out, opts.pathOverride);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit --testPathPattern "subprocessEnvironmentAllowlist"`
Expected: PASS.

- [ ] **Step 5: Add the Cursor regression guard**

Add to `tests/unit/providers/cursor/runtime/cursorAgentEnv.test.ts` (inside the existing top-level `describe`). This asserts the Windows Cursor env never carries a stale lowercase `Path`:

```typescript
  it('produces a single canonical PATH key on Windows (no stale `Path`)', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const plugin = {
        getResolvedEnvironmentVariables: () => ({}),
      } as unknown as import('@/core/types/PluginContext').PluginContext;
      const env = buildCursorAgentEnvironment(plugin);
      expect(typeof env.PATH).toBe('string');
      expect(env.Path).toBeUndefined();
      expect(Object.keys(env).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
```

Ensure the test file imports the function under test:

```typescript
import { buildCursorAgentEnvironment } from '@/providers/cursor/runtime/cursorAgentEnv';
```

- [ ] **Step 6: Run the Cursor + allowlist tests**

Run: `npm run test -- --selectProjects unit --testPathPattern "subprocessEnvironmentAllowlist|cursorAgentEnv"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/providers/subprocessEnvironmentAllowlist.ts tests/unit/core/providers/subprocessEnvironmentAllowlist.test.ts tests/unit/providers/cursor/runtime/cursorAgentEnv.test.ts
git commit -m "$(cat <<'EOF'
fix(env): collapse duplicate PATH keys in allowlisted subprocess env

Cursor/Codex/Opencode CLI envs no longer carry both `Path` and `PATH`, so the
child (and the git/bash it spawns) resolves the enhanced PATH deterministically.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Collapse PATH at the Claude spawn sites

**Files:**
- Modify: `src/providers/claude/runtime/claudeColdStartQuery.ts:85-89`
- Modify: `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts:332-336`
- Modify: `src/providers/claude/runtime/customSpawn.ts:4,32-37`
- Test: `tests/unit/utils/env.test.ts` (already covers the helper; no Claude-runtime unit harness exists for these builders — guarded by the helper test + typecheck/build)

- [ ] **Step 1: Confirm the helper test exists**

Run: `npm run test -- --selectProjects unit --testPathPattern "utils/env" -t "withCanonicalPath"`
Expected: PASS (from Task 1). These edits reuse that verified helper.

- [ ] **Step 2: Implement — `claudeColdStartQuery.ts`**

Add `withCanonicalPath` to the existing env import (line 6):

```typescript
import { getEnhancedPath, getMissingNodeError, withCanonicalPath } from '../../../utils/env';
```

Replace the `env` block (lines 85-89):

```typescript
    env: {
      ...process.env,
      ...customEnv,
      PATH: enhancedPath,
    },
```

with:

```typescript
    env: withCanonicalPath({ ...process.env, ...customEnv }, enhancedPath),
```

- [ ] **Step 3: Implement — `ClaudeQueryOptionsBuilder.ts`**

Add `withCanonicalPath` to the existing env import (line 59):

```typescript
import { getEnhancedPath, getMissingNodeError, withCanonicalPath } from '../../../utils/env';
```

Replace the `env` block (lines 332-336):

```typescript
      env: {
        ...process.env,
        ...ctx.customEnv,
        PATH: ctx.enhancedPath,
      },
```

with:

```typescript
      env: withCanonicalPath({ ...process.env, ...ctx.customEnv }, ctx.enhancedPath),
```

- [ ] **Step 4: Implement — `customSpawn.ts` (defensive chokepoint dedupe)**

Add `withCanonicalPath` to the existing env import (line 4):

```typescript
import { cliPathRequiresNode, findNodeExecutable, withCanonicalPath } from '../../../utils/env';
```

Replace the spawn call (lines 32-37):

```typescript
    const child = spawn(command, args, {
      cwd,
      env: env,
      stdio: ['pipe', 'pipe', shouldPipeStderr ? 'pipe' : 'ignore'],
      windowsHide: true,
    });
```

with:

```typescript
    const child = spawn(command, args, {
      cwd,
      // Defensive: the SDK option envs are already canonicalized upstream, but
      // collapse any duplicate-case PATH here too since this is the single Claude
      // spawn chokepoint.
      env: withCanonicalPath(env ?? {}),
      stdio: ['pipe', 'pipe', shouldPipeStderr ? 'pipe' : 'ignore'],
      windowsHide: true,
    });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors; `withCanonicalPath` returns `Record<string,string>`, assignable to the SDK `env`).

- [ ] **Step 6: Commit**

```bash
git add src/providers/claude/runtime/claudeColdStartQuery.ts src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts src/providers/claude/runtime/customSpawn.ts
git commit -m "$(cat <<'EOF'
fix(claude): collapse duplicate PATH keys at all Claude spawn sites

Cold-start, persistent-query, and the customSpawn chokepoint now emit a single
canonical PATH so Bash/git tool calls resolve the enhanced PATH on Windows.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Collapse PATH in GitService and BangBashService

**Files:**
- Modify: `src/features/chat/services/GitService.ts:1,19-24`
- Modify: `src/features/chat/services/BangBashService.ts:1,25-30`
- Test: `tests/unit/features/chat/services/GitService.test.ts`
- Test: `tests/unit/features/chat/services/BangBashService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/features/chat/services/GitService.test.ts` (inside the existing `describe`). Adjust the `exec` mock reference to match the file's existing mock if named differently:

```typescript
  it('execs with a single canonical PATH key (no duplicate `Path`)', async () => {
    const svc = new GitService('/ws', '/enhanced/bin');
    await svc.getStatus();
    const optsArg = (mockExec as jest.Mock).mock.calls[0][1];
    expect(optsArg.env.PATH).toBe('/enhanced/bin');
    expect(Object.keys(optsArg.env).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
  });
```

Add the analogous test to `tests/unit/features/chat/services/BangBashService.test.ts`:

```typescript
  it('execs with a single canonical PATH key (no duplicate `Path`)', async () => {
    const svc = new BangBashService('/ws', '/enhanced/bin');
    await svc.execute('echo hi');
    const optsArg = (mockExec as jest.Mock).mock.calls[0][1];
    expect(optsArg.env.PATH).toBe('/enhanced/bin');
    expect(Object.keys(optsArg.env).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
  });
```

> Note: both existing test files already mock `child_process` `exec`. Reuse that mock handle (commonly `mockExec`); if the local name differs, match it. If the existing mock auto-invokes the callback, the awaited call still resolves.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --selectProjects unit --testPathPattern "GitService|BangBashService"`
Expected: FAIL — `optsArg.env.Path` present (duplicate key) on a Windows-shaped `process.env`, or assertion on single key fails.

- [ ] **Step 3: Implement — `GitService.ts`**

Add the import (line 1 area):

```typescript
import { exec } from 'child_process';

import { withCanonicalPath } from '../../../utils/env';
```

Replace `env: { ...process.env, PATH: this.enhancedPath },` (line 21) with:

```typescript
        env: withCanonicalPath(process.env, this.enhancedPath),
```

- [ ] **Step 4: Implement — `BangBashService.ts`**

Add the import (line 1 area):

```typescript
import { exec } from 'child_process';

import { withCanonicalPath } from '../../../utils/env';
```

Replace `env: { ...process.env, PATH: this.enhancedPath },` (line 27) with:

```typescript
        env: withCanonicalPath(process.env, this.enhancedPath),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- --selectProjects unit --testPathPattern "GitService|BangBashService"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/services/GitService.ts src/features/chat/services/BangBashService.ts tests/unit/features/chat/services/GitService.test.ts tests/unit/features/chat/services/BangBashService.test.ts
git commit -m "$(cat <<'EOF'
fix(chat): collapse duplicate PATH keys in git/bash exec env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Collapse PATH in the Opencode ACP spawn env

**Files:**
- Modify: `src/providers/opencode/runtime/OpencodeChatRuntime.ts:591-598`
- Test: covered by the helper test + typecheck (the spawn-env assembly here has no dedicated unit harness; `OpencodeRuntimeEnvironment` already routes through the now-fixed allowlist).

- [ ] **Step 1: Implement**

Confirm `getEnhancedPath` and `withCanonicalPath` are both imported. The file already imports `getEnhancedPath` (line 33):

```typescript
import { getEnhancedPath, withCanonicalPath } from '../../../utils/env';
```

Replace the `processEnv` block (lines 591-598):

```typescript
    const processEnv: NodeJS.ProcessEnv = {
      ...params.runtimeEnv,
      OPENCODE_CONFIG: params.configPath,
      PATH: getEnhancedPath(
        params.runtimeEnv.PATH,
        path.isAbsolute(params.command) ? params.command : undefined,
      ),
    };
```

with:

```typescript
    const processEnv: NodeJS.ProcessEnv = withCanonicalPath(
      { ...params.runtimeEnv, OPENCODE_CONFIG: params.configPath },
      getEnhancedPath(
        params.runtimeEnv.PATH,
        path.isAbsolute(params.command) ? params.command : undefined,
      ),
    );
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (`withCanonicalPath` returns `Record<string,string>`, assignable to `NodeJS.ProcessEnv`).

- [ ] **Step 3: Commit**

```bash
git add src/providers/opencode/runtime/OpencodeChatRuntime.ts
git commit -m "$(cat <<'EOF'
fix(opencode): collapse duplicate PATH keys in ACP process env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Broaden Windows git/bash discovery (Fix 2)

**Files:**
- Modify: `src/utils/binaryPaths.ts` (add `getWindowsGitPaths`, call it in `getWindowsBinaryPaths`)
- Test: `tests/unit/utils/binaryPaths.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/utils/binaryPaths.test.ts`:

```typescript
import { getWindowsGitPaths } from '@/utils/binaryPaths';

describe('getWindowsGitPaths', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('includes Program Files Git cmd + bin', () => {
    process.env.ProgramFiles = 'C:\\Program Files';
    const paths = getWindowsGitPaths();
    expect(paths).toContain('C:\\Program Files\\Git\\cmd');
    expect(paths).toContain('C:\\Program Files\\Git\\bin');
  });

  it('includes the per-user install under LOCALAPPDATA\\Programs\\Git', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\me\\AppData\\Local';
    const paths = getWindowsGitPaths();
    expect(paths).toContain('C:\\Users\\me\\AppData\\Local\\Programs\\Git\\cmd');
    expect(paths).toContain('C:\\Users\\me\\AppData\\Local\\Programs\\Git\\bin');
  });

  it('omits the per-user install when LOCALAPPDATA is unset', () => {
    delete process.env.LOCALAPPDATA;
    const paths = getWindowsGitPaths();
    expect(paths.some((p) => p.includes('Programs\\Git'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit --testPathPattern "utils/binaryPaths"`
Expected: FAIL — `getWindowsGitPaths is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/binaryPaths.ts`, add the exported function (place it just before `getWindowsBinaryPaths`):

```typescript
/**
 * Git for Windows install dirs. The installer adds `Git\cmd` to system PATH but
 * NOT `Git\bin` (where `bash.exe` lives), and a per-user install lands under
 * %LOCALAPPDATA%\Programs\Git — none of which a stripped GUI PATH guarantees.
 */
export function getWindowsGitPaths(): string[] {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA;

  const roots = [
    path.join(programFiles, 'Git'),
    path.join(programFilesX86, 'Git'),
  ];
  if (localAppData) {
    roots.push(path.join(localAppData, 'Programs', 'Git'));
  }

  const paths: string[] = [];
  for (const root of roots) {
    paths.push(path.join(root, 'cmd'));
    paths.push(path.join(root, 'bin'));
  }
  return paths;
}
```

Then add it to `getWindowsBinaryPaths` (after the existing `paths` array is built, before `getCommonHomeBinPaths` is pushed):

```typescript
  // Git (cmd + bin, incl. per-user install) so bash/git resolve under a GUI PATH.
  paths.push(...getWindowsGitPaths());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit --testPathPattern "utils/binaryPaths"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/binaryPaths.ts tests/unit/utils/binaryPaths.test.ts
git commit -m "$(cat <<'EOF'
feat(env): discover Git cmd/bin (incl. per-user) in Windows PATH enhancement

bash.exe lives in Git\bin (never on system PATH) and per-user installs land in
%LOCALAPPDATA%\Programs\Git. Add both so all providers can resolve git/bash.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pass enhanced PATH to the opencode `sqlite3` CLI

**Files:**
- Modify: `src/providers/opencode/history/opencodeSqlite.ts:1,50-67`
- Test: `tests/unit/providers/opencode/history/opencodeSqlite.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/providers/opencode/history/opencodeSqlite.test.ts`:

```typescript
jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(() => ({ error: null, status: 0, stdout: '[]' })),
}));

jest.mock('@/utils/env', () => ({
  ...jest.requireActual('@/utils/env'),
  getEnhancedPath: jest.fn(() => '/enhanced/bin'),
}));

import { spawnSync } from 'node:child_process';

import { runSqlite3JsonQuery } from '@/providers/opencode/history/opencodeSqlite';

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;

describe('runSqlite3JsonQuery env', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes the enhanced PATH as a single canonical key', () => {
    runSqlite3JsonQuery('/db.sqlite', 'SELECT 1');
    const opts = mockSpawnSync.mock.calls[0][2] as { env?: Record<string, string> };
    expect(opts.env?.PATH).toBe('/enhanced/bin');
    expect(Object.keys(opts.env ?? {}).filter((k) => /^path$/i.test(k))).toEqual(['PATH']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit --testPathPattern "opencodeSqlite"`
Expected: FAIL — current `spawnSync` call passes no `env`, so `opts.env` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/providers/opencode/history/opencodeSqlite.ts`, update the import (line 1):

```typescript
import { spawnSync } from 'node:child_process';

import { getEnhancedPath, withCanonicalPath } from '../../../utils/env';
```

Update `isSqlite3CliAvailable` (line 50-53):

```typescript
function isSqlite3CliAvailable(): boolean {
  const probe = spawnSync('sqlite3', ['-version'], {
    encoding: 'utf8',
    env: withCanonicalPath(process.env, getEnhancedPath()),
  });
  return !probe.error && probe.status === 0;
}
```

Update `runSqlite3JsonQuery`'s `spawnSync` options (lines 59-67) to add `env`:

```typescript
  const result = spawnSync(
    'sqlite3',
    ['-json', databasePath, sql],
    {
      encoding: 'utf8',
      maxBuffer: OPENCODE_SQLITE_QUERY_MAX_BUFFER,
      windowsHide: true,
      env: withCanonicalPath(process.env, getEnhancedPath()),
    },
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit --testPathPattern "opencodeSqlite"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/opencode/history/opencodeSqlite.ts tests/unit/providers/opencode/history/opencodeSqlite.test.ts
git commit -m "$(cat <<'EOF'
fix(opencode): give the sqlite3 CLI fallback the enhanced PATH

The spawnSync probe + query inherited the stripped GUI PATH; pass the enhanced
single-key PATH so a non-/usr/bin sqlite3 (e.g. Homebrew) resolves.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Detached spawn + process-group/tree kill in AgentSubprocess

**Files:**
- Modify: `src/core/transport/AgentSubprocess.ts:59-94` (start) and `125-162` (shutdown)
- Test: `tests/unit/core/transport/AgentSubprocess.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/core/transport/AgentSubprocess.test.ts`, give the mock proc a pid (interface + factory) and add platform-aware lifecycle tests.

Update the `MockProc` interface to add `pid` and the factory to set it:

```typescript
interface MockProc extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable & EventEmitter;
  kill: jest.Mock;
  exitCode: number | null;
  killed: boolean;
  pid: number;
}
```

In `makeMockProc()` add before `return proc;`:

```typescript
  proc.pid = 4321;
```

Add a new `describe` block:

```typescript
describe('process group lifecycle', () => {
  const originalPlatform = process.platform;
  let killSpy: jest.SpyInstance;

  beforeEach(() => {
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    killSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('spawns detached on non-win32', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    new AgentSubprocess(SPEC).start();
    expect(mockSpawn.mock.calls[0][2]).toMatchObject({ detached: true });
  });

  it('does not spawn detached on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    new AgentSubprocess(SPEC).start();
    expect(mockSpawn.mock.calls[0][2]).toMatchObject({ detached: false });
  });

  it('SIGTERMs the whole process group on posix shutdown', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const p = new AgentSubprocess(SPEC);
    p.start();
    const done = p.shutdown();
    expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGTERM');
    mockProc.emit('exit', 0, 'SIGTERM');
    await done;
  });

  it('escalates to a group SIGKILL after the timeout on posix', async () => {
    jest.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const p = new AgentSubprocess({ ...SPEC, sigkillTimeoutMs: 1000 });
    p.start();
    const done = p.shutdown();
    jest.advanceTimersByTime(1000);
    expect(killSpy).toHaveBeenLastCalledWith(-4321, 'SIGKILL');
    mockProc.emit('exit', null, 'SIGKILL');
    await expect(done).resolves.toBeUndefined();
  });

  it('tree-kills via taskkill on win32 shutdown', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const p = new AgentSubprocess(SPEC);
    p.start();
    const done = p.shutdown();
    expect(mockSpawn).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '4321', '/T', '/F'],
      expect.objectContaining({ windowsHide: true, stdio: 'ignore' }),
    );
    mockProc.emit('exit', null, 'SIGKILL');
    await done;
  });
});
```

> The existing `shutdown` tests run under the host platform. To keep them deterministic regardless of CI OS, prepend `Object.defineProperty(process, 'platform', { value: 'linux' });` to the existing `describe('shutdown')` `beforeEach` (or wrap each), and restore it in an `afterEach`. On linux the existing `proc.kill('SIGTERM')` path is replaced by the group-kill, so update those existing assertions: `expect(mockProc.kill)...` becomes `expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGTERM')`. Add the same `killSpy` setup/teardown shown above to the `shutdown` describe.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --selectProjects unit --testPathPattern "AgentSubprocess"`
Expected: FAIL — no `detached` option; `process.kill(-pid, ...)` never called; no `taskkill` spawn.

- [ ] **Step 3: Write minimal implementation**

In `src/core/transport/AgentSubprocess.ts`:

(a) Add `detached` to the spawn options in `start()` (the `spawn(...)` call, lines 64-70):

```typescript
    const proc = spawn(this.spec.command, this.spec.args, {
      stdio: 'pipe',
      cwd: this.spec.cwd,
      env: this.spec.env,
      windowsHide: true,
      // POSIX: become a process-group leader (setsid) so shutdown can reap the
      // whole tree via the negative pid. Windows uses taskkill /T instead and a
      // new console would just flicker, so stay attached there.
      detached: process.platform !== 'win32',
      ...(this.spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
```

(b) Add a private `killTree` method (place it just above `private requireProc()`):

```typescript
  /**
   * Reap the child and its descendants. Windows: `taskkill /T /F` (the only way
   * to kill the tree). POSIX: signal the process group via the negative pid
   * (the child is a group leader because it was spawned detached). Falls back to
   * a direct `kill` if the pid is missing or the group is already gone.
   */
  private killTree(signal: NodeJS.Signals): void {
    const proc = this.proc;
    if (!proc) return;
    const pid = proc.pid;

    if (process.platform === 'win32' && typeof pid === 'number') {
      try {
        const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => {
          try { proc.kill('SIGKILL'); } catch { /* already gone */ }
        });
        return;
      } catch {
        // taskkill spawn failed synchronously — fall through to a direct kill.
      }
    }

    if (typeof pid === 'number' && process.platform !== 'win32') {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // Group already gone (ESRCH) — fall through to a direct kill.
      }
    }

    try {
      proc.kill(signal);
    } catch {
      // already exited / not killable
    }
  }
```

(c) In `shutdown()`, replace the two `proc.kill(...)` calls with `this.killTree(...)`:

- Replace (inside the `killTimer` callback, ~line 145):

```typescript
            proc.kill('SIGKILL');
```

with:

```typescript
            this.killTree('SIGKILL');
```

- Replace (the initial term, ~line 156):

```typescript
        proc.kill('SIGTERM');
```

with:

```typescript
        this.killTree('SIGTERM');
```

> Leave the surrounding `try/catch`, the `killTimer`/`giveUpTimer` escalation, and the `proc.once('exit', onExit)` wiring exactly as-is — only the kill calls change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --selectProjects unit --testPathPattern "AgentSubprocess"`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Run the ACP subprocess + opencode transport tests (no regression)**

Run: `npm run test -- --selectProjects unit --testPathPattern "AcpSubprocess|opencode"`
Expected: PASS (the `AcpSubprocess` adapter delegates unchanged; only spawn options + teardown path changed).

- [ ] **Step 6: Commit**

```bash
git add src/core/transport/AgentSubprocess.ts tests/unit/core/transport/AgentSubprocess.test.ts
git commit -m "$(cat <<'EOF'
feat(transport): detached spawn + process-group/tree kill in AgentSubprocess

POSIX spawns are now group leaders and shutdown signals the whole group via the
negative pid; Windows reaps the tree with taskkill /T /F. Stops orphaned
grandchildren (e.g. opencode's git/ripgrep) on teardown.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (no new errors; warnings are the tracked non-blocking backlog).

- [ ] **Step 3: Unit + integration tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Final commit (only if any gate produced fixups)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: verification fixups for subprocess PATH + lifecycle hardening

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- "detached + group-kill in AgentSubprocess (TDD)" → Task 8 ✓
- "patch the opencodeSqlite.ts PATH gap (TDD)" → Task 7 ✓
- "Fix 1 (single canonical PATH key)" → Tasks 1–5 (helper + allowlist + Claude + git/bash + opencode) ✓
- "Fix 2 (broaden git/bash discovery)" → Task 6 ✓

**Out of scope (not requested):** the latent Windows libuv tiebreak diagnosis is *resolved* by Fix 1 regardless; the login-shell PATH resolver (deep robustness) is deliberately deferred.

**Placeholder scan:** none — every code step shows full code; every run step shows the command + expected outcome.

**Type consistency:** `withCanonicalPath(env, pathValue?)` signature is identical across Tasks 1–7. Returns `Record<string,string>` everywhere; assigned to SDK `env`, `NodeJS.ProcessEnv`, and `exec`/`spawnSync` options (all compatible). `getWindowsGitPaths()` (no args) consistent between Task 6 impl and test. `killTree(signal: NodeJS.Signals)` consistent in Task 8.

**Known test-harness caveats (flagged, not placeholders):**
- Task 4 reuses each service test's existing `exec` mock handle — match the local mock name if it isn't `mockExec`.
- Task 8 requires pinning `process.platform` in the pre-existing `shutdown` describe so those assertions are deterministic on any CI OS (instructions included inline).
