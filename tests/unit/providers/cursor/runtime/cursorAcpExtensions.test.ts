import { parseTodoInput } from '@/core/tools/todo';
import { TOOL_TODO_WRITE } from '@/core/tools/toolNames';
import type { StreamChunk } from '@/core/types';
import { registerCursorAcpExtensions } from '@/providers/cursor/runtime/cursorAcpExtensions';

import {
  CURSOR_CREATE_PLAN_PARAMS,
  CURSOR_TASK_REQUEST_PARAMS,
} from '../../../../fixtures/providers/cursor/realAcpCaptures';

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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('short-circuits to cancelled when the ask signal is already aborted, without calling askUser', async () => {
    const { transport, requests } = makeFakeTransport();
    const controller = new AbortController();
    controller.abort();
    const askUser = jest.fn().mockResolvedValue({ q1: 'A' });
    registerCursorAcpExtensions(transport as never, {
      askUser,
      getAskSignal: () => controller.signal,
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as AskResponse;

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
    expect(askUser).not.toHaveBeenCalled();
  });

  it('short-circuits to cancelled for a stale session, without calling askUser', async () => {
    const { transport, requests } = makeFakeTransport();
    const askUser = jest.fn().mockResolvedValue({ q1: 'A' });
    // The turn has rolled over: S-old is no longer the active session.
    const isActiveSession = jest.fn((sessionId?: string) => sessionId === undefined || sessionId === 'S-current');
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
      isActiveSession: isActiveSession as never,
    });

    const response = await requests.get('cursor/ask_question')!({
      sessionId: 'S-old',
      question: 'Q',
      options: [],
    }) as AskResponse;

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
    expect(askUser).not.toHaveBeenCalled();
  });

  it('still blocks on askUser for the active session even when isActiveSession is wired', async () => {
    const { transport, requests } = makeFakeTransport();
    const askUser = jest.fn().mockResolvedValue({ q1: 'A' });
    const isActiveSession = jest.fn((sessionId?: string) => sessionId === undefined || sessionId === 'S-current');
    registerCursorAcpExtensions(transport as never, {
      askUser,
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
      isActiveSession: isActiveSession as never,
    });

    const response = await requests.get('cursor/ask_question')!({
      sessionId: 'S-current',
      questions: [{ id: 'q1', prompt: 'Pick', options: [{ id: 'opt-a', label: 'A' }] }],
    }) as AskResponse;

    expect(askUser).toHaveBeenCalled();
    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'] }],
    });
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const pending = requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as Promise<AskResponse>;
    controller.abort();
    const response = await pending;

    expect(askUser).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('blocks cursor/create_plan on the plan decision and accepts on approve, emitting the plan text', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const exitPlanMode = jest.fn().mockResolvedValue({ type: 'approve' });
    const markPlanDecidedInline = jest.fn();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: (c) => chunks.push(c),
      markPlanDecidedInline,
    });

    // Real captured cursor/create_plan envelope (extra fields — name, overview,
    // todos, isProject, phases — are tolerated; only `plan` drives the card).
    const response = await requests.get('cursor/create_plan')!(CURSOR_CREATE_PLAN_PARAMS);

    expect(chunks.some((c) => c.type === 'text' && c.content.includes('Reading Time Indicator'))).toBe(true);
    // The plan approval blocks in-turn (not on the post-turn card), so the RPC
    // resolves accepted only after the user approves, and the runtime is told to
    // suppress the post-turn planCompleted card.
    expect(exitPlanMode).toHaveBeenCalled();
    expect(markPlanDecidedInline).toHaveBeenCalled();
    expect(response).toEqual({ outcome: { outcome: 'accepted' } });
  });

  it('rejects cursor/create_plan with the feedback text when the user asks to keep planning', async () => {
    const { transport, requests } = makeFakeTransport();
    const exitPlanMode = jest.fn().mockResolvedValue({ type: 'feedback', text: 'tighten step 3' });
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: () => {},
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });

    expect(response).toEqual({ outcome: { outcome: 'rejected', reason: 'tighten step 3' } });
  });

  it('rejects cursor/create_plan and cancels the turn on approve-new-session', async () => {
    const { transport, requests } = makeFakeTransport();
    // The user approved the plan but for a FRESH session — the agent must not
    // implement it in this (abandoned) session.
    const exitPlanMode = jest.fn().mockResolvedValue({
      type: 'approve-new-session',
      planContent: 'Implement this plan:\n\n# Plan\n1. go',
    });
    const requestTurnCancel = jest.fn();
    const markPlanDecidedInline = jest.fn();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: () => {},
      markPlanDecidedInline,
      requestTurnCancel,
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });

    // rejected (NOT accepted) so the agent stops implementing here, plus an
    // explicit turn cancel — cancelRequested alone never reaches the agent.
    expect(response).toEqual({ outcome: { outcome: 'rejected', reason: 'Plan approved for a new session' } });
    expect(requestTurnCancel).toHaveBeenCalledTimes(1);
    expect(markPlanDecidedInline).toHaveBeenCalled();
  });

  it('still reports `rejected` on approve-new-session when requestTurnCancel aborts the shared ask signal', async () => {
    // Mirrors the real runtime wiring: getAskSignal returns the per-turn
    // askQuestionAbortController's signal, and requestTurnCancel -> cancel()
    // aborts that SAME controller. Mapping the outcome after the abort would
    // flip the intended `rejected` to `cancelled`.
    const { transport, requests } = makeFakeTransport();
    const controller = new AbortController();
    const exitPlanMode = jest.fn().mockResolvedValue({ type: 'approve-new-session' });
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: () => {},
      markPlanDecidedInline: () => {},
      getAskSignal: () => controller.signal,
      requestTurnCancel: () => controller.abort(),
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });

    expect(response).toEqual({ outcome: { outcome: 'rejected', reason: 'Plan approved for a new session' } });
    expect(controller.signal.aborted).toBe(true);
  });

  it('does not cancel the turn for an approve (current session) decision', async () => {
    const { transport, requests } = makeFakeTransport();
    const exitPlanMode = jest.fn().mockResolvedValue({ type: 'approve' });
    const requestTurnCancel = jest.fn();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: () => {},
      markPlanDecidedInline: () => {},
      requestTurnCancel,
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });

    expect(response).toEqual({ outcome: { outcome: 'accepted' } });
    expect(requestTurnCancel).not.toHaveBeenCalled();
  });

  it('rejects cursor/create_plan when the user dismisses the plan card without deciding', async () => {
    const { transport, requests } = makeFakeTransport();
    // A null decision with no abort is a deliberate dismissal (Escape).
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: async () => null,
      emitChunk: () => {},
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });

    expect(response).toEqual({ outcome: { outcome: 'rejected' } });
  });

  it('answers cursor/create_plan as cancelled when the turn signal aborts mid-decision', async () => {
    const { transport, requests } = makeFakeTransport();
    const controller = new AbortController();
    // exitPlanMode mirrors the inline card: it resolves null once its signal
    // aborts (the shape a turn cancel produces at runtime).
    const exitPlanMode = jest.fn((_input: unknown, signal?: AbortSignal) => new Promise((resolve) => {
      signal?.addEventListener('abort', () => resolve(null));
    }));
    const markPlanDecidedInline = jest.fn();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      getAskSignal: () => controller.signal,
      emitChunk: () => {},
      markPlanDecidedInline,
    });

    const pending = requests.get('cursor/create_plan')!({ plan: '# Plan\n1. go' });
    controller.abort();
    const response = await pending;

    expect(response).toEqual({ outcome: { outcome: 'cancelled' } });
    expect(markPlanDecidedInline).toHaveBeenCalled();
  });

  it('accepts an empty cursor/create_plan without blocking on a plan decision', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const exitPlanMode = jest.fn();
    const markPlanDecidedInline = jest.fn();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: (c) => chunks.push(c),
      markPlanDecidedInline,
    });

    // Empty payload and empty plan text: no plan is visible, so there is nothing
    // to approve — accept so the turn completes without prompting.
    const emptyPayload = await requests.get('cursor/create_plan')!({});
    const emptyPlan = await requests.get('cursor/create_plan')!({ plan: '' });

    expect(chunks).toHaveLength(0);
    expect(exitPlanMode).not.toHaveBeenCalled();
    expect(markPlanDecidedInline).not.toHaveBeenCalled();
    expect(emptyPayload).toEqual({ outcome: { outcome: 'accepted' } });
    expect(emptyPlan).toEqual({ outcome: { outcome: 'accepted' } });
  });

  it('cancels a create_plan naming a stale session without opening the plan card', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const exitPlanMode = jest.fn();
    const markPlanDecidedInline = jest.fn();
    // The turn has rolled over: S-old is no longer the active session.
    const isActiveSession = jest.fn((sessionId?: string) => sessionId === undefined || sessionId === 'S-current');
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: (c) => chunks.push(c),
      markPlanDecidedInline,
      isActiveSession: isActiveSession as never,
    });

    const response = await requests.get('cursor/create_plan')!({ sessionId: 'S-old', plan: '# Plan\n1. go' });

    // Short-circuited BEFORE any emit or block: no UI, no chunk, no metadata.
    expect(response).toEqual({ outcome: { outcome: 'cancelled' } });
    expect(exitPlanMode).not.toHaveBeenCalled();
    expect(markPlanDecidedInline).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(0);
  });

  it('blocks a create_plan naming the active session even when isActiveSession is wired', async () => {
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    const exitPlanMode = jest.fn().mockResolvedValue({ type: 'approve' });
    const isActiveSession = jest.fn((sessionId?: string) => sessionId === undefined || sessionId === 'S-current');
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      exitPlanMode: exitPlanMode as never,
      emitChunk: (c) => chunks.push(c),
      markPlanDecidedInline: () => {},
      isActiveSession: isActiveSession as never,
    });

    const response = await requests.get('cursor/create_plan')!({ sessionId: 'S-current', plan: '# Plan\n1. go' });

    expect(exitPlanMode).toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'text' && c.content.includes('Plan'))).toBe(true);
    expect(response).toEqual({ outcome: { outcome: 'accepted' } });
  });

  it('forwards the create_plan sessionId to emitChunk for the runtime session guard', async () => {
    const { transport, requests } = makeFakeTransport();
    const emitted: Array<{ chunk: StreamChunk; sessionId?: string }> = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (chunk, sessionId) => emitted.push({ chunk, sessionId }),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      sessionId: 'S-99',
      todos: [{ content: 'step 1', status: 'pending' }],
    });

    expect(emitted).toHaveLength(2);
    expect(emitted.every((e) => e.sessionId === 'S-99')).toBe(true);
  });

  it('answers the blocking cursor/update_todos REQUEST with the documented accepted outcome and still emits chunks', async () => {
    // Real captures 2026-07-12: cursor/update_todos arrives as a REQUEST (id
    // present), not a notification — an unregistered request -32601s and the
    // panel never updates in agent mode.
    const { transport, requests } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const handler = requests.get('cursor/update_todos');
    expect(handler).toBeDefined();
    const rawTodos = [{ id: '1', content: 'step 1', status: 'in_progress' }];
    const response = await handler!({ toolCallId: 't1', todos: rawTodos, merge: true }) as {
      outcome: { outcome: string; todos?: unknown };
    };

    expect(response.outcome.outcome).toBe('accepted');
    expect(response.outcome.todos).toEqual(rawTodos);
    expect(chunks.find((c) => c.type === 'tool_use')).toBeDefined();
    expect(chunks.find((c) => c.type === 'tool_result')).toBeDefined();
  });

  it('maps cursor/update_todos to a TodoWrite tool chunk', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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

  it('replaces the todo list when merge is false/absent', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '1', content: 'a', status: 'pending' }, { id: '2', content: 'b', status: 'pending' }],
    });
    // Second full update (no merge flag) fully replaces the panel.
    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '3', content: 'c', status: 'pending' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos.map((t) => t.content)).toEqual(['c']);
  });

  it('merges an incremental update over the previous list, keeping unlisted items', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [
        { id: '1', content: 'step 1', status: 'pending' },
        { id: '2', content: 'step 2', status: 'pending' },
      ],
    });
    // merge with only the changed item — step 2 must survive.
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [{ id: '1', content: 'step 1', status: 'completed' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string; status: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos).toEqual([
      { id: '1', content: 'step 1', activeForm: 'step 1', status: 'completed' },
      { id: '2', content: 'step 2', activeForm: 'step 2', status: 'pending' },
    ]);
  });

  it('appends a new item on an incremental merge update', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '1', content: 'step 1', status: 'pending' }],
    });
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [{ id: '2', content: 'step 2', status: 'in_progress' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos.map((t) => `${t.id}:${t.content}`)).toEqual([
      '1:step 1',
      '2:step 2',
    ]);
  });

  it('matches by content when the merged item carries no id', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ content: 'step 1', status: 'pending' }, { content: 'step 2', status: 'pending' }],
    });
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [{ content: 'step 1', status: 'completed' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ content: string; status: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos).toEqual([
      { id: '', content: 'step 1', activeForm: 'step 1', status: 'completed' },
      { id: '', content: 'step 2', activeForm: 'step 2', status: 'pending' },
    ]);
  });

  it('degrades a malformed merge payload without throwing', () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    // Seed a valid list, then merge a malformed batch.
    notifications.get('cursor/update_todos')!({ todos: [{ id: '1', content: 'step 1', status: 'pending' }] });
    expect(() => {
      notifications.get('cursor/update_todos')!({ merge: true, todos: [null, 'oops', { status: 'pending' }] });
    }).not.toThrow();

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ content: string }> } }
      | undefined;
    // The malformed entries coerce to nothing, so the seeded item survives.
    expect(lastToolUse!.input.todos.map((t) => t.content)).toEqual(['step 1']);
  });

  it('transitions a cached item from a status-only merge entry that carries no content', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '1', content: 'step 1', status: 'pending' }],
    });
    // Documented incremental shape: only the id + new status, no content. The
    // content-requiring normalizer would drop this before the merge saw it, so
    // the transition would silently vanish — the raw id-match path preserves it.
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [{ id: '1', status: 'completed' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string; status: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos).toEqual([
      { id: '1', content: 'step 1', activeForm: 'step 1', status: 'completed' },
    ]);
  });

  it('applies a status-only patch and appends a new full item in one merge batch', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '1', content: 'step 1', status: 'pending' }],
    });
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [
        { id: '1', status: 'completed' },
        { id: '2', content: 'step 2', status: 'in_progress' },
      ],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string; status: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos).toEqual([
      { id: '1', content: 'step 1', activeForm: 'step 1', status: 'completed' },
      { id: '2', content: 'step 2', activeForm: 'step 2', status: 'in_progress' },
    ]);
  });

  it('drops an unmatched status-only merge entry (no cached id) harmlessly', async () => {
    const { transport, notifications } = makeFakeTransport();
    const chunks: StreamChunk[] = [];
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: (c) => chunks.push(c),
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    await notifications.get('cursor/update_todos')!({
      todos: [{ id: '1', content: 'step 1', status: 'pending' }],
    });
    // The id matches nothing cached and there is no content for the normalizer to
    // build a full todo from, so the entry is dropped and the panel stays intact.
    await notifications.get('cursor/update_todos')!({
      merge: true,
      todos: [{ id: '99', status: 'completed' }],
    });

    const lastToolUse = [...chunks].reverse().find((c) => c.type === 'tool_use') as
      | { input: { todos: Array<{ id: string; content: string; status: string }> } }
      | undefined;
    expect(lastToolUse!.input.todos).toEqual([
      { id: '1', content: 'step 1', activeForm: 'step 1', status: 'pending' },
    ]);
  });

  it('resolves to the cancelled outcome (never rejects) when questions entries are null', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: [null] }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('resolves to the cancelled outcome (never rejects) when questions is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: 'oops' }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('resolves to the cancelled outcome (never rejects) when options is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: 'not-an-array' }) as AskResponse;
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('returns the skipped outcome with the failure reason when askUser throws', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockRejectedValue(new Error('boom')),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
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
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({
      questions: [{ question: 'Legacy?', multiSelect: false, options: [{ label: 'Yes' }, { label: 'No' }] }],
    }) as AskResponse;

    expect(response.outcome).toEqual({
      outcome: 'answered',
      answers: [{ questionId: 'Legacy?', selectedOptionIds: ['Yes'] }],
    });
  });

  it('answers the blocking cursor/task request with the documented completed outcome (never rejects)', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    // Real captured shape: cursor/task arrives as a REQUEST, not a notification.
    // Ack with the documented CursorTaskResponse outcome union (cursor.com/docs/cli/acp)
    // rather than a bare `{}`, which relied on undocumented parser leniency. Subagent
    // lifecycle stays deferred, so every task just acks 'completed'.
    const handler = requests.get('cursor/task');
    expect(handler).toBeDefined();
    await expect(handler!(CURSOR_TASK_REQUEST_PARAMS)).resolves.toEqual({
      outcome: { outcome: 'completed' },
    });
  });

  it('answers the cursor/generate_image request with a rejected outcome (never rejects the RPC)', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });

    // Documented as a notification, but the doc also carries a response schema —
    // the same label/schema contradiction cursor/task had. Registered defensively
    // as a request handler so a request-shaped arrival resolves instead of
    // -32601-stalling the agent.
    const handler = requests.get('cursor/generate_image');
    expect(handler).toBeDefined();
    await expect(handler!({ toolCallId: 'tool_gen_1', prompt: 'a cat' })).resolves.toEqual({
      outcome: {
        outcome: 'rejected',
        reason: 'Image generation is not supported by this client',
      },
    });
  });

  it('returns an unsubscribe that removes every handler', () => {
    const { transport, requests, notifications } = makeFakeTransport();
    const unregister = registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn(),
      emitChunk: () => {},
      exitPlanMode: async () => null,
      markPlanDecidedInline: () => {},
    });
    unregister();
    expect(requests.size).toBe(0);
    expect(notifications.size).toBe(0);
  });
});
