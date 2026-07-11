import { TOOL_TODO_WRITE } from '@/core/tools/toolNames';
import type { StreamChunk } from '@/core/types';
import { registerCursorAcpExtensions } from '@/providers/cursor/runtime/cursorAcpExtensions';

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

  it('resolves with a rejected shape (never rejects) when questions entries are null', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: [null] }) as { rejected?: boolean };
    expect(response.rejected).toBe(true);
  });

  it('resolves with a rejected shape (never rejects) when questions is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ questions: 'oops' }) as { rejected?: boolean };
    expect(response.rejected).toBe(true);
  });

  it('resolves with a rejected shape (never rejects) when options is not an array', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockResolvedValue(null),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: 'not-an-array' }) as { rejected?: boolean };
    expect(response.rejected).toBe(true);
  });

  it('distinguishes a thrown askUser error from a plain dismissal in the reason text', async () => {
    const { transport, requests } = makeFakeTransport();
    registerCursorAcpExtensions(transport as never, {
      askUser: jest.fn().mockRejectedValue(new Error('boom')),
      emitChunk: () => {},
      patchTurnMetadata: () => {},
    });

    const response = await requests.get('cursor/ask_question')!({ question: 'Q', options: [] }) as { rejected?: boolean; reason?: string };
    expect(response.rejected).toBe(true);
    expect(response.reason).toContain('Failed to get user answers');
    expect(response.reason).toContain('boom');
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
