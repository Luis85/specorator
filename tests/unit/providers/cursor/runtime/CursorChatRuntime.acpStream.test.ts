import { Readable, Writable } from 'node:stream';

import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { createHeadlessRuntimeHost, type RuntimeHost } from '@/core/runtime/RuntimeHost';
import { TOOL_EDIT } from '@/core/tools/toolNames';
import type { StreamChunk } from '@/core/types';
import { AcpJsonRpcTransport, type AcpPromptResponse, type AcpSessionUpdate,AcpStreamChunkQueue } from '@/providers/acp';
import type { CursorAcpExtensionHost } from '@/providers/cursor/runtime/cursorAcpExtensions';
import * as cursorAcpExtensions from '@/providers/cursor/runtime/cursorAcpExtensions';
import * as cursorAcpLaunch from '@/providers/cursor/runtime/cursorAcpLaunch';
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';

// Drive the real AcpJsonRpcTransport (the shared core/transport JSON-RPC client)
// over in-memory duplex streams against a scripted fake ACP agent — the
// JsonRpcStdioClient.test.ts pattern extended into a full runtime-consumer
// integration. This exercises real line framing, request/response correlation,
// and server-notification routing through handleSessionNotification's entire
// pipeline (normalizer → active-turn effect → tool-stream adapter → queue),
// which the fake-connection seam tests deliberately skip.

jest.mock('@/providers/cursor/runtime/cursorAcpLaunch', () => ({
  buildCursorAcpLaunchSpec: jest.fn(() => ({ args: ['acp'], command: 'cursor-agent', cwd: '/', env: {} })),
  startCursorAcpProcess: jest.fn(),
}));

interface PromptScriptApi {
  // Emit a session/update notification bound to the active prompt's session.
  emit: (update: AcpSessionUpdate) => void;
  // Emit a session/update notification for an arbitrary session id (foreign-session test).
  emitForSession: (sessionId: string, update: AcpSessionUpdate) => void;
  sessionId: string;
}

type PromptScript = (api: PromptScriptApi) => AcpPromptResponse;

interface JsonRpcInbound {
  id?: number;
  method?: string;
  params?: { sessionId?: string };
}

// Scripted fake `agent acp` server: answers the handshake RPCs (initialize,
// session/new, session/set_mode, session/prompt) and, on a prompt, replays a
// caller-supplied session/update sequence mid-turn before settling the RPC.
class FakeAcpServer {
  readonly toClient = new Readable({ read() {} });
  readonly toAgent: Writable;
  private buffer = '';
  private readonly sessionId = 'S-fake-1';

  constructor(private readonly promptScript: PromptScript) {
    this.toAgent = new Writable({
      write: (chunk, _enc, cb) => {
        this.ingest(String(chunk));
        cb();
      },
    });
  }

  private ingest(text: string): void {
    this.buffer += text;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        this.handle(JSON.parse(line) as JsonRpcInbound);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private handle(message: JsonRpcInbound): void {
    const id = message.id;
    switch (message.method) {
      case 'initialize':
        this.respond(id, { protocolVersion: 1, agentCapabilities: { loadSession: true } });
        return;
      case 'session/new':
        this.respond(id, { sessionId: this.sessionId });
        return;
      case 'session/set_mode':
        this.respond(id, {});
        return;
      case 'session/set_config_option':
        this.respond(id, { configOptions: [] });
        return;
      case 'session/prompt': {
        const sessionId = message.params?.sessionId ?? this.sessionId;
        const response = this.promptScript({
          emit: (update) => this.notifyUpdate(sessionId, update),
          emitForSession: (foreignId, update) => this.notifyUpdate(foreignId, update),
          sessionId,
        });
        this.respond(id, response);
        return;
      }
      default:
        // Reject unknown candidates so AcpClientConnection.requestWithFallback
        // can fall through to the next method-name candidate rather than hang.
        if (id !== undefined) {
          this.error(id, -32601, `unknown method ${String(message.method)}`);
        }
    }
  }

  private notifyUpdate(sessionId: string, update: AcpSessionUpdate): void {
    this.push({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } });
  }

