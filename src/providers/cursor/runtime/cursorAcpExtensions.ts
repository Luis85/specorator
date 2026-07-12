import type { AskUserQuestionCallback, ExitPlanModeCallback } from '../../../core/runtime/types';
import { TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { ExitPlanModeDecision, StreamChunk } from '../../../core/types';
import type { AcpJsonRpcTransport } from '../../acp';
import { mapCursorToolInput } from './cursorToolInputMapping';
import { stringValue } from './cursorToolValueCoercion';

export interface CursorAcpExtensionHost {
  askUser: AskUserQuestionCallback;
  // Plan-mode exit decision prompt. cursor/create_plan is a BLOCKING plan-
  // approval request (cursor.com/docs/cli/acp) that blocks on this the same
  // way ask_question blocks on askUser.
  exitPlanMode: ExitPlanModeCallback;
  // Per-turn abort signal shared by the blocking ask_question and create_plan
  // awaits, so a turn cancel unblocks them (cancelled) instead of hanging.
  getAskSignal?: () => AbortSignal | undefined;
  // `sessionId` is the requesting session when the emitting extension carries
  // one. The runtime drops a chunk whose session id no longer matches the
  // active turn, so a blocking request racing a turn boundary can't misroute.
  emitChunk: (chunk: StreamChunk, sessionId?: string) => void;
  // Signals that cursor/create_plan already settled the plan decision in-turn,
  // suppressing the post-turn planCompleted card. Session-guarded like emitChunk.
  markPlanDecidedInline: (sessionId?: string) => void;
  // True when `sessionId` still names the active turn. Guards the BLOCKING
  // create_plan and ask_question handlers so a stale request can't open a card
  // (and be answered against the wrong conversation). Absent id / unwired host
  // → active.
  isActiveSession?: (sessionId: string | undefined) => boolean;
  // Proactively stops the running turn. The `approve-new-session` plan decision
  // abandons this session for a fresh one; RuntimeHost's cancelRequested alone
  // never reaches the agent, so this hooks the runtime's own cancel().
  requestTurnCancel?: () => void;
}

// Documented cursor/ask_question option: `{ id, label }` per cursor.com/docs/cli/acp.
// `title` is a tolerated legacy alias for `label`; `description` is not part of the
// documented shape but is preserved so the inline widget can render it when present.
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
  description?: string;
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

type CursorCreatePlanOutcome =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; reason?: string }
  | { outcome: 'cancelled' };

/**
 * Maps the exit-plan-mode decision (or a turn-cancel abort) onto the documented
 * cursor/create_plan outcome union: approve -> accepted, approve-new-session ->
 * rejected (NOT approved for THIS session; settlePlanDecision also cancels the
 * turn), feedback -> rejected + reason, a dismissal (null, no abort) -> rejected,
 * and a turn cancel -> cancelled.
 */
function mapPlanDecisionToOutcome(
  decision: ExitPlanModeDecision | null,
  aborted: boolean,
): CursorCreatePlanOutcome {
  if (aborted) {
    return { outcome: 'cancelled' };
  }
  if (decision === null) {
    return { outcome: 'rejected' };
  }
  if (decision.type === 'feedback') {
    return { outcome: 'rejected', reason: decision.text };
  }
  if (decision.type === 'approve-new-session') {
    return { outcome: 'rejected', reason: 'Plan approved for a new session' };
  }
  return { outcome: 'accepted' };
}

// Maps the outcome BEFORE requestTurnCancel — cancel() aborts this same ask
// signal, which would otherwise flip approve-new-session's `rejected` to `cancelled`.
function settlePlanDecision(
  host: CursorAcpExtensionHost,
  decision: ExitPlanModeDecision | null,
  signal: AbortSignal | undefined,
): CursorCreatePlanOutcome {
  const outcome = mapPlanDecisionToOutcome(decision, signal?.aborted ?? false);
  if (decision?.type === 'approve-new-session') {
    host.requestTurnCancel?.();
  }
  return outcome;
}

/**
 * Blocks on the user's plan decision for a non-empty cursor/create_plan, racing
 * the per-turn cancel signal so a cancel resolves `cancelled`. `markPlanDecidedInline`
 * fires in every path (finally) to suppress the post-turn planCompleted card.
 */
