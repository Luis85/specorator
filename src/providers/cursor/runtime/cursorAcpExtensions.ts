import type { AskUserQuestionCallback, ChatTurnMetadata } from '../../../core/runtime/types';
import { TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { StreamChunk } from '../../../core/types';
import type { AcpJsonRpcTransport } from '../../acp';
import { mapCursorToolInput } from './cursorToolInputMapping';

export interface CursorAcpExtensionHost {
  askUser: AskUserQuestionCallback;
  // Signal for the in-flight turn's blocking ask_question await. When the turn
  // is canceled the runtime aborts it, so an otherwise-unbounded askUser await
  // unblocks and the RPC gets answered (cancelled) instead of hanging.
  getAskSignal?: () => AbortSignal | undefined;
  emitChunk: (chunk: StreamChunk) => void;
  patchTurnMetadata: (patch: Partial<ChatTurnMetadata>) => void;
}

// Documented cursor/ask_question option: `{ id, label }` per cursor.com/docs/cli/acp.
// `title` is a tolerated legacy alias for `label`; `description` is not part of the
// documented shape but is carried through harmlessly when present.
interface CursorAskQuestionOption {
  id?: string;
  label?: string;
  title?: string;
  description?: string;
}

// Documented cursor/ask_question question: `{ id, prompt, options[], allowMultiple? }`.
// `question`/`header`/`multiSelect` are tolerated legacy aliases for `prompt`/(none)/
// `allowMultiple` so an older payload shape still resolves rather than rejecting.
interface CursorAskQuestionEntry {
  id?: string;
  prompt?: string;
  question?: string;
  title?: string;
  header?: string;
  options?: unknown;
  allowMultiple?: boolean;
  multiSelect?: boolean;
}

interface CursorAskQuestionParams {
  toolCallId?: string;
  sessionId?: string;
  title?: string;
  header?: string;
  questions?: unknown;
  // Legacy single-question shape at the top level (tolerated, not documented).
  question?: string;
  options?: unknown;
}

// Normalized question carrying both the inline-UI projection fields and the
// documented id↔label option mapping the response needs. `key` is the identity
// the inline widget keys its answer record by (`id ?? prompt`) and is also the
// `questionId` echoed back in the answered outcome.
interface ParsedCursorOption {
  id?: string;
  label: string;
}

interface ParsedCursorQuestion {
  key: string;
  hasId: boolean;
  prompt: string;
  header: string;
  multiSelect: boolean;
  options: ParsedCursorOption[];
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

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return undefined;
}

function parseCursorOptions(raw: unknown): ParsedCursorOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ParsedCursorOption[] = [];
  for (const option of raw) {
    if (typeof option === 'string') {
      // Legacy bare-string option: the string is the label and there is no id.
      out.push({ label: option });
      continue;
    }
    if (!option || typeof option !== 'object') {
      continue;
    }
    const entry = option as CursorAskQuestionOption;
    out.push({
      id: typeof entry.id === 'string' && entry.id ? entry.id : undefined,
      label: firstString(entry.label, entry.title) ?? '',
    });
  }
  return out;
}

/**
 * Parses a `cursor/ask_question` payload into the normalized question list the
 * rest of the handler works from. Reads the documented fields
 * (`questions[].prompt`, `options[].id`/`.label`, `allowMultiple`) while
 * tolerating the legacy shapes (`question`/`options` at the top level,
 * `q.question`, `q.multiSelect`, bare-string options) and malformed inputs
 * (non-array `questions`/`options`, null/non-object entries) — a throw here
 * would otherwise escape as a JSON-RPC -32603 error to the agent instead of the
 * intended tolerant outcome union.
 */
function parseCursorQuestions(params: CursorAskQuestionParams): ParsedCursorQuestion[] {
  const rawEntries: unknown[] = Array.isArray(params.questions) && params.questions.length > 0
    ? params.questions
    : [{ prompt: params.question, options: params.options }];

  const entries = rawEntries.filter(
    (entry): entry is CursorAskQuestionEntry => Boolean(entry) && typeof entry === 'object',
  );

  const topTitle = firstString(params.title, params.header) ?? '';

  return entries.map((entry, index) => {
    const prompt = firstString(entry.prompt, entry.question) ?? `Question ${index + 1}`;
    const id = typeof entry.id === 'string' && entry.id ? entry.id : undefined;
    return {
      key: id ?? prompt,
      hasId: Boolean(id),
      prompt,
      header: firstString(entry.title, entry.header) ?? topTitle,
      multiSelect: Boolean(entry.allowMultiple ?? entry.multiSelect),
      options: parseCursorOptions(entry.options),
    };
  });
}

/**
 * Projects the parsed questions into the `AskUserQuestionCallback` input shape
 * the inline widget (`InlineAskUserQuestion`) consumes
 * (`{ questions: [{ id?, question, header, options, multiSelect }] }`) — the
 * same shape the stream-json `AskUserQuestion` tool_use carried, so the widget
 * and its answer keying (`q.id ?? q.question`) work unchanged on the ACP path.
 */
function buildAskUserInput(questions: ParsedCursorQuestion[]): Record<string, unknown> {
  return {
    questions: questions.map((question) => ({
      ...(question.hasId ? { id: question.key } : {}),
      question: question.prompt,
      header: question.header,
      options: question.options.map((option) => ({ label: option.label, description: '' })),
      multiSelect: question.multiSelect,
    })),
  };
}