  private respond(id: number | undefined, result: unknown): void {
    if (id === undefined) {
      return;
    }
    this.push({ jsonrpc: '2.0', id, result });
  }

  private error(id: number, code: number, message: string): void {
    this.push({ jsonrpc: '2.0', id, error: { code, message } });
  }

  private push(payload: unknown): void {
    this.toClient.push(`${JSON.stringify(payload)}\n`);
  }
}

function makeRuntime(overrides: Record<string, unknown> = {}, host: RuntimeHost = createHeadlessRuntimeHost()): CursorChatRuntime {
  const plugin = {
    getResolvedProviderCliPath: () => '/bin/cursor-agent',
    getResolvedEnvironmentVariables: () => ({}),
    settings: { permissionMode: 'normal' },
    logger: { scope: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) },
    app: { vault: { adapter: { basePath: '/tmp/specorator-test-vault' } } },
    manifest: { version: '1.0.0' },
    ...overrides,
  };
  return new CursorChatRuntime(plugin as never, host);
}

interface RunOptions {
  permissionMode?: string;
  queryOptions?: Record<string, unknown>;
}

function setupRuntime(promptScript: PromptScript, options: RunOptions = {}): CursorChatRuntime {
  const server = new FakeAcpServer(promptScript);
  const transport = new AcpJsonRpcTransport({
    input: server.toClient,
    output: server.toAgent,
    onClose: () => () => {},
  });
  const process = {
    isAlive: () => true,
    getStderrSnapshot: () => '',
    shutdown: () => Promise.resolve(),
    onClose: () => () => {},
  };
  (cursorAcpLaunch.startCursorAcpProcess as jest.Mock).mockReturnValue({ process, transport });
  return makeRuntime({ settings: { permissionMode: options.permissionMode ?? 'normal' } });
}

async function drive(runtime: CursorChatRuntime, options: RunOptions = {}): Promise<StreamChunk[]> {
  const turn = { persistedContent: 'the question', prompt: 'do the thing', request: { images: [] } };
  const chunks: StreamChunk[] = [];
  for await (const chunk of runtime.query(turn as never, undefined, options.queryOptions as never)) {
    chunks.push(chunk);
  }
  return chunks;
}

async function runScenario(promptScript: PromptScript, options: RunOptions = {}): Promise<StreamChunk[]> {
  const runtime = setupRuntime(promptScript, options);
  try {
    return await drive(runtime, options);
  } finally {
    await runtime.cleanup();
  }
}

function textOf(chunks: StreamChunk[]): string {
  return chunks
    .filter((chunk): chunk is Extract<StreamChunk, { type: 'text' }> => chunk.type === 'text')
    .map((chunk) => chunk.content)
    .join('');
}

// The cursor provider isn't registered in the unit lane, so the settings-snapshot
// projection would throw; echo the raw bag so model resolution falls through to
// queryOptions/settings.model exactly as it does for the seam tests.
beforeEach(() => {
  jest.spyOn(ProviderSettingsCoordinator, 'getProviderSettingsSnapshot')
    .mockImplementation((settings) => settings as never);
});

afterEach(() => jest.restoreAllMocks());