async function resolveCreatePlanOutcome(
  host: CursorAcpExtensionHost,
  planText: string,
  sessionId: string | undefined,
): Promise<CursorCreatePlanOutcome> {
  host.emitChunk({ type: 'text', content: `\n\n${planText}\n` }, sessionId);
  const signal = host.getAskSignal?.();
  try {
    if (signal?.aborted) {
      return { outcome: 'cancelled' };
    }
    const decision = await host.exitPlanMode({ plan: planText }, signal);
    return settlePlanDecision(host, decision, signal);
  } catch (error) {
    if (isAbortError(error, signal)) {
      return { outcome: 'cancelled' };
    }
    return { outcome: 'rejected', reason: `Failed to get plan decision: ${errorMessage(error)}` };
  } finally {
    host.markPlanDecidedInline(sessionId);
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return error instanceof Error && error.name === 'AbortError';
}

// A turn already stopped, or the naming session is no longer active — mirrors
// create_plan's pre-checks (57b1746). ask_question must not open its card.
function isStaleAskRequest(host: CursorAcpExtensionHost, sessionId: string | undefined, signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted) || Boolean(host.isActiveSession && !host.isActiveSession(sessionId));
}

type NormalizedTodo = Record<string, unknown>;

function todoIdentity(todo: NormalizedTodo): { id: string; content: string } {
  return {
    id: typeof todo.id === 'string' ? todo.id : '',
    content: typeof todo.content === 'string' ? todo.content : '',
  };
}

// Folds a batch over the last emitted list (the panel is fully replaced from
// each chunk). Matches by `id`, falling back to content; unmatched items append.
function mergeCursorTodos(previous: NormalizedTodo[], incoming: NormalizedTodo[]): NormalizedTodo[] {
  const result = previous.map((todo) => ({ ...todo }));
  const indexById = new Map<string, number>();
  const indexByContent = new Map<string, number>();
  result.forEach((todo, index) => {
    const { id, content } = todoIdentity(todo);
    if (id) indexById.set(id, index);
    if (content) indexByContent.set(content, index);
  });

  for (const item of incoming) {
    const { id, content } = todoIdentity(item);
    let matchIndex: number | undefined;
    if (id) {
      matchIndex = indexById.get(id);
    } else if (content) {
      matchIndex = indexByContent.get(content);
    }
    if (matchIndex !== undefined) {
      result[matchIndex] = { ...item };
      continue;
    }
    const appendedIndex = result.push({ ...item }) - 1;
    if (id) indexById.set(id, appendedIndex);
    if (content) indexByContent.set(content, appendedIndex);
  }
  return result;
}

// Patches a cached todo from a RAW entry: status always wins when present;
// content/activeForm overwrite only when the entry carries content (so a
// status-only `{id, status}` patch keeps the cached content intact).
function patchTodoFromRaw(cached: NormalizedTodo, raw: Record<string, unknown>): NormalizedTodo {
  const patched: NormalizedTodo = { ...cached };
  const status = stringValue(raw.status);
  if (status) {
    patched.status = status;
  }
  const content = stringValue(raw.content ?? raw.title ?? raw.step ?? raw.text);
  if (content) {
    patched.content = content;
    patched.activeForm = stringValue(raw.activeForm) || content;
  }
  return patched;
}

// Merges a RAW batch over the cached list BEFORE the content-requiring
// normalizer, so a status-only `{id, status}` transition isn't dropped; only
// unmatched entries fall through to the normalizer/append merge below.
function mergeCursorTodosFromRaw(cached: NormalizedTodo[], rawIncoming: unknown[]): NormalizedTodo[] {
  const result = cached.map((todo) => ({ ...todo }));
  const indexById = new Map<string, number>();
  result.forEach((todo, index) => {
    const { id } = todoIdentity(todo);
    if (id) indexById.set(id, index);
  });

  const unmatchedRaw: unknown[] = [];
  for (const entry of rawIncoming) {
    if (!entry || typeof entry !== 'object') {
      unmatchedRaw.push(entry);
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const id = stringValue(raw.id);
    const matchIndex = id ? indexById.get(id) : undefined;
    if (matchIndex === undefined) {
      unmatchedRaw.push(entry);
      continue;
    }
    result[matchIndex] = patchTodoFromRaw(result[matchIndex], raw);
  }

  // Unmatched entries need content (the normalizer drops those without), then
  // fold in by id/content — new items append, content-matched items update.
  const normalizedUnmatched = (mapCursorToolInput('updateTodosToolCall', { todos: unmatchedRaw }, undefined)
    .todos as NormalizedTodo[] | undefined) ?? [];
  return mergeCursorTodos(result, normalizedUnmatched);
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
      description: firstString(entry.description),
    });
  }
  return out;
}

