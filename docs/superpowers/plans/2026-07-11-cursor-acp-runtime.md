# Cursor ACP Runtime (Hard Cutover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot `cursor-agent --print stream-json` chat runtime with a persistent `agent acp` (first-party ACP) runtime — parity plus in-turn AskUserQuestion and interactive tool approvals — deleting the stream-json path in the same release.

**Architecture:** `CursorChatRuntime` is rewritten with the same skeleton as `OpencodeChatRuntime` (`src/providers/opencode/runtime/OpencodeChatRuntime.ts` — keep it open as the reference throughout): one `AcpSubprocess` per runtime instance, `AcpClientConnection` over `AcpJsonRpcTransport`, `session/update` → `StreamChunk` via `AcpSessionUpdateNormalizer` + `AcpToolStreamAdapter`. A small `cursorAcpExtensions` module handles Cursor's dialect (`cursor_login` auth, blocking `cursor/ask_question` and `cursor/create_plan`, `cursor/update_todos`). Spec: `docs/superpowers/specs/2026-07-11-cursor-acp-runtime-design.md`.

**Tech Stack:** TypeScript, Jest (`npm run test -- --selectProjects unit`), existing `src/providers/acp/` + `src/core/transport/` stacks. No new dependencies.

**Ground rules for every task:**
- TDD: failing test first, in the mirrored `tests/unit/` path.
- After each task: `npm run typecheck && npm run lint` must pass before commit.
- Commit after every task (messages given per task).
- Boundary rule: nothing under `src/providers/cursor/` may import from `src/providers/opencode/` (lint-enforced). Shared code goes through `src/providers/acp/`.

---

### Task 1: Lift ACP-generic helpers out of Opencode into `src/providers/acp/`

Cursor needs `StreamChunkQueue`, `buildActiveTurnEffect`, and the approval-decision mapping. They are provider-agnostic today but live under `src/providers/opencode/`. Move them; leave re-export shims so Opencode code and tests keep compiling unchanged.

**Files:**
- Create: `src/providers/acp/AcpStreamChunkQueue.ts`
- Create: `src/providers/acp/acpActiveTurnUpdate.ts`
- Create: `src/providers/acp/acpApprovalMapping.ts`
- Modify: `src/providers/acp/index.ts` (add exports)
- Modify: `src/providers/opencode/runtime/OpencodeChatRuntime.ts` (import queue from acp, delete inline class)
- Modify: `src/providers/opencode/runtime/opencodeActiveTurnUpdate.ts` (becomes re-export)
- Modify: `src/providers/opencode/runtime/opencodeApprovalHelpers.ts` (imports mapping from acp, keeps Opencode-only presentation)
- Test: existing suites must pass unchanged: `tests/unit/providers/opencode/runtime/opencodeActiveTurnUpdate.test.ts`, `opencodeApprovalHelpers.test.ts`, `OpencodeChatRuntime.test.ts`

- [ ] **Step 1: Move `StreamChunkQueue`**

Create `src/providers/acp/AcpStreamChunkQueue.ts` containing the `StreamChunkQueue` class currently defined inline in `OpencodeChatRuntime.ts:110-148` — copy it verbatim, add `import type { StreamChunk } from '../../core/types';`, rename the export to `AcpStreamChunkQueue`:

```typescript
import type { StreamChunk } from '../../core/types';

/** Push/pull bridge between ACP notifications and an async-generator turn. */
export class AcpStreamChunkQueue {
  private closed = false;
  private readonly items: StreamChunk[] = [];
  private readonly waiters: Array<(chunk: StreamChunk | null) => void> = [];

  push(chunk: StreamChunk): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(chunk);
      return;
    }
    this.items.push(chunk);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.(null);
    }
  }

  async next(): Promise<StreamChunk | null> {
    if (this.items.length > 0) {
      return this.items.shift() ?? null;
    }
    if (this.closed) {
      return null;
    }
    return new Promise<StreamChunk | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}
```

In `OpencodeChatRuntime.ts`: delete the inline `StreamChunkQueue` class (lines 110-148), add `import { AcpStreamChunkQueue } from '../../acp';`, and replace the two usages (`queue: StreamChunkQueue` in the `ActiveTurn` interface and `new StreamChunkQueue()`) with `AcpStreamChunkQueue`.

- [ ] **Step 2: Move `buildActiveTurnEffect`**

Move the ENTIRE content of `src/providers/opencode/runtime/opencodeActiveTurnUpdate.ts` to `src/providers/acp/acpActiveTurnUpdate.ts`, changing only the import path `'../../acp'` → `'./index'` — wait, intra-package imports must not go through the barrel (cycle risk). Import the pieces directly instead:

```typescript
// at top of src/providers/acp/acpActiveTurnUpdate.ts
import type { ChatTurnMetadata } from '../../core/runtime/types';
import type { StreamChunk } from '../../core/types';
import type { AcpNormalizedUpdate } from './AcpSessionUpdateNormalizer';
import type { AcpToolStreamAdapter } from './AcpToolStreamAdapter';
import { buildAcpUsageInfo } from './buildAcpUsageInfo';
import type { AcpUsage, AcpUsageUpdate } from './types';
```

(If any of those names live elsewhere, `grep -n "AcpNormalizedUpdate\|AcpUsageUpdate" src/providers/acp/*.ts` and import from the defining file.) The function/interface bodies are unchanged.

Replace `src/providers/opencode/runtime/opencodeActiveTurnUpdate.ts` with a re-export shim:

```typescript
export {
  type ActiveTurnEffect,
  type ActiveTurnUpdateContext,
  buildActiveTurnEffect,
} from '../../acp/acpActiveTurnUpdate';
```

- [ ] **Step 3: Move the approval-decision mapping**

Create `src/providers/acp/acpApprovalMapping.ts` and MOVE (verbatim) these exports from `src/providers/opencode/runtime/opencodeApprovalHelpers.ts`: `OpencodePermissionOption` (rename to `AcpPermissionOption`), `normalizeApprovalInput` (line 24), `mapApprovalDecision` (line 193), `buildAcpApprovalDecisionOptions` (line 221), `selectPermissionOption` (line 235), plus any private helpers only they use. `buildOpencodePermissionPresentation` and `OpencodePermissionPresentation` STAY in the opencode file (they contain Opencode-specific wording). In the opencode file, import the moved names from `'../../acp/acpApprovalMapping'` and re-export them so its test suite and `OpencodeChatRuntime.ts` compile unchanged:

```typescript
export {
  type AcpPermissionOption as OpencodePermissionOption,
  buildAcpApprovalDecisionOptions,
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from '../../acp/acpApprovalMapping';
```

- [ ] **Step 4: Export from the barrel**

Add to `src/providers/acp/index.ts`:

```typescript
export { AcpStreamChunkQueue } from './AcpStreamChunkQueue';
export {
  type ActiveTurnEffect,
  type ActiveTurnUpdateContext,
  buildActiveTurnEffect,
} from './acpActiveTurnUpdate';
export {
  type AcpPermissionOption,
  buildAcpApprovalDecisionOptions,
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from './acpApprovalMapping';
```

- [ ] **Step 5: Verify behavior-preservation**

Run: `npx jest tests/unit/providers/opencode tests/unit/providers/acp --selectProjects unit`
Expected: PASS, zero test-file edits.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/providers/acp/ src/providers/opencode/
git commit -m "refactor(acp): lift provider-agnostic turn-effect, approval mapping, and stream queue out of opencode"
```

---

### Task 2: Cursor ACP tool-name normalization

**Files:**
- Create: `src/providers/cursor/runtime/cursorAcpToolNames.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorAcpToolNames.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { createCursorAcpToolStreamAdapter, CURSOR_ACP_CANONICAL_TOOL_NAMES } from '@/providers/cursor/runtime/cursorAcpToolNames';
import { TOOL_BASH, TOOL_READ, TOOL_WRITE } from '@/core/tools/toolNames';

describe('cursorAcpToolNames', () => {
  it('normalizes cursor native tool identifiers to canonical names', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 't1', title: 'shell', kind: 'execute', rawInput: { command: 'ls' } },
      [],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe(TOOL_BASH);
  });

  it('exposes the canonical-name set for registration', () => {
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has(TOOL_READ)).toBe(true);
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has(TOOL_WRITE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/providers/cursor/runtime/cursorAcpToolNames.test.ts --selectProjects unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Mirror `createOpencodeToolStreamAdapter` in `src/providers/opencode/normalization/opencodeToolNormalization.ts` EXACTLY in structure (read that file first — it wires the name map into `new AcpToolStreamAdapter(...)`; copy its option wiring), swapping only the name table and export names. The Cursor table (keys are lowercase native identifiers as they may appear in ACP `title`/`kind`/raw tool ids — tolerant superset of today's `cursorToolNormalization` envelope names):

```typescript
import {
  TOOL_ASK_USER_QUESTION,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_READ,
  TOOL_TASK,
  TOOL_TODO_WRITE,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  TOOL_WRITE,
} from '../../../core/tools/toolNames';

const CURSOR_ACP_TOOL_NAME_MAP: Record<string, string> = {
  ask_question: TOOL_ASK_USER_QUESTION,
  bash: TOOL_BASH,
  delete: TOOL_BASH,
  edit: TOOL_EDIT,
  fetch: TOOL_WEB_FETCH,
  glob: TOOL_GLOB,
  grep: TOOL_GREP,
  ls: TOOL_BASH,
  question: TOOL_ASK_USER_QUESTION,
  read: TOOL_READ,
  shell: TOOL_BASH,
  task: TOOL_TASK,
  todowrite: TOOL_TODO_WRITE,
  update_todos: TOOL_TODO_WRITE,
  webfetch: TOOL_WEB_FETCH,
  websearch: TOOL_WEB_SEARCH,
  write: TOOL_WRITE,
};

export const CURSOR_ACP_CANONICAL_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(CURSOR_ACP_TOOL_NAME_MAP),
);
```

`createCursorAcpToolStreamAdapter()` follows the opencode factory's shape verbatim with this map. If the opencode factory contains Opencode-only result reshaping, omit those branches — Cursor v1 passes ACP tool results through the adapter's generic handling.

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npx jest tests/unit/providers/cursor/runtime/cursorAcpToolNames.test.ts --selectProjects unit` → PASS.

```bash
git add src/providers/cursor/runtime/cursorAcpToolNames.ts tests/unit/providers/cursor/runtime/cursorAcpToolNames.test.ts
git commit -m "feat(cursor): ACP tool-name normalization adapter"
```

---

### Task 3: Mode mapping + prompt blocks

**Files:**
- Create: `src/providers/cursor/runtime/cursorAcpSession.ts`
- Create: `src/providers/cursor/runtime/cursorAcpPrompt.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorAcpSession.test.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorAcpPrompt.test.ts`

- [ ] **Step 1: Failing tests for mode mapping**

```typescript
// tests/unit/providers/cursor/runtime/cursorAcpSession.test.ts
import { resolveCursorAcpMode } from '@/providers/cursor/runtime/cursorAcpSession';

describe('resolveCursorAcpMode', () => {
  it('maps normal to agent mode with approvals routed to the card', () => {
    expect(resolveCursorAcpMode('normal')).toEqual({ modeId: 'agent', autoApprove: false });
  });
  it('maps yolo to agent mode with auto-approval', () => {
    expect(resolveCursorAcpMode('yolo')).toEqual({ modeId: 'agent', autoApprove: true });
  });
  it('maps plan to plan mode', () => {
    expect(resolveCursorAcpMode('plan')).toEqual({ modeId: 'plan', autoApprove: false });
  });
});
```

- [ ] **Step 2: Failing tests for prompt blocks**

```typescript
// tests/unit/providers/cursor/runtime/cursorAcpPrompt.test.ts
import { buildCursorAcpPromptBlocks } from '@/providers/cursor/runtime/cursorAcpPrompt';
import type { PreparedChatTurn } from '@/core/runtime/types';

function turn(prompt: string, images: Array<{ data: string; mediaType: string }> = []): PreparedChatTurn {
  return {
    isCompact: false,
    mcpMentions: new Set(),
    persistedContent: prompt,
    prompt,
    request: { text: prompt, images } as PreparedChatTurn['request'],
  };
}

describe('buildCursorAcpPromptBlocks', () => {
  it('emits the encoded turn prompt as a single text block', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('hello'), []);
    expect(blocks).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('appends image blocks from the request', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('look', [{ data: 'AAAA', mediaType: 'image/png' }]), []);
    expect(blocks[1]).toEqual({ data: 'AAAA', mimeType: 'image/png', type: 'image' });
  });

  it('bootstraps prior conversation context when history is passed (session/load fallback)', () => {
    const history = [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ] as never;
    const blocks = buildCursorAcpPromptBlocks(turn('follow-up'), history);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('earlier question');
    expect(text).toContain('follow-up');
  });

  it('prepends the bound-agent persona before the prompt', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('do it'), [], 'You are the reviewer.');
    const text = (blocks[0] as { text: string }).text;
    expect(text.startsWith('You are the reviewer.')).toBe(true);
    expect(text).toContain('do it');
  });
});
```

- [ ] **Step 3: Run both → FAIL, then implement**

`cursorAcpSession.ts`:

```typescript
import type { CursorPermissionMode } from './cursorLaunchArgs';

export interface CursorAcpModeResolution {
  modeId: 'agent' | 'plan';
  autoApprove: boolean;
}

/**
 * Cursor ACP exposes agent/plan/ask session modes. Chat turns never use `ask`
 * (that is the aux runner's read-only posture); yolo keeps agent mode and
 * auto-answers permission requests instead of engaging --force-style flags.
 */