describe('CursorChatRuntime ACP stream (scripted fake server over in-memory streams)', () => {
  it('emits exactly one synthetic boundary pair for a user+assistant turn, no duplicates', async () => {
    const chunks = await runScenario(({ emit }) => {
      emit({ sessionUpdate: 'user_message_chunk', messageId: 'u1', content: { type: 'text', text: 'the question' } });
      emit({ sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'Hello ' } });
      emit({ sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'world' } });
      return { stopReason: 'end_turn' };
    });

    // query() yields the single synthetic pair up front; the normalizer's own
    // boundary chunks (from the first message chunk of each role) are dropped by
    // handleSessionNotification, so the consumer never sees a duplicate frame.
    expect(chunks.filter((c) => c.type === 'user_message_start')).toHaveLength(1);
    expect(chunks.filter((c) => c.type === 'assistant_message_start')).toHaveLength(1);
    expect(textOf(chunks)).toBe('Hello world');
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
  });

  it('canonicalizes tool_call input and carries the diff through to the tool_result', async () => {
    const chunks = await runScenario(({ emit }) => {
      emit({
        sessionUpdate: 'tool_call',
        toolCallId: 'tc1',
        title: 'edit',
        kind: 'edit',
        status: 'pending',
        rawInput: { path: '/notes/a.md', oldString: 'foo', newString: 'bar' },
      });
      emit({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc1',
        status: 'completed',
        content: [{ type: 'diff', path: '/notes/a.md', oldText: 'foo', newText: 'bar' }],
      });
      return { stopReason: 'end_turn' };
    });

    const toolUse = chunks.find((c): c is Extract<StreamChunk, { type: 'tool_use' }> => c.type === 'tool_use');
    expect(toolUse?.name).toBe(TOOL_EDIT);
    // Cursor's raw `path`/`oldString`/`newString` are canonicalized to the shared
    // `file_path`/`old_string`/`new_string` shape the renderer reads.
    expect(toolUse?.input).toMatchObject({ file_path: '/notes/a.md', old_string: 'foo', new_string: 'bar' });
    expect(toolUse?.input).not.toHaveProperty('path');

    const toolResult = chunks.find((c): c is Extract<StreamChunk, { type: 'tool_result' }> => c.type === 'tool_result');
    expect(toolResult?.toolUseResult?.filePath).toBe('/notes/a.md');
    expect(toolResult?.toolUseResult?.unifiedDiff).toContain('-foo');
    expect(toolResult?.toolUseResult?.unifiedDiff).toContain('+bar');
  });

  it('propagates a later kind to a call first rendered under a prose title', async () => {
    // Initial tool_call carries a prose title and no kind, so it renders under
    // the prose name; the LATER update supplies the semantic `edit` kind plus
    // rawInput. The consumer's final view of the id must be the canonical Edit
    // name with canonicalized input, not the prose title.
    const chunks = await runScenario(({ emit }) => {
      emit({
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-kind',
        title: 'Applying changes',
        status: 'pending',
      });
      emit({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc-kind',
        kind: 'edit',
        status: 'in_progress',
        rawInput: { path: '/notes/a.md', oldString: 'foo', newString: 'bar' },
      });
      emit({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc-kind',
        status: 'completed',
        content: [{ type: 'diff', path: '/notes/a.md', oldText: 'foo', newText: 'bar' }],
      });
      return { stopReason: 'end_turn' };
    });

    const toolUses = chunks.filter(
      (c): c is Extract<StreamChunk, { type: 'tool_use' }> => c.type === 'tool_use' && c.id === 'tc-kind',
    );
    const finalToolUse = toolUses.at(-1);
    expect(finalToolUse?.name).toBe(TOOL_EDIT);
    expect(finalToolUse?.input).toMatchObject({ file_path: '/notes/a.md', old_string: 'foo', new_string: 'bar' });
  });

  it('threads the usage_update authoritative window into the final usage chunk', async () => {
    const chunks = await runScenario(({ emit }) => {
      emit({ sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'done' } });
      emit({ sessionUpdate: 'usage_update', size: 222_000, used: 4_096 });
      return { stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } };
    }, { queryOptions: { model: 'gpt-5' } });

    const usageChunks = chunks.filter((c): c is Extract<StreamChunk, { type: 'usage' }> => c.type === 'usage');
    expect(usageChunks.length).toBeGreaterThan(0);
    const finalUsage = usageChunks[usageChunks.length - 1].usage;
    expect(finalUsage.model).toBe('gpt-5');
    expect(finalUsage.contextWindow).toBe(222_000);
    expect(finalUsage.contextWindowIsAuthoritative).toBe(true);
  });

  it('ignores a session/update notification addressed to a different session', async () => {
    const chunks = await runScenario(({ emit, emitForSession }) => {
      emitForSession('SOME-OTHER-SESSION', {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'x1',
        content: { type: 'text', text: 'LEAK' },
      });
      emit({ sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'kept' } });
      return { stopReason: 'end_turn' };
    });

    expect(textOf(chunks)).toBe('kept');
    expect(textOf(chunks)).not.toContain('LEAK');
  });
});