/**
 * Parses a `cursor/ask_question` payload into the normalized question list.
 * Reads the documented fields while tolerating legacy shapes and malformed
 * inputs (non-array `questions`/`options`, null entries) — a throw here would
 * escape as a JSON-RPC -32603 instead of the intended tolerant outcome union.
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
 * the inline widget (`InlineAskUserQuestion`) consumes — the same shape the
 * stream-json `AskUserQuestion` tool_use carried, so the widget and its answer
 * keying (`q.id ?? q.question`) work unchanged on the ACP path.
 */
function buildAskUserInput(questions: ParsedCursorQuestion[]): Record<string, unknown> {
  return {
    questions: questions.map((question) => ({
      ...(question.hasId ? { id: question.key } : {}),
      question: question.prompt,
      header: question.header,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description ?? '',
      })),
      multiSelect: question.multiSelect,
    })),
  };
}

/**
 * Maps the inline widget's answer record (LABELS) back to the documented
 * `cursor/ask_question` answered outcome. A label with no matching option id —
 * free-form "Other", or an id-less option — falls back to the label itself.
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

type CursorAskQuestionOutcome =
  | { outcome: 'answered'; answers: Array<{ questionId: string; selectedOptionIds: string[] }> }
  | { outcome: 'skipped'; reason?: string }
  | { outcome: 'cancelled' };

/**
 * Resolves a non-stale cursor/ask_question to its documented outcome: blocks
 * on `host.askUser`, mapping a cancel/abort or empty answer set to
 * `cancelled` and an askUser failure to `skipped` (with reason). Pulled out
 * of the request handler (mirrors resolveCreatePlanOutcome) to keep it small.
 */
async function resolveAskQuestionOutcome(
  host: CursorAcpExtensionHost,
  parsed: CursorAskQuestionParams,
  signal: AbortSignal | undefined,
): Promise<CursorAskQuestionOutcome> {
  const questions = parseCursorQuestions(parsed);
  const askInput = buildAskUserInput(questions);

  let answers: Record<string, string | string[]> | null;
  try {
    answers = await host.askUser(askInput, signal);
  } catch (error) {
    // A cancel aborts the await: the user chose nothing, so answer with the
    // documented `cancelled` outcome rather than surfacing the AbortError.
    if (isAbortError(error, signal)) {
      return { outcome: 'cancelled' };
    }
    // askUser itself failed — the question could not be presented/collected,
    // which the documented `skipped` outcome (with reason) describes.
    return { outcome: 'skipped', reason: `Failed to get user answers: ${errorMessage(error)}` };
  }

  if (!answers || Object.keys(answers).length === 0) {
    return { outcome: 'cancelled' };
  }
  const mapped = buildAnsweredOutcome(questions, answers);
  if (mapped.length === 0) {
    return { outcome: 'cancelled' };
  }
  return { outcome: 'answered', answers: mapped };
}

/**
 * Registers Cursor's ACP dialect extensions on the shared JSON-RPC transport.
 * `cursor/ask_question` and `cursor/create_plan` are BLOCKING agent→client
 * requests, answered in-turn with the documented outcome unions from
 * cursor.com/docs/cli/acp (replacing the retired stream-json auto-reject +
 * resumed-follow-up-turn delivery, ADR-0002). `cursor/update_todos`, `cursor/task`,
 * and `cursor/generate_image` also arrive as blocking requests (docs mislabel them
 * notifications) and are acked with their documented outcome unions; update_todos
 * is registered as both request and notification so either frame shape updates the
 * panel, while subagent lifecycle and in-chat image generation stay unsupported.
 */