export function resolveCursorAcpMode(permissionMode: CursorPermissionMode): CursorAcpModeResolution {
  if (permissionMode === 'plan') {
    return { modeId: 'plan', autoApprove: false };
  }
  return { modeId: 'agent', autoApprove: permissionMode === 'yolo' };
}
```

`cursorAcpPrompt.ts` (mirrors `buildOpencodePromptBlocks` in `src/providers/opencode/runtime/buildOpencodePrompt.ts`, but the text seed is `turn.prompt` — already fully encoded by `encodeCursorTurn` — instead of re-rendering the request):

```typescript
import type { PreparedChatTurn } from '../../../core/runtime/types';
import type { ChatMessage } from '../../../core/types';
import { buildContextFromHistory, buildPromptWithHistoryContext } from '../../../utils/session';
import type { AcpContentBlock } from '../../acp';

export function buildCursorAcpPromptBlocks(
  turn: PreparedChatTurn,
  conversationHistory: ChatMessage[] = [],
  boundAgentPrompt?: string,
): AcpContentBlock[] {
  let promptText = turn.prompt;

  if (conversationHistory.length > 0) {
    const historyContext = buildContextFromHistory(conversationHistory);
    promptText = buildPromptWithHistoryContext(historyContext, promptText, promptText, conversationHistory);
  }

  if (boundAgentPrompt) {
    promptText = `${boundAgentPrompt}\n\n---\n\n${promptText}`;
  }

  const blocks: AcpContentBlock[] = [{ type: 'text', text: promptText }];
  for (const image of turn.request.images ?? []) {
    if (!image.data) {
      continue;
    }
    blocks.push({ data: image.data, mimeType: image.mediaType, type: 'image' });
  }
  return blocks;
}
```

- [ ] **Step 4: Run both suites → PASS. Commit**

```bash
git add src/providers/cursor/runtime/cursorAcpSession.ts src/providers/cursor/runtime/cursorAcpPrompt.ts tests/unit/providers/cursor/runtime/cursorAcpSession.test.ts tests/unit/providers/cursor/runtime/cursorAcpPrompt.test.ts
git commit -m "feat(cursor): ACP mode mapping and prompt block builder"
```

---

### Task 4: Cursor dialect extensions (`cursor/ask_question`, `cursor/create_plan`, `cursor/update_todos`)

**Files:**
- Create: `src/providers/cursor/runtime/cursorAcpExtensions.ts`
- Test: `tests/unit/providers/cursor/runtime/cursorAcpExtensions.test.ts`

The transport contract: `AcpJsonRpcTransport.onRequest(method, handler)` registers a blocking server-request handler (handler's resolved value is sent back as the RPC response); `onNotification(method, handler)` for one-way events. Both return unsubscribe functions.

- [ ] **Step 1: Write the failing test**

Use a minimal fake transport capturing registrations:

```typescript
import { registerCursorAcpExtensions } from '@/providers/cursor/runtime/cursorAcpExtensions';
import { TOOL_TODO_WRITE } from '@/core/tools/toolNames';
import type { StreamChunk } from '@/core/types';

type Handler = (params: unknown) => Promise<unknown>;

function makeFakeTransport() {
  const requests = new Map<string, Handler>();
  const notifications = new Map<string, Handler>();
  return {
    transport: {
      onRequest: (method: string, handler: Handler) => {
        requests.set(method, handler);
        return () => requests.delete(method);
      },
      onNotification: (method: string, handler: Handler) => {
        notifications.set(method, handler);
        return () => notifications.delete(method);
      },
    },
    requests,
    notifications,
  };
}