describe('CursorChatRuntime extension emitChunk session guard', () => {
  async function drain(queue: AcpStreamChunkQueue): Promise<StreamChunk[]> {
    queue.close();
    const out: StreamChunk[] = [];
    let chunk = await queue.next();
    while (chunk !== null) {
      out.push(chunk);
      chunk = await queue.next();
    }
    return out;
  }

  it('drops an extension chunk naming a superseded session, keeps matching and absent ids', async () => {
    // Capture the extension host the runtime wires in startProcess so we can
    // exercise its emitChunk guard directly against a controlled active turn.
    const captured: { host?: CursorAcpExtensionHost } = {};
    jest.spyOn(cursorAcpExtensions, 'registerCursorAcpExtensions')
      .mockImplementation((_transport, host) => {
        captured.host = host;
        return () => {};
      });

    const runtime = setupRuntime(() => ({ stopReason: 'end_turn' }));
    await drive(runtime);
    expect(captured.host).toBeDefined();

    const bag = runtime as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S-current', usageModel: null };

    const host = captured.host!;
    // A blocking create_plan/update_todos that resolved against the PREVIOUS
    // turn names its old session — it must not land in this turn's queue.
    host.emitChunk({ type: 'text', content: 'stale' }, 'S-old');
    // Same-session and legacy (no session id) chunks are still delivered.
    host.emitChunk({ type: 'text', content: 'match' }, 'S-current');
    host.emitChunk({ type: 'text', content: 'legacy' });

    const seen = (await drain(queue))
      .filter((c): c is Extract<StreamChunk, { type: 'text' }> => c.type === 'text')
      .map((c) => c.content);
    expect(seen).toEqual(['match', 'legacy']);

    await runtime.cleanup();
  });
});

describe('CursorChatRuntime create_plan in-turn decision session guard', () => {
  async function captureHostAgainstTurn(sessionId: string): Promise<{
    host: CursorAcpExtensionHost;
    decidedInline: () => boolean;
    cleanup: () => Promise<void>;
  }> {
    const captured: { host?: CursorAcpExtensionHost } = {};
    jest.spyOn(cursorAcpExtensions, 'registerCursorAcpExtensions')
      .mockImplementation((_transport, host) => {
        captured.host = host;
        return () => {};
      });

    const runtime = setupRuntime(() => ({ stopReason: 'end_turn' }));
    await drive(runtime);
    expect(captured.host).toBeDefined();

    const bag = runtime as unknown as Record<string, unknown>;
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId, usageModel: null };
    // Start from a clean flag so the guard's effect is observable.
    bag.currentTurnPlanDecidedInline = false;

    return {
      host: captured.host!,
      decidedInline: () => bag.currentTurnPlanDecidedInline as boolean,
      cleanup: () => runtime.cleanup(),
    };
  }

  it('drops an in-turn plan decision naming a superseded session', async () => {
    const { host, decidedInline, cleanup } = await captureHostAgainstTurn('S-current');
    // A stale/cancelled create_plan resolves against the PREVIOUS turn and names
    // its old session — it must not suppress the current turn's plan card.
    host.markPlanDecidedInline('S-old');
    expect(decidedInline()).toBe(false);
    await cleanup();
  });

  it('records an in-turn plan decision matching the active session', async () => {
    const { host, decidedInline, cleanup } = await captureHostAgainstTurn('S-current');
    host.markPlanDecidedInline('S-current');
    expect(decidedInline()).toBe(true);
    await cleanup();
  });

  it('records an in-turn plan decision with no session id (legacy unconditional path)', async () => {
    const { host, decidedInline, cleanup } = await captureHostAgainstTurn('S-current');
    host.markPlanDecidedInline();
    expect(decidedInline()).toBe(true);
    await cleanup();
  });
});