/**
 * Maps the inline widget's answer record (`Record<questionKey, label | label[]>`,
 * where values are the selected option LABELS) back to the documented
 * `cursor/ask_question` answered outcome (`{ questionId, selectedOptionIds }[]`).
 * Each answered label is resolved to its option's documented `id`; a label with
 * no matching option id — a free-form "Other" answer, or an option Cursor sent
 * without an id — falls back to the label string itself as the id, since that is
 * the only stable identifier available to echo back.
 */
function buildAnsweredOutcome(
  questions: ParsedCursorQuestion[],
  answers: Record<string, string | string[]>,
): Array<{ questionId: string; selectedOptionIds: string[] }> {
  const out: Array<{ questionId: string; selectedOptionIds: string[] }> = [];
  for (const question of questions) {
    const raw = answers[question.key];
    if (raw === undefined) {
      continue;
    }
    const labels = Array.isArray(raw) ? raw : [raw];
    const idByLabel = new Map(question.options.map((option) => [option.label, option.id] as const));
    out.push({
      questionId: question.key,
      selectedOptionIds: labels.map((label) => idByLabel.get(label) ?? label),
    });
  }
  return out;
}

/**
 * Registers Cursor's ACP dialect extensions on top of the shared JSON-RPC
 * transport. `cursor/ask_question` and `cursor/create_plan` are BLOCKING
 * agent→client requests — the agent waits on the RPC response — which
 * replaces the retired stream-json auto-reject + resumed-follow-up-turn
 * delivery (ADR-0002) with an in-turn answer now that Cursor runs over ACP.
 * Both are answered with the documented outcome unions from
 * cursor.com/docs/cli/acp. `cursor/update_todos` and `cursor/task` are one-way
 * notifications.
 */
export function registerCursorAcpExtensions(
  transport: AcpJsonRpcTransport,
  host: CursorAcpExtensionHost,
): () => void {
  const unsubscribes: Array<() => void> = [];
  let todoCallCounter = 0;

  unsubscribes.push(transport.onRequest('cursor/ask_question', async (params) => {
    try {
      const questions = parseCursorQuestions(params ?? {});
      const askInput = buildAskUserInput(questions);
      const signal = host.getAskSignal?.();

      let answers: Record<string, string | string[]> | null;
      try {
        answers = await host.askUser(askInput, signal);
      } catch (error) {
        // A cancel aborts the await: the user chose nothing, so answer with the
        // documented `cancelled` outcome rather than surfacing the AbortError as
        // a turn failure, so the agent unblocks.
        if (isAbortError(error, signal)) {
          return { outcome: { outcome: 'cancelled' } };
        }
        // askUser itself failed — the question could not be presented/collected,
        // which the documented `skipped` outcome (with reason) describes.
        return {
          outcome: { outcome: 'skipped', reason: `Failed to get user answers: ${errorMessage(error)}` },
        };
      }

      if (!answers || Object.keys(answers).length === 0) {
        return { outcome: { outcome: 'cancelled' } };
      }
      const mapped = buildAnsweredOutcome(questions, answers);
      if (mapped.length === 0) {
        return { outcome: { outcome: 'cancelled' } };
      }
      return { outcome: { outcome: 'answered', answers: mapped } };
    } catch (error) {
      // Defensive backstop: parsing is written to tolerate malformed payloads,
      // but any residual synchronous throw must still resolve to a valid outcome
      // union rather than reject the RPC (-32603).
      return {
        outcome: { outcome: 'skipped', reason: `Failed to get user answers: ${errorMessage(error)}` },
      };
    }
  }));

  unsubscribes.push(transport.onRequest('cursor/create_plan', async (params) => {
    const parsed = (params ?? {}) as { plan?: string; content?: string; text?: string };
    const planText = parsed.plan ?? parsed.content ?? parsed.text ?? '';
    if (planText) {
      host.emitChunk({ type: 'text', content: `\n\n${planText}\n` });
    }
    host.patchTurnMetadata({ planCompleted: true });
    // Specorator's plan approval happens post-turn via the shared approval card
    // (planCompleted → InputController), not at the protocol level. So the
    // documented `accepted` outcome here purely lets the turn complete; the
    // user's real accept/reject decision gates the follow-up implement turn, not
    // this response.
    return { outcome: { outcome: 'accepted' } };
  }));

  unsubscribes.push(transport.onNotification('cursor/update_todos', (params) => {
    const parsed = (params ?? {}) as { todos?: unknown[] };
    // Route through the same Cursor todo coercion the stream-json tool-call path
    // uses: the documented `cursor/update_todos` payload (`{id, content, status}`)
    // lacks `activeForm`, which the shared todo panel's `parseTodoInput()`
    // requires, so raw todos silently fail validation and the panel never
    // updates. `mapCursorToolInput('updateTodosToolCall', ...)` derives
    // `activeForm` from `content` and defaults `status`.
    const input = mapCursorToolInput('updateTodosToolCall', { todos: parsed.todos ?? [] }, undefined);
    const id = `cursor-todos-${++todoCallCounter}`;
    host.emitChunk({ type: 'tool_use', id, name: TOOL_TODO_WRITE, input });
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
