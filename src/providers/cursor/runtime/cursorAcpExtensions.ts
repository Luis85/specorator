import type { AskUserQuestionCallback, ChatTurnMetadata } from '../../../core/runtime/types';
import { TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { StreamChunk } from '../../../core/types';
import type { AcpJsonRpcTransport } from '../../acp';

export interface CursorAcpExtensionHost {
  askUser: AskUserQuestionCallback;
  // Signal for the in-flight turn's blocking ask_question await. When the turn
  // is canceled the runtime aborts it, so an otherwise-unbounded askUser await
  // unblocks and the RPC gets answered (dismissed) instead of hanging.
  getAskSignal?: () => AbortSignal | undefined;
  emitChunk: (chunk: StreamChunk) => void;
  patchTurnMetadata: (patch: Partial<ChatTurnMetadata>) => void;
}

interface CursorAskQuestionOption {
  label?: string;
  description?: string;
}

interface CursorAskQuestionEntry {
  id?: string;
  question?: string;
  header?: string;
  options?: CursorAskQuestionOption[];
  multiSelect?: boolean;
}

interface CursorAskQuestionParams {
  sessionId?: string;
  question?: string;
  header?: string;
  questions?: CursorAskQuestionEntry[];
  options?: CursorAskQuestionOption[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Builds the `AskUserQuestionCallback` input shape the rest of the app already
 * understands (`{ questions: [{ question, header, options, multiSelect }] }`),
 * matching `normalizeQuestionsArg` in `cursorToolInputMapping.ts` — the same
 * shape the stream-json `AskUserQuestion` tool_use carried. Reusing it means
 * the inline widget (`InlineAskUserQuestion`) and answer re-keying
 * (`resolveCursorAnswerLabels`) work unchanged for the ACP path.
 *
 * Malformed payloads (non-array `questions`, null entries, non-array
 * `options`) must degrade to an empty-but-valid shape rather than throw — a
 * throw here would otherwise escape as a JSON-RPC -32603 error to the agent
 * instead of the intended tolerant response.
 */
function buildAskUserInput(params: CursorAskQuestionParams): Record<string, unknown> {
  const rawEntries = Array.isArray(params.questions) && params.questions.length > 0
    ? params.questions
    : [{ question: params.question, header: params.header, options: params.options }];

  const entries = rawEntries.filter(
    (entry): entry is CursorAskQuestionEntry => Boolean(entry) && typeof entry === 'object',
  );

  return {
    questions: entries.map((entry, index) => ({
      ...(entry.id ? { id: entry.id } : {}),
      question: entry.question || `Question ${index + 1}`,
      header: entry.header || `Q${index + 1}`,
      options: (Array.isArray(entry.options) ? entry.options : []).map((option) => ({
        label: option?.label ?? '',
        description: option?.description ?? '',
      })),
      multiSelect: Boolean(entry.multiSelect),
    })),
  };
}

/**
 * Registers Cursor's ACP dialect extensions on top of the shared JSON-RPC
 * transport. `cursor/ask_question` and `cursor/create_plan` are BLOCKING
 * agent→client requests — the agent waits on the RPC response — which
 * replaces the retired stream-json auto-reject + resumed-follow-up-turn
 * delivery (ADR-0002) with an in-turn answer now that Cursor runs over ACP.
 * `cursor/update_todos` and `cursor/task` are one-way notifications.
 */
export function registerCursorAcpExtensions(
  transport: AcpJsonRpcTransport,
  host: CursorAcpExtensionHost,
): () => void {
  const unsubscribes: Array<() => void> = [];
  let todoCallCounter = 0;

  unsubscribes.push(transport.onRequest('cursor/ask_question', async (params) => {
    try {
      const parsed = (params ?? {}) as CursorAskQuestionParams;
      const askInput = buildAskUserInput(parsed);
      const signal = host.getAskSignal?.();

      let answers: Record<string, string | string[]> | null;
      try {
        answers = await host.askUser(askInput, signal);
      } catch (error) {
        // A cancel aborts the await: answer the RPC as a dismissal rather than
        // surfacing the AbortError as a turn failure, so the agent unblocks.
        if (isAbortError(error, signal)) {
          return { rejected: true, reason: 'Question dismissed by user' };
        }
        return { rejected: true, reason: `Failed to get user answers: ${errorMessage(error)}` };
      }

      if (!answers || Object.keys(answers).length === 0) {
        return { rejected: true, reason: 'Question dismissed by user' };
      }
      return { answers };
    } catch (error) {
      // Defensive backstop: buildAskUserInput is written to be tolerant of
      // malformed payloads, but any residual synchronous throw must still
      // resolve to a rejected shape rather than reject the RPC (-32603).
      return { rejected: true, reason: `Failed to get user answers: ${errorMessage(error)}` };
    }
  }));

  unsubscribes.push(transport.onRequest('cursor/create_plan', async (params) => {
    const parsed = (params ?? {}) as { plan?: string; content?: string; text?: string };
    const planText = parsed.plan ?? parsed.content ?? parsed.text ?? '';
    if (planText) {
      host.emitChunk({ type: 'text', content: `\n\n${planText}\n` });
    }
    host.patchTurnMetadata({ planCompleted: true });
    return {};
  }));

  unsubscribes.push(transport.onNotification('cursor/update_todos', (params) => {
    const parsed = (params ?? {}) as { todos?: unknown[] };
    const todos = parsed.todos ?? [];
    const id = `cursor-todos-${++todoCallCounter}`;
    host.emitChunk({ type: 'tool_use', id, name: TOOL_TODO_WRITE, input: { todos } });
    host.emitChunk({ type: 'tool_result', id, content: 'Todos updated', isError: false });
  }));

  // cursor/task carries live subagent lifecycle updates — deferred until the
  // ACP subagent lifecycle spec lands (see the Cursor native ACP migration spike).
  unsubscribes.push(transport.onNotification('cursor/task', () => {}));

  return () => {
    while (unsubscribes.length > 0) {
      unsubscribes.pop()?.();
    }
  };
}