describe('registerCursorAcpExtensions', () => {
  it('answers cursor/ask_question in-turn through host.askUser', async () => {
    const { transport, requests } = makeFakeTransport();
    const askUser = jest.fn().mockResolvedValue({ 'Pick one': 'B' });
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      sessionId: 's1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
    });

    expect(askUser).toHaveBeenCalled();
    expect(JSON.stringify(response)).toContain('B');
  });

  it('returns a rejected shape when the user dismisses the question', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as { rejected?: boolean };
    expect(response.rejected).toBe(true);
  });

  it('acknowledges cursor/create_plan and marks the turn plan-completed with the plan text emitted', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const patches: Record<string, unknown>[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: (p) => patches.push(p),
    });

    await requests.get('cursor/create_plan')!({ plan: '# The plan\n1. do it' });

    expect(chunks.some((c) => c.type === 'text' && c.content.includes('The plan'))).toBe(true);
    expect(patches).toContainEqual({ planCompleted: true });
  });

  it('maps cursor/update_todos to a TodoWrite tool chunk', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: () => {},
    });

    await notifications.get('cursor/update_todos')!({ todos: [{ content: 'step 1', status: 'pending' }] });

    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe(TOOL_TODO_WRITE);
  });

  it('returns an unsubscribe that removes every handler', () => {
    const { transport, requests, notifications } = makeFakeTransport();
    const unregister = registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });
    unregister();
    expect(requests.size).toBe(0);
    expect(notifications.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement**

```typescript
import type { ChatTurnMetadata } from '../../../core/runtime/types';
import { TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { AskUserQuestionCallback } from '../../../core/runtime/types';
import type { StreamChunk } from '../../../core/types';
import type { AcpJsonRpcTransport } from '../../acp';

export interface CursorAcpExtensionHost {
  askUser: AskUserQuestionCallback;
  emitChunk: (chunk: StreamChunk) => void;
  patchTurnMetadata: (patch: Partial<ChatTurnMetadata>) => void;
}

interface CursorAskQuestionParams {
  sessionId?: string;
  question?: string;
  questions?: Array<{ question?: string; header?: string; options?: Array<{ label?: string; description?: string }> }>;
  options?: Array<{ label?: string; description?: string }>;
}

let todoCallCounter = 0;

/**
 * Registers Cursor's ACP extension methods. `cursor/ask_question` and
 * `cursor/create_plan` are BLOCKING agent→client requests — the agent waits
 * for the RPC response — which is exactly what replaces the stream-json
 * auto-reject + resume-turn delivery (ADR-0002).
 *
 * Payload shapes are doc-derived, not capture-verified (the design skips the
 * spike), so parsing is tolerant: unknown shapes degrade to a rejected
 * response rather than throwing into the transport.
 */
export function registerCursorAcpExtensions(
  transport: AcpJsonRpcTransport,
  host: CursorAcpExtensionHost,
): () => void {
  const unsubscribes: Array<() => void> = [];

  unsubscribes.push(transport.onRequest('cursor/ask_question', async (params) => {
    const parsed = (params ?? {}) as CursorAskQuestionParams;
    const questions = parsed.questions?.length
      ? parsed.questions
      : [{ question: parsed.question ?? '', options: parsed.options ?? [] }];

    const askInput = {
      questions: questions.map((q, index) => ({
        header: q.header ?? '',
        question: q.question ?? `Question ${index + 1}`,
        multiSelect: false,
        options: (q.options ?? []).map((o) => ({
          label: o.label ?? '',
          ...(o.description ? { description: o.description } : {}),
        })),
      })),
    };

    let answers: Record<string, string> | null = null;
    try {
      answers = await host.askUser(askInput as never, undefined as never) as Record<string, string> | null;
    } catch {
      answers = null;
    }

    if (!answers || Object.keys(answers).length === 0) {
      return { rejected: true, reason: 'Question dismissed by user' };
    }
    return { answers };
  }));

  unsubscribes.push(transport.onRequest('cursor/create_plan', async (params) => {
    const plan = (params as { plan?: string; content?: string; text?: string } | undefined) ?? {};
    const planText = plan.plan ?? plan.content ?? plan.text ?? '';
    if (planText) {
      host.emitChunk({ type: 'text', content: `\n\n${planText}\n` });
    }
    host.patchTurnMetadata({ planCompleted: true });
    return {};
  }));

  unsubscribes.push(transport.onNotification('cursor/update_todos', async (params) => {
    const todos = (params as { todos?: unknown[] } | undefined)?.todos ?? [];
    const id = `cursor-todos-${++todoCallCounter}`;
    host.emitChunk({ type: 'tool_use', id, name: TOOL_TODO_WRITE, input: { todos } });
    host.emitChunk({ type: 'tool_result', id, content: 'Todos updated' });
  }));

  // cursor/task carries live subagent lifecycle — deferred per the design.
  unsubscribes.push(transport.onNotification('cursor/task', async () => {}));

  return () => {
    while (unsubscribes.length > 0) {
      unsubscribes.pop()?.();
    }
  };
}
```

Adjust the `askUser` invocation to the real `AskUserQuestionCallback` signature (`grep -n "AskUserQuestionCallback" src/core/runtime/types.ts` and match its params — the stream-json path called it as `this.host.askUser(input, signal)`; mirror that). If the callback's input type differs from the object above, adapt the mapping, not the tests' observable behavior.

- [ ] **Step 3: Run → PASS. Commit**

```bash
git add src/providers/cursor/runtime/cursorAcpExtensions.ts tests/unit/providers/cursor/runtime/cursorAcpExtensions.test.ts
git commit -m "feat(cursor): ACP dialect extensions — in-turn ask_question, create_plan, todos"
```

---

### Task 5: Launch plumbing (`agent acp` spawn) + `windowsVerbatimArguments` passthrough

**Files:**
- Modify: `src/core/transport/AgentSubprocess.ts` (accept optional `windowsVerbatimArguments` in the launch spec and pass to `spawn`)
- Modify: `src/providers/acp/AcpSubprocess.ts` (thread the field through `AcpSubprocessLaunchSpec`)
- Create: `src/providers/cursor/runtime/cursorAcpLaunch.ts`
- Test: `tests/unit/core/transport/AgentSubprocess.test.ts` (extend), `tests/unit/providers/cursor/runtime/cursorAcpLaunch.test.ts`

- [ ] **Step 1: Failing test — AgentSubprocess passthrough**

Add to the existing `AgentSubprocess.test.ts` (follow its established mock-spawn pattern — read the file first and use the same fixture helpers):

```typescript
it('passes windowsVerbatimArguments through to spawn when set', () => {
  // Using the suite's existing spawn spy/mocking helper:
  const proc = new AgentSubprocess({
    args: ['/c', '"agent acp"'],
    command: 'cmd.exe',
    cwd: '/tmp',
    env: {},
    windowsVerbatimArguments: true,
  });
  proc.start();
  expect(lastSpawnOptions().windowsVerbatimArguments).toBe(true);
});
```

Implementation: add `windowsVerbatimArguments?: boolean` to the launch-spec interface in `AgentSubprocess.ts` and spread `...(spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {})` into the existing `spawn(...)` options object. Mirror the optional field in `AcpSubprocessLaunchSpec` and its `AgentSubprocess` construction.

- [ ] **Step 2: Failing test — launch spec assembly**

```typescript
// tests/unit/providers/cursor/runtime/cursorAcpLaunch.test.ts
import { buildCursorAcpLaunchSpec } from '@/providers/cursor/runtime/cursorAcpLaunch';

describe('buildCursorAcpLaunchSpec', () => {
  it('appends the acp subcommand to the resolved cursor launch', () => {
    const spec = buildCursorAcpLaunchSpec('/home/u/.local/bin/cursor-agent', '/vault', { PATH: '/usr/bin' });
    expect(spec.args[spec.args.length - 1]).toBe('acp');
    expect(spec.cwd).toBe('/vault');
    expect(spec.env.PATH).toBe('/usr/bin');
  });
});
```

- [ ] **Step 3: Implement `cursorAcpLaunch.ts`**

```typescript
import type { AcpJsonRpcTransport as AcpTransportType } from '../../acp';
import { AcpJsonRpcTransport, AcpSubprocess, type AcpSubprocessLaunchSpec } from '../../acp';
import { resolveCursorLaunch } from './cursorLaunch';

export function buildCursorAcpLaunchSpec(
  cliPath: string,
  cwd: string,
  env: Record<string, string>,
): AcpSubprocessLaunchSpec {
  // resolveCursorLaunch prefers spawning node + index.js directly (no shell),
  // falling back to a cmd.exe batch-shim wrap on Windows — the same
  // Windows-safety the per-turn path used, now paid once per session.
  const launch = resolveCursorLaunch(cliPath, ['acp']);
  return {
    args: launch.args,
    command: launch.command,
    cwd,
    env: launch.extraEnv ? { ...env, ...launch.extraEnv } : env,
    ...(launch.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
  };
}

export function startCursorAcpProcess(spec: AcpSubprocessLaunchSpec): {
  process: AcpSubprocess;
  transport: AcpTransportType;
} {
  const process = new AcpSubprocess(spec);
  process.start();
  const transport = new AcpJsonRpcTransport({
    input: process.stdout,
    onClose: (listener) => process.onClose(listener),
    output: process.stdin,
  });
  return { process, transport };
}
```

(Check `resolveCursorLaunch`'s exact return type in `src/providers/cursor/runtime/cursorLaunch.ts:98-118` — `CursorLaunchSpec` with `command`, `args`, optional `extraEnv`, optional `windowsVerbatimArguments` — and match field names.)

- [ ] **Step 4: Run all three touched suites → PASS. Commit**

```bash
git add src/core/transport/AgentSubprocess.ts src/providers/acp/AcpSubprocess.ts src/providers/cursor/runtime/cursorAcpLaunch.ts tests/
git commit -m "feat(cursor): agent-acp launch plumbing with Windows-safe spawn passthrough"
```

---

### Task 6: Rewrite `CursorChatRuntime` on ACP

**Files:**
- Rewrite: `src/providers/cursor/runtime/CursorChatRuntime.ts`
- Test: rewrite `tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts`

Structure mirrors `OpencodeChatRuntime` with these Cursor deviations: no launch artifacts/config file; auth via `cursor_login`; session fallback re-injects history; usage falls back to the model-window catalog (`extractCursorUsage` from `./cursorUsageMapping`); the spawn is wrapped in `runWithCursorAgentSpawnLock` (see `cursorAgentSpawnLock.ts` — it exports both `acquireCursorAgentSpawnLock` and `runWithCursorAgentSpawnLock`; use the latter).

- [ ] **Step 1: Failing tests for the pure seams**

Rewrite `CursorChatRuntime.test.ts` (the old spawn-based suite dies in Task 7) with construction-time and pure-seam tests:

```typescript
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';
import { createHeadlessRuntimeHost } from '@/core/runtime/RuntimeHost';

function makeRuntime(overrides: Record<string, unknown> = {}): CursorChatRuntime {
  const plugin = {
    getResolvedProviderCliPath: () => '/bin/cursor-agent',
    getResolvedEnvironmentVariables: () => ({}),
    settings: { permissionMode: 'normal' },
    logger: { scope: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) },
    app: {},
    manifest: { version: '1.0.0' },
    ...overrides,
  };
  return new CursorChatRuntime(plugin as never, createHeadlessRuntimeHost());
}

describe('CursorChatRuntime (ACP)', () => {
  it('reports persistent-runtime capabilities', () => {
    expect(makeRuntime().getCapabilities().supportsPersistentRuntime).toBe(true);
  });

  it('is not ready without a resolved CLI path', async () => {
    const runtime = makeRuntime({ getResolvedProviderCliPath: () => null });
    await expect(runtime.ensureReady()).resolves.toBe(false);
  });

  it('builds session updates carrying chatSessionId provider state', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.sessionId = 'abc123';
    const result = (runtime.buildSessionUpdates as (p: unknown) => { updates: { sessionId: string | null } })
      .call(runtime, { conversation: null, sessionInvalidated: false });
    expect(result.updates.sessionId).toBe('abc123');
  });

  it('formats runtime errors with the stderr snapshot appended', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.process = { getStderrSnapshot: () => 'acp: unknown subcommand' };
    const msg = (runtime.formatRuntimeError as (e: unknown) => string).call(runtime, new Error('exited'));
    expect(msg).toContain('exited');
    expect(msg).toContain('unknown subcommand');
  });

  it('maps a pre-initialize process death to the update-your-CLI error', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const msg = (runtime.describeStartupFailure as (e: unknown) => string)
      .call(runtime, new Error('transport closed'));
    expect(msg).toMatch(/update.*cursor-agent|Cursor CLI/i);
  });
});
```

- [ ] **Step 2: Run → FAIL. Write the new runtime**

Full replacement of `CursorChatRuntime.ts`:

```typescript
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
import type { ChatMessage, Conversation, SlashCommand, StreamChunk } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { asSettingsBag } from '../../../core/types/settings';
import { getVaultPath } from '../../../utils/path';
import type { AcpJsonRpcTransport, AcpSubprocess } from '../../acp';
import {
  AcpClientConnection,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpStreamChunkQueue,
  buildAcpApprovalDecisionOptions,
  buildAcpUsageInfo,
  buildActiveTurnEffect,
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from '../../acp';
import { CURSOR_PROVIDER_CAPABILITIES } from '../capabilities';
import { encodeCursorTurn } from '../prompt/encodeCursorTurn';
import { getCursorState, resolveCursorSessionId } from '../types';
import { buildCursorAgentEnvironment } from './cursorAgentEnv';
import { runWithCursorAgentSpawnLock } from './cursorAgentSpawnLock';
import { registerCursorAcpExtensions } from './cursorAcpExtensions';
import { buildCursorAcpLaunchSpec, startCursorAcpProcess } from './cursorAcpLaunch';
import { buildCursorAcpPromptBlocks } from './cursorAcpPrompt';
import { resolveCursorAcpMode } from './cursorAcpSession';
import { createCursorAcpToolStreamAdapter } from './cursorAcpToolNames';
import { extractCursorUsage } from './cursorUsageMapping';
import { cleanupStaleCursorMcpServer } from './cursorMcpCleanup';

interface ActiveTurn {
  queue: AcpStreamChunkQueue;
  sessionId: string;
}

const CURSOR_ACP_INIT_TIMEOUT_MS = 20_000;
const CURSOR_OLD_CLI_MESSAGE =
  'Cursor CLI does not support ACP (`agent acp`). Update cursor-agent (`cursor-agent update` or reinstall from cursor.com/cli), then retry.';
const CURSOR_LOGIN_MESSAGE =
  'Cursor CLI is not authenticated. Run `cursor-agent login` in a terminal, then retry.';

export class CursorChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'cursor';

  private activeTurn: ActiveTurn | null = null;
  private autoApprovePermissions = false;
  private connection: AcpClientConnection | null = null;
  private currentModeId: string | null = null;
  private currentTurnIsPlan = false;
  private loadedSessionId: string | null = null;
  private process: AcpSubprocess | null = null;
  private ready = false;
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private sessionBootstrapNeeded = false;
  private sessionId: string | null = null;
  private sessionInvalidated = false;
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer();
  private staleMcpCleaned = false;
  private readonly toolStreamAdapter = createCursorAcpToolStreamAdapter();
  private transport: AcpJsonRpcTransport | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private unregisterExtensions: (() => void) | null = null;
  private unregisterTransportClose: (() => void) | null = null;

  constructor(
    private readonly plugin: PluginContext,
    private readonly host: RuntimeHost,
  ) {}

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
    const nextSessionId = conversation ? resolveCursorSessionId(conversation) : null;
    if (this.sessionId !== nextSessionId) {
      this.sessionInvalidated = false;
      this.sessionBootstrapNeeded = false;
    }
    this.sessionId = nextSessionId;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      this.setReady(false);
      return false;
    }

    if (this.process?.isAlive() && this.transport && !this.transport.isClosed && this.connection) {
      return true;
    }

    try {
      await this.startProcess(cli);
      return true;
    } catch (error) {
      this.setReady(false);
      this.plugin.logger.scope('cursor.acp').warn('startup failed', error);
      return false;
    }
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    this.turnMetadata = {};

    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      yield { type: 'error', content: 'Cursor Agent CLI not found. Configure it in Cursor settings.' };
      yield { type: 'done' };
      return;
    }

    yield { type: 'user_message_start', content: turn.persistedContent };
    yield { type: 'assistant_message_start' };

    if (!this.staleMcpCleaned) {
      this.staleMcpCleaned = true;
      await cleanupStaleCursorMcpServer();
    }

    let startupError: string | null = null;
    if (!(await this.ensureReady())) {
      startupError = this.lastStartupErrorMessage ?? CURSOR_OLD_CLI_MESSAGE;
    }
    if (startupError || !this.connection) {
      yield { type: 'error', content: startupError ?? 'Cursor ACP runtime is not ready.' };
      yield { type: 'done' };
      return;
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const sessionId = await this.ensureSession(cwd);
    if (!sessionId) {
      yield { type: 'error', content: this.lastStartupErrorMessage ?? 'Failed to open a Cursor session.' };
      yield { type: 'done' };
      return;
    }

    const mode = resolveCursorAcpMode(this.plugin.settings.permissionMode);
    this.autoApprovePermissions = mode.autoApprove;
    this.currentTurnIsPlan = mode.modeId === 'plan';
    await this.applyMode(sessionId, mode.modeId);

    this.activeTurn?.queue.close();
    const activeTurn: ActiveTurn = { queue: new AcpStreamChunkQueue(), sessionId };
    this.activeTurn = activeTurn;
    this.sessionUpdateNormalizer.reset();
    this.toolStreamAdapter.reset();

    const history = this.sessionBootstrapNeeded ? (conversationHistory ?? []) : [];
    this.sessionBootstrapNeeded = false;

    const promptPromise = this.connection.prompt({
      prompt: buildCursorAcpPromptBlocks(turn, history, queryOptions?.boundAgentPrompt),
      sessionId,
    }).then((response) => {
      this.emitFinalUsage(activeTurn, response.usage ?? null, queryOptions);
      if (this.currentTurnIsPlan) {
        this.turnMetadata.planCompleted = true;
      }
      activeTurn.queue.push({ type: 'done' });
      activeTurn.queue.close();
    }).catch((error) => {
      activeTurn.queue.push({ type: 'error', content: this.formatRuntimeError(error) });
      activeTurn.queue.push({ type: 'done' });
      activeTurn.queue.close();
    }).finally(() => {
      if (this.activeTurn === activeTurn) {
        this.activeTurn = null;
      }
    });

    try {
      while (true) {
        const chunk = await activeTurn.queue.next();
        if (!chunk) {
          break;
        }
        yield chunk;
      }
      await promptPromise;
    } finally {
      if (this.activeTurn === activeTurn) {
        this.activeTurn = null;
      }
    }
  }

  cancel(): void {
    if (this.connection && this.sessionId) {
      this.connection.cancel({ sessionId: this.sessionId });
    }
    this.host.dismissApproval();
  }

  resetSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.sessionInvalidated = false;
    this.sessionBootstrapNeeded = false;
    this.currentModeId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  consumeSessionInvalidation(): boolean {
    const invalidated = this.sessionInvalidated;
    this.sessionInvalidated = false;
    return invalidated;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  async cleanup(): Promise<void> {
    this.activeTurn?.queue.close();
    this.activeTurn = null;
    await this.shutdownProcess();
    this.readyListeners.clear();
  }

  // rewind() omitted — Cursor Agent does not support rewind
  // (supportsRewind: false). Callers gate on capability; ADR-0001 Phase 2.

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    if (params.sessionInvalidated && params.conversation && !this.sessionId) {
      return { updates: { sessionId: null, providerState: undefined } };
    }

    const sid = this.sessionId;
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

  private lastStartupErrorMessage: string | null = null;

  private async startProcess(cliPath: string): Promise<void> {
    await this.shutdownProcess();
    this.lastStartupErrorMessage = null;

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildCursorAgentEnvironment(this.plugin, cliPath);
    const spec = buildCursorAcpLaunchSpec(cliPath, cwd, env);

    // The spawn lock guards ~/.cursor/cli-config.json contention (Windows
    // EPERM under concurrent spawns) — now once per session, not per turn.
    const { process: proc, transport } = await runWithCursorAgentSpawnLock(
      async () => startCursorAcpProcess(spec),
    );
    this.process = proc;
    this.transport = transport;
    this.unregisterTransportClose = transport.onClose(() => {
      if (this.transport === transport) {
        this.setReady(false);
        this.activeTurn?.queue.push({
          type: 'error',
          content: this.formatRuntimeError(new Error('Cursor ACP process exited unexpectedly.')),
        });
        this.activeTurn?.queue.push({ type: 'done' });
        this.activeTurn?.queue.close();
      }
    });

    this.connection = new AcpClientConnection({
      clientInfo: { name: 'specorator', version: this.plugin.manifest?.version ?? '0.0.0' },
      delegate: {
        onSessionNotification: (notification) => this.handleSessionNotification(notification),
        requestPermission: (request) => this.handlePermissionRequest(request),
      },
      transport,
    });
    this.unregisterExtensions = registerCursorAcpExtensions(transport, {
      askUser: this.host.askUser,
      emitChunk: (chunk) => this.activeTurn?.queue.push(chunk),
      patchTurnMetadata: (patch) => Object.assign(this.turnMetadata, patch),
    });

    transport.start();
    try {
      await withTimeout(
        this.connection.initialize(),
        CURSOR_ACP_INIT_TIMEOUT_MS,
        new Error('ACP initialize timed out'),
      );
    } catch (error) {
      this.lastStartupErrorMessage = this.describeStartupFailure(error);
      await this.shutdownProcess();
      throw error;
    }
    this.setReady(true);
  }

  private describeStartupFailure(_error: unknown): string {
    // Any failure before initialize resolves — immediate exit ("unknown
    // subcommand"), closed transport, or timeout — means the installed
    // cursor-agent predates ACP. One actionable message covers them all.
    const stderr = this.process?.getStderrSnapshot() ?? '';
    return stderr ? `${CURSOR_OLD_CLI_MESSAGE}\n\n${stderr}` : CURSOR_OLD_CLI_MESSAGE;
  }

  private async ensureSession(cwd: string): Promise<string | null> {
    if (!this.connection) {
      return null;
    }
    if (this.sessionId && this.loadedSessionId === this.sessionId) {
      return this.sessionId;
    }

    if (this.sessionId) {
      try {
        const response = await this.connection.loadSession({
          cwd,
          mcpServers: [],
          sessionId: this.sessionId,
        });
        this.loadedSessionId = response.sessionId;
        this.sessionId = response.sessionId;
        return response.sessionId;
      } catch (error) {
        // Load-bearing no-spike fallback: an id-mapping mismatch degrades to a
        // fresh session with history re-injected on the next prompt.
        this.plugin.logger.scope('cursor.acp').warn('session/load failed; falling back to new session', error);
        this.sessionInvalidated = true;
        this.sessionBootstrapNeeded = true;
        this.sessionId = null;
        this.loadedSessionId = null;
      }
    }

    return this.createSession(cwd);
  }

  private async createSession(cwd: string): Promise<string | null> {
    if (!this.connection) {
      return null;
    }
    try {
      const response = await this.connection.newSession({ cwd, mcpServers: [] });
      this.loadedSessionId = response.sessionId;
      this.sessionId = response.sessionId;
      return response.sessionId;
    } catch (error) {
      if (await this.tryAuthenticate()) {
        try {
          const response = await this.connection.newSession({ cwd, mcpServers: [] });
          this.loadedSessionId = response.sessionId;
          this.sessionId = response.sessionId;
          return response.sessionId;
        } catch (retryError) {
          this.lastStartupErrorMessage = this.formatRuntimeError(retryError);
          return null;
        }
      }
      this.lastStartupErrorMessage = CURSOR_LOGIN_MESSAGE + '\n\n' + this.formatRuntimeError(error);
      return null;
    }
  }

  private async tryAuthenticate(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }
    try {
      await this.connection.authenticate({ methodId: 'cursor_login' });
      return true;
    } catch {
      return false;
    }
  }

  private async applyMode(sessionId: string, modeId: string): Promise<void> {
    if (!this.connection || this.currentModeId === modeId) {
      return;
    }
    try {
      await this.connection.setMode({ modeId, sessionId });
      this.currentModeId = modeId;
    } catch (error) {
      // Mode setting is best-effort: an agent that rejects setMode still runs
      // the turn in its default mode; approvals remain client-enforced.
      this.plugin.logger.scope('cursor.acp').warn('setMode failed', error);
    }
  }

  private async handleSessionNotification(notification: AcpSessionNotification): Promise<void> {
    if (!this.activeTurn || notification.sessionId !== this.activeTurn.sessionId) {
      return;
    }
    const normalized = this.sessionUpdateNormalizer.normalize(notification.update);
    if (
      normalized.type !== 'message_chunk'
      && normalized.type !== 'tool_call'
      && normalized.type !== 'tool_call_update'
      && normalized.type !== 'usage'
    ) {
      return;
    }

    const effect = buildActiveTurnEffect(normalized, {
      promptUsage: null,
      resolveUsageModel: () => this.resolveActiveModel() ?? 'cursor',
      sessionId: notification.sessionId,
      toolStreamAdapter: this.toolStreamAdapter,
    });
    if (effect.metadataPatch) {
      Object.assign(this.turnMetadata, effect.metadataPatch);
    }
    for (const chunk of effect.chunks) {
      this.activeTurn.queue.push(chunk);
    }
  }

  private async handlePermissionRequest(
    request: AcpRequestPermissionRequest,
  ): Promise<AcpRequestPermissionResponse> {
    if (this.autoApprovePermissions) {
      const preferred = selectPermissionOption(request.options, ['allow_always', 'allow_once']);
      if (preferred) {
        return { outcome: { outcome: 'selected', optionId: preferred.optionId } };
      }
    }

    const input = normalizeApprovalInput(request.toolCall.rawInput);
    const decision = await this.host.approval(
      request.toolCall.title ?? 'tool',
      input,
      request.toolCall.title ?? '',
      { decisionOptions: buildAcpApprovalDecisionOptions(request.options) },
    );
    return mapApprovalDecision(decision, request.options);
  }

  private emitFinalUsage(
    activeTurn: ActiveTurn,
    promptUsage: Parameters<typeof buildAcpUsageInfo>[0]['promptUsage'],
    queryOptions?: ChatRuntimeQueryOptions,
  ): void {
    const model = this.resolveActiveModel(queryOptions);
    if (!model) {
      return; // usage contract: never emit without a model
    }

    const acpUsage = buildAcpUsageInfo({ contextWindow: null, model, promptUsage });
    if (acpUsage) {
      activeTurn.queue.push({ sessionId: activeTurn.sessionId, type: 'usage', usage: acpUsage });
      return;
    }

    // No ACP usage payload: fall back to the model-window catalog (same
    // zero-token window shape the stream-json path emitted without usage data).
    const fallback = extractCursorUsage({}, model);
    activeTurn.queue.push({
      sessionId: activeTurn.sessionId,
      type: 'usage',
      usage: {
        model,
        inputTokens: fallback.inputTokens,
        outputTokens: fallback.outputTokens ?? 0,
        contextTokens: fallback.contextTokens,
        contextWindow: fallback.contextWindow,
        percentage: fallback.percentage,
      } as never,
    });
  }

  private resolveActiveModel(queryOptions?: ChatRuntimeQueryOptions): string | null {
    if (typeof queryOptions?.model === 'string' && queryOptions.model.trim()) {
      return queryOptions.model.trim();
    }
    const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
      asSettingsBag(this.plugin.settings),
      'cursor',
    );
    return typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : null;
  }

  private formatRuntimeError(error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : 'Cursor ACP request failed';
    const stderr = this.process?.getStderrSnapshot();
    return stderr ? `${baseMessage}\n\n${stderr}` : baseMessage;
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) {
      return;
    }
    this.ready = ready;
    for (const listener of this.readyListeners) {
      listener(ready);
    }
  }

  private async shutdownProcess(): Promise<void> {
    this.setReady(false);
    this.unregisterExtensions?.();
    this.unregisterExtensions = null;
    this.unregisterTransportClose?.();
    this.unregisterTransportClose = null;
    this.connection?.dispose();
    this.connection = null;
    this.transport?.dispose();
    this.transport = null;
    if (this.process) {
      await this.process.shutdown().catch(() => {}); // best-effort
      this.process = null;
    }
    this.loadedSessionId = null;
    this.currentModeId = null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
```

Adaptation checklist while making it compile (each is a real-API check, not a design decision):
- `runWithCursorAgentSpawnLock` — confirm its signature in `cursorAgentSpawnLock.ts`; if only `acquireCursorAgentSpawnLock` exists, acquire/release around `startCursorAcpProcess` in a try/finally.
- `AcpSetSessionModeRequest` field names (`modeId` vs `mode`) — check `src/providers/acp/types.ts` and match.
- `selectPermissionOption` signature — check `acpApprovalMapping.ts` (moved in Task 1) and match its option-kind argument shape.
- `AcpRequestPermissionResponse` shape for the auto-approve branch — copy the exact selected-outcome shape from `mapApprovalDecision`'s implementation.
- `extractCursorUsage` return fields — check `cursorUsageMapping.ts`; route the fallback through `buildUsageInfo` from `core/providers/usage` if direct construction violates its contract (see `usageContractMatrix.test.ts`).
- `host.askUser` signature from `core/runtime/types.ts`.

- [ ] **Step 3: Update capabilities**

In `src/providers/cursor/capabilities.ts` set `supportsPersistentRuntime: true` (line 5). Everything else unchanged.

- [ ] **Step 4: Run the new suite + typecheck**

Run: `npx jest tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts --selectProjects unit` → PASS.
Run: `npm run typecheck` → clean. (`npm run lint` will flag the now-unused stream-json modules — they are deleted next task; run lint scoped: `npx eslint src/providers/cursor/runtime/CursorChatRuntime.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/ tests/unit/providers/cursor/runtime/CursorChatRuntime.test.ts
git commit -m "feat(cursor)!: rewrite chat runtime on first-party ACP (agent acp)"
```

---

### Task 7: Retire the stream-json path

**Files (delete):**
- `src/providers/cursor/runtime/cursorStreamMapper.ts`
- `src/providers/cursor/runtime/cursorQueryLaunch.ts`
- `src/providers/cursor/runtime/cursorQueryProcessing.ts`
- `src/providers/cursor/runtime/cursorQueryLifecycle.ts`
- `src/providers/cursor/runtime/cursorAskUserQuestion.ts`
- Tests: `cursorStreamMapper.test.ts`, `cursorStreamMapper.partialAssistant.test.ts`, `cursorStreamMapper.fixture.test.ts`, `cursorStreamMapper.replay.test.ts`, `cursorStreamMapper.subagent.test.ts`, `cursorStreamMapper.usage.test.ts`, `cursorAskUserQuestion.test.ts`, `cursorAskUserQuestionStream.fixture.test.ts`, `cursorQueryLifecycle.test.ts` — plus stream fixtures under `tests/fixtures/providers/cursor/` that only those suites import (`sample*Stream.ts`; keep `realCatalog.ts`)

**Files (modify):**
- `src/providers/cursor/runtime/cursorLaunchArgs.ts` — delete `buildCursorAgentFlagArgs` (the stream-json builder, lines 69-76); keep json/text builders (aux runner + model catalog use them)
- `src/providers/cursor/runtime/cursorUsageMapping.ts` — remove the `cursorStreamMapper` re-export comment/coupling if it references the deleted file
- Any survivor that imports a deleted module: `grep -rn "cursorStreamMapper\|cursorQueryLaunch\|cursorQueryProcessing\|cursorQueryLifecycle\|cursorAskUserQuestion" src/ tests/`

- [ ] **Step 1: Delete + prune**

```bash
git rm src/providers/cursor/runtime/cursorStreamMapper.ts \
  src/providers/cursor/runtime/cursorQueryLaunch.ts \
  src/providers/cursor/runtime/cursorQueryProcessing.ts \
  src/providers/cursor/runtime/cursorQueryLifecycle.ts \
  src/providers/cursor/runtime/cursorAskUserQuestion.ts
git rm tests/unit/providers/cursor/runtime/cursorStreamMapper*.test.ts \
  tests/unit/providers/cursor/runtime/cursorAskUserQuestion*.test.ts \
  tests/unit/providers/cursor/runtime/cursorQueryLifecycle.test.ts
```

Then run the grep above and fix every remaining import (expected: `cursorLaunchArgs.ts` internal references, possibly `cursorCliPrompt.ts` — that file stays because `resolveCursorCliPromptArg` serves the aux runner; delete only its chat-turn-only exports if now unused, e.g. `buildCursorAgentPrompt` if nothing imports it). `spawnCursorChild`/`awaitCursorExitCode` consumers in `CursorAuxCliRunner` — check whether the aux runner spawns via its own `spawnOnce` (it does) and delete the orphaned helpers with `cursorQueryLaunch.ts`.

- [ ] **Step 2: Full suite + gates**

Run: `npm run test -- --selectProjects unit && npm run typecheck && npm run lint`
Expected: PASS. If `usageContractMatrix.test.ts` or settings/integration suites referenced deleted modules, update their imports to the new runtime seams (behavior expectations unchanged).

Run: `npm run check:loc && npm run check:quality`
Expected: both pass; the deletions likely improve the fallow metrics — if the ratchet reports unlocked improvements, run `npm run check:quality -- --update` and stage the baseline.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(cursor)!: delete the one-shot stream-json chat path (hard cutover)"
```

---

### Task 8: Docs + validation checklist

**Files:**
- Modify: `CLAUDE.md` (the Cursor bullet in Architecture Status + the providers/cursor row in the Architecture table: now "over first-party ACP (`agent acp`)", in-turn AskUserQuestion via blocking `cursor/ask_question`, interactive approvals, delete the auto-resume description)
- Modify: `docs/adr/0002-cursor-askuserquestion-transport.md` (status → "superseded by implementation, 2026-07-*: resume-based delivery replaced by blocking `cursor/ask_question` over first-party ACP; see 2026-07-11-cursor-acp-runtime-design.md")
- Modify: `docs/product/user-manuals/install-cursor.md` (minimum CLI: a cursor-agent with the `acp` subcommand; `cursor-agent login` prerequisite; note that team-level/dashboard MCP servers don't apply in ACP mode — project/user `.cursor/mcp.json` does)
- Modify: `src/providers/cursor/settings/` settings tab (add the same MCP note near the existing MCP-related copy; find the exact widget file via `grep -rn "mcp" src/providers/cursor/settings/ src/providers/cursor/ui/`)

- [ ] **Step 1: Make the edits above** (wording per the design spec's "Docs updated in the same change" section)

- [ ] **Step 2: Full gates**

Run: `npm run typecheck && npm run lint && npm run test && npm run build && npm run check:loc && npm run check:css && npm run check:quality`
Expected: all green.

- [ ] **Step 3: Commit + push**

```bash
git add -A
git commit -m "docs: Cursor runs on first-party ACP — CLAUDE.md, ADR-0002 superseded, install manual"
git push -u origin claude/cursor-provider-invocation-b9vqb1
```

- [ ] **Step 4: Manual first-run validation (user-executed — replaces the spike)**

Run the 10-point checklist from the design spec (`docs/superpowers/specs/2026-07-11-cursor-acp-runtime-design.md`, "First-run validation checklist") on a real vault with a current cursor-agent. Payload-shape mismatches found here (ask_question/create_plan params, session/load id mapping) are expected findings — fix them in `cursorAcpExtensions.ts`/`ensureSession` with a captured fixture added to the relevant test suite per fix.

---

## Self-review notes (kept for the executor)

- **Spec coverage:** persistent process/lazy spawn (T6 `ensureReady`/`startProcess`), spawn-lock shrink (T6), session new/load/fallback + history bootstrap (T6 `ensureSession` + T3 prompt), permission posture incl. yolo auto-approve (T3 + T6 `handlePermissionRequest`), in-turn ask_question + create_plan + todos (T4), old-CLI and login errors (T6), mid-turn death (T6 transport close handler), cancel via `session/cancel` + `dismissApproval` (T6), usage with catalog fallback (T6 `emitFinalUsage`), tool-name normalization (T2), capabilities delta (T6 step 3), retirements (T7), docs (T8), first-run checklist (T8). JSONL history hydration and aux runner: intentionally untouched (survivors).
- **Known doc-derived guesses** (flagged inline in code comments): `cursor/ask_question` + `cursor/create_plan` payload shapes, `setMode` field names, whether `agent acp` emits ACP usage. Each has a tolerant fallback; the first-run checklist is the verification gate.
- **Type-consistency checkpoints** are listed as the adaptation checklist in Task 6 Step 2 — they are compile-time checks against real files, resolved by the executor at implementation time, not deferred design decisions.
