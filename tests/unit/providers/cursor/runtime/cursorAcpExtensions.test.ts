import { parseTodoInput } from '@/core/tools/todo';
import { TOOL_TODO_WRITE } from '@/core/tools/toolNames';
import type { StreamChunk } from '@/core/types';
import { registerCursorAcpExtensions } from '@/providers/cursor/runtime/cursorAcpExtensions';

type Handler = (params: unknown) => Promise<unknown>;

// Mirrors the documented cursor/ask_question outcome union
// (cursor.com/docs/cli/acp) so assertions read against the real shape.
type AskOutcome =
  | { outcome: 'answered'; answers: Array<{ questionId: string; selectedOptionIds: string[] }> }
  | { outcome: 'skipped'; reason?: string }
  | { outcome: 'cancelled' };
type AskResponse = { outcome: AskOutcome };

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
  it('answers cursor/ask_question with the documented answered outcome, mapping labels to option ids', async () => {
    const { transport, requests } = makeFakeTransport();
    // The inline widget keys its answer record by `id ?? question` (here the
    // documented id `q1`) with the selected LABEL as the value.
    const askUser = jest.fn().mockResolvedValue({ q1: 'B' });
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      toolCallId: 't1',
      title: 'Pick one',
      questions: [{
        id: 'q1',
        prompt: 'Pick one',
        options: [{ id: 'opt-a', label: 'A' }, { id: 'opt-b', label: 'B' }],
      }],
    }) as AskResponse;

    expect(askUser).toHaveBeenCalled();
    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'q1', selectedOptionIds: ['opt-b'] }],
    });
  });

  it('maps the full documented request shape (two questions, allowMultiple, ids != labels) end to end', async () => {
    const { transport, requests } = makeFakeTransport();
    let capturedInput: unknown;
    // Answer keyed by the documented question ids; multi-select question returns
    // a label array, single-select returns a scalar label.
    const askUser = jest.fn((input: unknown) => {
      capturedInput = input;
      return Promise.resolve({
        colors: ['Red', 'Blue'],
        size: 'Large',
      });
    });
    registerCursorAcpExtensions(transport as never, {
      askUser: askUser as never,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      toolCallId: 't2',
      title: 'Configure',
      questions: [
        {
          id: 'colors',
          prompt: 'Which colors?',
          allowMultiple: true,
          options: [
            { id: 'c-red', label: 'Red' },
            { id: 'c-green', label: 'Green' },
            { id: 'c-blue', label: 'Blue' },
          ],
        },
        {
          id: 'size',
          prompt: 'Which size?',
          options: [
            { id: 's-sm', label: 'Small' },
            { id: 's-lg', label: 'Large' },
          ],
        },
      ],
    }) as AskResponse;

    // The widget received the documented prompt as `question` and allowMultiple
    // as `multiSelect`, keyed by the documented ids.
    expect(capturedInput).toEqual({
      questions: [
        {
          id: 'colors',
          question: 'Which colors?',
          header: 'Configure',
          options: [
            { label: 'Red', description: '' },
            { label: 'Green', description: '' },
            { label: 'Blue', description: '' },
          ],
          multiSelect: true,
        },
        {
          id: 'size',
          question: 'Which size?',
          header: 'Configure',
          options: [
            { label: 'Small', description: '' },
            { label: 'Large', description: '' },
          ],
          multiSelect: false,
        },
      ],
    });

    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [
        { questionId: 'colors', selectedOptionIds: ['c-red', 'c-blue'] },
        { questionId: 'size', selectedOptionIds: ['s-lg'] },
      ],
    });
  });

  it('carries agent-supplied option descriptions through to the inline widget', async () => {
    const { transport, requests } = makeFakeTransport();
    let capturedInput: unknown;
    const askUser = jest.fn((input: unknown) => {
      capturedInput = input;
      return Promise.resolve({ q1: 'Refactor' });
    });
    registerCursorAcpExtensions(transport as never, {
      askUser: askUser as never,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    await requests.get('cursor/ask_question')!({
      questions: [{
        id: 'q1',
        prompt: 'How should we proceed?',
        options: [
          { id: 'a', label: 'Refactor', description: 'Rewrite the module in place' },
          { id: 'b', label: 'Patch' },
        ],
      }],
    });

    const input = capturedInput as { questions: Array<{ options: Array<{ label: string; description: string }> }> };
    expect(input.questions[0].options).toEqual([
      { label: 'Refactor', description: 'Rewrite the module in place' },
      { label: 'Patch', description: '' },
    ]);
  });

  it('falls back to the label as the id for free-form answers with no matching option', async () => {
    const { transport, requests } = makeFakeTransport();
    const askUser = jest.fn().mockResolvedValue({ q1: 'Something else' });
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      questions: [{ id: 'q1', prompt: 'Pick', options: [{ id: 'opt-a', label: 'A' }] }],
    }) as AskResponse;

    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'q1', selectedOptionIds: ['Something else'] }],
    });
  });

  it('returns the cancelled outcome when the user dismisses the question', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('answers the RPC as cancelled when the ask signal aborts mid-await', async () => {
    const { transport, requests } = makeFakeTransport();
    const controller = new AbortController();
    // askUser mirrors a blocking prompt that rejects with AbortError once the
    // provided signal aborts — the shape a cancel() abort produces at runtime.
    const askUser = jest.fn((_input: unknown, signal?: AbortSignal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    registerCursorAcpExtensions(transport as never, {
      askUser: askUser as never,
      getAskSignal: () => controller.signal,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const pending = requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as Promise<AskResponse>;
    controller.abort();
    const response = await pending;

    expect(askUser).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('accepts cursor/create_plan and marks the turn plan-completed with the plan text emitted', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const patches: Record<string, unknown>[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: (p) => patches.push(p),
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# The plan\n1. do it' });

    expect(chunks.some((c) => c.type === 'text' && c.content.includes('The plan'))).toBe(true);
    expect(patches).toContainEqual({ planCompleted: true });
    expect(response).toEqual({ outcome: { outcome: 'accepted' } });
  });

  it('accepts an empty cursor/create_plan without marking the turn plan-completed', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const patches: Record<string, unknown>[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: (p) => patches.push(p),
    });

    // Empty payload and empty plan text: no plan is visible, so planCompleted
    // must not open the post-plan approval card over a plan-less turn.
    const emptyPayload = await requests.get('cursor/create_plan')!({});
    const emptyPlan = await requests.get('cursor/create_plan')!({ plan: '' });

    expect(chunks).toHaveLength(0);
    expect(patches).toHaveLength(0);
    expect(emptyPayload).toEqual({ outcome: { outcome: 'accepted' } });
    expect(emptyPlan).toEqual({ outcome: { outcome: 'accepted' } });
  });

  it('forwards the create_plan sessionId to emitChunk for the runtime session guard', async () => {
    const { transport, requests } = makeFakeTransport();
    const emitted: Array<{ chunk: StreamChunk; sessionId?: string }> = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (chunk, sessionId) => emitted.push({ chunk, sessionId }),
      patchTurnMetadata: () => {},
    });

    await requests.get('cursor/create_plan')!({ sessionId: 'S-42', plan: '# Plan\n1. go' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].sessionId).toBe('S-42');
    expect(emitted[0].chunk.type).toBe('text');
  });

  it('forwards the update_todos sessionId to both emitted chunks', async () => {
    const { transport, notifications } = makeFakeTransport();
    const emitted: Array<{ chunk: StreamChunk; sessionId?: string }> = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (chunk, sessionId) => emitted.push({ chunk, sessionId }),
      patchTurnMetadata: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      sessionId: 'S-99',
      todos: [{ content: 'step 1', status: 'pending' }],
    });

    expect(emitted).toHaveLength(2);
    expect(emitted.every((e) => e.sessionId === 'S-99')).toBe(true);
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

  it('normalizes a documented cursor/update_todos payload so the shared panel accepts it', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: () => {},
    });

    // Documented cursor/update_todos shape per cursor.com/docs/cli/acp:
    // `{id, content, status}` — no `activeForm`, which parseTodoInput requires.
    await notifications.get('cursor/update_todos')!({
      todos: [
        { id: '1', content: 'step 1', status: 'pending' },
        { id: '2', content: 'step 2', status: 'in_progress' },
      ],
    });

    const toolUse = chunks.find((c) => c.type === 'tool_use') as
      | { name: string; input: Record<string, unknown> }
      | undefined;
    expect(toolUse?.name).toBe(TOOL_TODO_WRITE);

    const parsed = parseTodoInput(toolUse!.input);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual([
      { id: '1', content: 'step 1', status: 'pending', activeForm: 'step 1' },
      { id: '2', content: 'step 2', status: 'in_progress', activeForm: 'step 2' },
    ]);
  });

  it('tolerates malformed cursor/update_todos payloads without throwing', () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      patchTurnMetadata: () => {},
    });

    expect(() => {
      notifications.get('cursor/update_todos')!({
        todos: [null, 'oops', { status: 'pending' }, { content: '', status: 'pending' }],
      });
    }).not.toThrow();

    const toolUse = chunks.find((c) => c.type === 'tool_use') as
      | { name: string; input: Record<string, unknown> }
      | undefined;
    expect(toolUse?.name).toBe(TOOL_TODO_WRITE);
    expect(parseTodoInput(toolUse!.input)).toBeNull();

    expect(() => notifications.get('cursor/update_todos')!(undefined)).not.toThrow();
    expect(() => notifications.get('cursor/update_todos')!({ todos: 'not-an-array' })).not.toThrow();
  });

  it('resolves to the cancelled outcome (never rejects) when questions entries are null', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: [null] }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('resolves to the cancelled outcome (never rejects) when questions is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: 'oops' }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('resolves to the cancelled outcome (never rejects) when options is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: 'not-an-array' }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('returns the skipped outcome with the failure reason when askUser throws', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockRejectedValue(new Error('boom')),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as AskResponse;
    expect(response.outcome.outcome).toBe('skipped');
    const skipped = response.outcome as { outcome: 'skipped'; reason?: string };
    expect(skipped.reason).toContain('Failed to get user answers');
    expect(skipped.reason).toContain('boom');
  });

  it('tolerates the legacy question/options field aliases and maps them through', async () => {
    const { transport, requests } = makeFakeTransport();
    // Legacy per-question shape: `question` instead of `prompt`, `multiSelect`
    // instead of `allowMultiple`, and no option ids so labels echo back.
    const askUser = jest.fn().mockResolvedValue({ 'Legacy?': 'Yes' });
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      questions: [{ question: 'Legacy?', multiSelect: false, options: [{ label: 'Yes' }, { label: 'No' }] }],
    }) as AskResponse;

    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'Legacy?', selectedOptionIds: ['Yes'] }],
    });
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
