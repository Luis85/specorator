# Cursor ACP Diagnostics Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record Cursor ACP wire frames, stderr, and lifecycle events to redacted per-session capture files behind a default-off setting, per `docs/superpowers/specs/2026-07-11-cursor-acp-capture-design.md`.

**Architecture:** Two additive optional hooks on the shared transport (`JsonRpcStdioClient.onWireFrame`, `AcpSubprocess.onStderrData`) feed a new `CursorAcpCaptureWriter` (queued redacted appends, retention prune, failure-disable) created per spawn by `CursorChatRuntime` when `captureAcpTraffic` is enabled.

**Tech Stack:** TypeScript, Jest (`--selectProjects unit`), Node `fs/promises`, existing `core/logging/redact` scrubber.

**Ground rules:** TDD per step; after each task `npm run typecheck && npm run lint` clean and commit (do not push); no imports from `src/providers/opencode/`; capture failures must never throw into a turn; gate quality with the CI-matching invocation `rm -rf coverage .fallow && npm run check:quality`.

---

### Task 1: Transport hooks

**Files:**
- Modify: `src/core/transport/JsonRpcStdioClient.ts` (config interface + outbound write site + inbound line-dispatch site — read the file first; find where outbound lines are serialized/written and where inbound lines are parsed/dispatched)
- Modify: `src/providers/acp/AcpSubprocess.ts` (optional stderr passthrough beside the ring buffer; `AgentSubprocess` already exposes the stderr stream — tap at the AcpSubprocess layer, do NOT change core AgentSubprocess)
- Modify: `src/providers/acp/AcpJsonRpcTransport.ts` ONLY if its re-export/adapter needs the new config member surfaced (check — it may pass options through already)
- Test: extend `tests/unit/core/transport/JsonRpcStdioClient.test.ts` and `tests/unit/providers/acp/AcpSubprocess.test.ts` (follow each suite's existing stream/mocking helpers)

- [ ] **Step 1: Failing tests**

Add to `JsonRpcStdioClient.test.ts` (adapt fixture setup to the suite's existing in-memory stream helpers — the suite already builds client instances over fake streams; reuse that):

```typescript
it('reports outbound and inbound raw lines to onWireFrame when configured', async () => {
  const frames: Array<{ direction: string; line: string }> = [];
  // Build the client exactly like the suite's other tests, adding:
  //   onWireFrame: (direction, line) => frames.push({ direction, line }),
  // Then: issue one client request and script one server notification.
  // Assert one frame with direction 'client' whose line parses to the request,
  // and one with direction 'agent' whose line parses to the notification.
  expect(frames.some((f) => f.direction === 'client')).toBe(true);
  expect(frames.some((f) => f.direction === 'agent')).toBe(true);
  for (const f of frames) {
    expect(() => JSON.parse(f.line)).not.toThrow();
  }
});

it('behaves identically when onWireFrame is not set', async () => {
  // Duplicate the suite's simplest existing request/response test verbatim
  // with no onWireFrame — it must pass unchanged (guards the no-op path).
});
```

Add to `AcpSubprocess.test.ts`:

```typescript
it('forwards stderr chunks to onStderrData while still buffering the snapshot', () => {
  const chunks: string[] = [];
  // Construct AcpSubprocess with the suite's fake-spawn helper, adding
  //   onStderrData: (chunk) => chunks.push(chunk),
  // emit 'boom\n' on the fake stderr, then assert:
  expect(chunks.join('')).toContain('boom');
  // and getStderrSnapshot() still contains 'boom'.
});
```

- [ ] **Step 2: Run → FAIL** (`npx jest tests/unit/core/transport/JsonRpcStdioClient.test.ts tests/unit/providers/acp/AcpSubprocess.test.ts --selectProjects unit`)

- [ ] **Step 3: Implement**

`JsonRpcStdioClient.ts`: add to the options/config interface:

```typescript
/** Diagnostics tap: receives every raw NDJSON line, both directions. Must never throw upstream — calls are try/catch-wrapped. */
onWireFrame?: (direction: 'client' | 'agent', rawLine: string) => void;
```

At the single outbound write site (where the serialized line is written to the output stream), immediately before/after the write:

```typescript
this.emitWireFrame('client', line);
```

At the inbound dispatch site (where each received line is handed to the parser):

```typescript
this.emitWireFrame('agent', line);
```

with one private helper:

```typescript
private emitWireFrame(direction: 'client' | 'agent', rawLine: string): void {
  try {
    this.options.onWireFrame?.(direction, rawLine);
  } catch {
    // A diagnostics tap must never break the transport.
  }
}
```

`AcpSubprocess.ts`: add `onStderrData?: (chunk: string) => void;` to `AcpSubprocessLaunchSpec`; in the constructor, when set, subscribe to `this.proc.stderr` (`data` events, `chunk.toString('utf8')`, try/catch-wrapped) without touching the existing ring-buffer path.

- [ ] **Step 4: Run → PASS**; also `npx jest tests/unit/providers/acp tests/unit/providers/opencode --selectProjects unit` (no regressions), `npm run typecheck`, `npm run lint`.

- [ ] **Step 5: Commit** — `feat(transport): optional wire-frame and stderr diagnostics taps`

---

### Task 2: CursorAcpCaptureWriter

**Files:**
- Create: `src/providers/cursor/diagnostics/CursorAcpCaptureWriter.ts`
- Test: `tests/unit/providers/cursor/diagnostics/CursorAcpCaptureWriter.test.ts`

- [ ] **Step 1: Failing tests** (use a temp dir via the suite conventions — check how other fs-touching cursor tests make temp dirs, e.g. the spawn-lock suites, and mirror):

```typescript
import { CursorAcpCaptureWriter } from '@/providers/cursor/diagnostics/CursorAcpCaptureWriter';

describe('CursorAcpCaptureWriter', () => {
  it('writes redacted wire frames as ordered JSONL', async () => {
    const writer = new CursorAcpCaptureWriter({ baseDir: tmp, meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' } });
    writer.wireFrame('client', JSON.stringify({ method: 'authenticate', params: { token: 'sk-abc123secretvalue' } }));
    writer.wireFrame('agent', JSON.stringify({ result: {} }));
    await writer.flush();
    const lines = (await fs.readFile(path.join(writer.sessionDir, 'wire.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).dir).toBe('client');
    expect(lines[0]).not.toContain('sk-abc123secretvalue');   // scrubbed
    expect(JSON.parse(lines[1]).dir).toBe('agent');
  });

  it('writes lifecycle events and meta.json', async () => { /* event('spawn', {...}) → lifecycle.jsonl line; meta.json parses with cliVersion */ });

  it('appends stderr to stderr.log', async () => { /* stderr('boom') → file contains boom */ });

  it('prunes to the newest 20 session dirs', async () => { /* pre-create 21 dirs with distinct mtimes; new writer construction + await writer.ready; expect 20 remain + the new one... verify exact retention semantics: keep newest 20 INCLUDING the new dir */ });

  it('disables itself after the first write failure without throwing', async () => { /* point baseDir at an unwritable path; wireFrame + flush resolve; writer.disabled === true */ });
});
```

- [ ] **Step 2: Run → FAIL** (module not found)

- [ ] **Step 3: Implement**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { scrubString } from '../../../core/logging/redact';

const MAX_CAPTURE_SESSIONS = 20;

export interface CursorAcpCaptureWriterOptions {
  baseDir: string;                      // <vault>/.specorator/captures/cursor
  meta: Record<string, unknown>;        // cliVersion, pluginVersion, platform, startedAt
  onDisabled?: (error: unknown) => void; // single warn hook; called once
  sessionName?: string;                 // override for tests; default `${timestamp}-${pid}`
}

/**
 * Per-process capture sink for Cursor ACP diagnostics. Every line is scrubbed
 * with the logger's value-level redactor before it reaches disk; any I/O
 * failure permanently disables the writer for this session — instrumentation
 * must never break a turn.
 */
export class CursorAcpCaptureWriter {
  readonly sessionDir: string;
  readonly ready: Promise<void>;
  disabled = false;
  private queue: Promise<void>;

  constructor(private readonly options: CursorAcpCaptureWriterOptions) {
    const name = options.sessionName ?? buildSessionName();
    this.sessionDir = path.join(options.baseDir, name);
    this.ready = this.initialize();
    this.queue = this.ready;
  }

  wireFrame(dir: 'client' | 'agent', rawLine: string): void {
    this.append('wire.jsonl', JSON.stringify({ t: Date.now(), dir, frame: rawLine }));
  }

  event(kind: string, data: Record<string, unknown> = {}): void {
    this.append('lifecycle.jsonl', JSON.stringify({ t: Date.now(), kind, ...data }));
  }

  stderr(chunk: string): void {
    this.appendRaw('stderr.log', chunk);
  }

  flush(): Promise<void> {
    return this.queue.catch(() => {});
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      await fs.writeFile(path.join(this.sessionDir, 'meta.json'), `${JSON.stringify(this.options.meta, null, 2)}\n`, 'utf8');
      await pruneOldSessions(this.options.baseDir, MAX_CAPTURE_SESSIONS);
    } catch (error) {
      this.disable(error);
    }
  }

  private append(file: string, line: string): void {
    this.appendRaw(file, `${scrubString(line)}\n`);
  }

  private appendRaw(file: string, text: string): void {
    if (this.disabled) return;
    this.queue = this.queue.then(async () => {
      if (this.disabled) return;
      try {
        await fs.appendFile(path.join(this.sessionDir, file), text, 'utf8');
      } catch (error) {
        this.disable(error);
      }
    });
  }

  private disable(error: unknown): void {
    if (this.disabled) return;
    this.disabled = true;
    this.options.onDisabled?.(error);
  }
}
```

Plus `buildSessionName()` (UTC `yyyymmdd-hhmmss` + `-${process.pid}`) and `pruneOldSessions(baseDir, keep)` (readdir with types, sort dirs by name descending — names are timestamp-prefixed so lexical sort is chronological — delete beyond `keep`, errors swallowed). NOTE: check `src/core/logging/redact.ts` for the actual exported scrubber name (`scrubString` per the module docs; adapt the import if it differs). `stderr()` writes raw (not scrubbed) — stderr is CLI-owned text; scrub it too if `scrubString` is cheap (preferred; decide by reading the scrubber's cost — bounded regexes, so scrub it).

- [ ] **Step 4: Run → PASS**; `npm run typecheck`; `npm run lint`.

- [ ] **Step 5: Commit** — `feat(cursor): ACP capture writer — redacted wire/lifecycle/stderr session files`

---

### Task 3: Runtime wiring, setting, command, docs, gates

**Files:**
- Modify: `src/providers/cursor/runtime/cursorAcpLaunch.ts` (accept optional `onWireFrame`/`onStderrData` in the spec-builder/start params and thread them into `AcpSubprocess` + the transport construction — check how `AcpJsonRpcTransport`'s constructor accepts options; if it only takes `{input, onClose, output}`, extend its option pass-through for `onWireFrame`)
- Modify: `src/providers/cursor/runtime/CursorChatRuntime.ts` (`startProcess`: when the setting is on, build a `CursorAcpCaptureWriter` with baseDir `<vault>/.specorator/captures/cursor` — use `getVaultPath` + the `SPECORATOR_STORAGE_PATH` constant from `core/bootstrap/StoragePaths`; wire hooks; call `captureEvent` at the existing lifecycle log points: spawn {cliPath, args, envKeys: Object.keys(env)}, initialize result {agentInfo, capabilities}, session new/load/fallback, mode/model application, cancel/escalation, exit; `shutdownProcess` flushes + drops the writer)
- Modify: Cursor settings (find the provider settings shape: `src/providers/cursor/settings/` — add `captureAcpTraffic: boolean` default false, reconciler defaults, and the settings-tab toggle following an existing boolean toggle's exact pattern incl. i18n conventions)
- Modify: command registrar (grep `open-library` registration for the registrar pattern; add `cursor-open-acp-captures` command that reveals `<vault>/.specorator/captures/cursor` via the same folder-reveal API other commands use — grep for `showInFolder`/`openWithDefaultApp` usage)
- Modify: `docs/superpowers/specs/2026-07-11-cursor-acp-runtime-design.md` (First-run checklist gains step 0: enable capture) + `docs/product/user-manuals/install-cursor.md` (short "Collecting diagnostics" section)
- Test: extend `tests/unit/providers/cursor/runtime/CursorChatRuntime.acpStream.test.ts` — with a writer injected (temp dir), a scripted fake-server turn produces ordered `wire.jsonl` lines + lifecycle entries incl. spawn and exit; and with the setting off, no writer is constructed.

- [ ] **Step 1: Failing tests** (fake-server suite case as above; settings default test asserting `captureAcpTraffic === false` from the reconciler defaults)

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** per the file list. Wiring sketch for `startProcess` (adapt to real code):

```typescript
const captureWriter = this.buildCaptureWriter(cliPath); // null unless setting on; wraps writer construction + onDisabled warn
const { process: proc, transport } = await runWithCursorAgentSpawnLock(async () =>
  startCursorAcpProcess(spec, {
    onStderrData: captureWriter ? (chunk) => captureWriter.stderr(chunk) : undefined,
    onWireFrame: captureWriter ? (dir, line) => captureWriter.wireFrame(dir, line) : undefined,
  }),
);
captureWriter?.event('spawn', { args: spec.args, cliPath, envKeys: Object.keys(spec.env) });
```

`captureEvent(kind, data)` private helper no-ops when the writer is absent. Env values must NEVER reach the writer — key names only.

- [ ] **Step 4: Full gates**: `npx jest tests/unit/providers/cursor --selectProjects unit`; full `npx jest --selectProjects unit 2>&1 | tail -3`; `npm run test:coverage 2>&1 | grep "not met" | head -3` (empty); `npm run typecheck`; `npm run lint`; `npm run check:loc` (bump the CursorChatRuntime hotspot ceiling with a reason if needed); `rm -rf coverage .fallow && npm run check:quality` exit 0.

- [ ] **Step 5: Commit** — `feat(cursor): ACP diagnostics capture — setting, runtime wiring, open-folder command, validation step 0`

---

## Self-review notes

- **Spec coverage:** hooks (T1), writer incl. redaction/retention/failure-disable/meta (T2), runtime wiring + lifecycle events + setting + command + checklist step 0 + manual section (T3). Out-of-scope items honored (no zip, no hot-attach — toggle applies on next spawn because the writer is built in `startProcess`).
- **Type consistency:** `onWireFrame(direction: 'client'|'agent', rawLine)` identical in T1 config, T3 threading, and writer's `wireFrame(dir, rawLine)` consumption; `AcpSubprocessLaunchSpec.onStderrData` matches T3's threading.
- **Known adaptation points (compile-time checks, not TBDs):** the redact module's exported scrubber name; `AcpJsonRpcTransport` option pass-through shape; the settings/reconciler/i18n patterns to mirror; the folder-reveal API. Each is anchored to a concrete file to read.