export function registerCursorAcpExtensions(
  transport: AcpJsonRpcTransport,
  host: CursorAcpExtensionHost,
): () => void {
  const unsubscribes: Array<() => void> = [];
  let todoCallCounter = 0;
  // Last emitted normalized todo list per requesting session, keyed by
  // params.sessionId (a single '' slot covers payloads without one). Feeds the
  // merge path so an incremental `merge: true` batch rebuilds the full list the
  // StreamController replaces its panel from.
  const lastTodosBySession = new Map<string, NormalizedTodo[]>();

  unsubscribes.push(transport.onRequest('cursor/ask_question', async (params) => {
    const parsed = (params ?? {}) as CursorAskQuestionParams;
    const signal = host.getAskSignal?.();
    // Checked before building the ask input or calling askUser.
    if (isStaleAskRequest(host, parsed.sessionId, signal)) {
      return { outcome: { outcome: 'cancelled' } };
    }
    try {
      return { outcome: await resolveAskQuestionOutcome(host, parsed, signal) };
    } catch (error) {
      // Defensive backstop: parsing/resolution tolerates malformed payloads,
      // but any residual synchronous throw must still resolve to a valid
      // outcome union rather than reject the RPC (-32603).
      return {
        outcome: { outcome: 'skipped', reason: `Failed to get user answers: ${errorMessage(error)}` },
      };
    }
  }));

  unsubscribes.push(transport.onRequest('cursor/create_plan', async (params) => {
    const parsed = (params ?? {}) as { plan?: string; content?: string; text?: string; sessionId?: string };
    // A create_plan whose session is no longer the active turn must not open the
    // blocking plan card or emit anything — cancel BEFORE any emit/block. Absent
    // sessionId / unwired host → active, so existing unconditional paths hold.
    if (host.isActiveSession && !host.isActiveSession(parsed.sessionId)) {
      return { outcome: { outcome: 'cancelled' } };
    }
    const planText = parsed.plan ?? parsed.content ?? parsed.text ?? '';
    // An empty or unrecognized-key payload carries no plan to approve: emit
    // nothing and accept so the turn completes, matching the streamed empty-plan
    // gate (finalizePlanTurnMetadata) that never opens a card over a plan-less turn.
    if (!planText) {
      return { outcome: { outcome: 'accepted' } };
    }

    // cursor/create_plan is a BLOCKING plan-APPROVAL request (cursor.com/docs/cli/acp):
    // the agent waits on this response before it may implement. resolveCreatePlanOutcome
    // blocks on the exit-plan-mode prompt and settles the decision in-turn (calling
    // markPlanDecidedInline so the post-turn card doesn't double-prompt). Plan turns
    // that plan via plain assistant text without create_plan fall through to
    // finalizePlanTurnMetadata's gated finalize.
    return { outcome: await resolveCreatePlanOutcome(host, planText, parsed.sessionId) };
  }));

  // Merges an incoming batch into the cached list and emits the TodoWrite
  // chunk pair, returning the raw accepted todos for the request outcome.
  // `merge: true` carries only changed items; the StreamController replaces its
  // whole panel from each chunk, so a bare list would drop unlisted todos. The
  // merge path works from RAW entries so a status-only `{id, status}` (no
  // `content`) still lands — the normalizer drops content-less entries — while
  // the full-replace path routes through the normalizer for `activeForm`/status.
  const applyTodoUpdate = (params: unknown): unknown[] => {
    const parsed = (params ?? {}) as { todos?: unknown[]; sessionId?: string; merge?: boolean };
    const rawTodos = parsed.todos ?? [];
    const cacheKey = parsed.sessionId ?? '';
    const todos = parsed.merge === true
      ? mergeCursorTodosFromRaw(lastTodosBySession.get(cacheKey) ?? [], rawTodos)
      : (mapCursorToolInput('updateTodosToolCall', { todos: rawTodos }, undefined)
        .todos as NormalizedTodo[] | undefined) ?? [];
    lastTodosBySession.set(cacheKey, todos);
    const id = `cursor-todos-${++todoCallCounter}`;
    host.emitChunk({ type: 'tool_use', id, name: TOOL_TODO_WRITE, input: { todos } }, parsed.sessionId);
    host.emitChunk({ type: 'tool_result', id, content: 'Todos updated', isError: false }, parsed.sessionId);
    return rawTodos;
  };

  // cursor/update_todos arrives as a BLOCKING request (id present) on the real
  // wire despite the docs' "notification" label — the same trap as cursor/task.
  // An unregistered request -32601s and the panel never updates in agent mode;
  // handle both frame shapes, echoing the documented `accepted` outcome.
  unsubscribes.push(transport.onRequest('cursor/update_todos', async (params) => ({
    outcome: { outcome: 'accepted', todos: applyTodoUpdate(params) },
  })));
  unsubscribes.push(transport.onNotification('cursor/update_todos', (params) => {
    applyTodoUpdate(params);
  }));

  // cursor/task is a BLOCKING request (real captures 2026-07-12); ack with the
  // documented CursorTaskResponse union, not a bare `{}` (undocumented leniency).
  // Subagent lifecycle stays deferred, so every task just acks 'completed'.
  unsubscribes.push(transport.onRequest('cursor/task', async () => ({ outcome: { outcome: 'completed' } })));

  // cursor/generate_image: labeled a notification but also documents a response
  // schema — the same contradiction cursor/task had — and is unregistered, so a
  // request-shaped arrival would -32601-stall the agent. Reject defensively.
  unsubscribes.push(transport.onRequest('cursor/generate_image', async () => ({
    outcome: { outcome: 'rejected', reason: 'Image generation is not supported by this client' },
  })));

  return () => {
    lastTodosBySession.clear();
    while (unsubscribes.length > 0) {
      unsubscribes.pop()?.();
    }
  };
}
