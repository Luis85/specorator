import { parseCursorSubagentType } from './cursorTaskPayload';
import { stringArray, stringValue } from './cursorToolValueCoercion';

/**
 * Maps a Cursor CLI tool call's raw `args` into Specorator's canonical tool
 * input shape, per tool kind. Pure projection lifted out of
 * `cursorToolNormalization` so the per-tool field mapping is isolated.
 */

type CursorInputMapper = (args: Record<string, unknown>, description: string | undefined) => Record<string, unknown>;

const mapWriteInput: CursorInputMapper = (args) => ({
  file_path: stringValue(args.path),
  content: stringValue(args.streamContent ?? args.content),
});

const mapFetchInput: CursorInputMapper = (args) => ({
  url: stringValue(args.url ?? args.target),
});

const mapTodosInput: CursorInputMapper = (args) => ({ todos: normalizeTodosArg(args) });

function mapShellInput(args: Record<string, unknown>, description: string | undefined): Record<string, unknown> {
  const command = stringValue(args.command);
  const cwd = stringValue(args.workingDirectory);
  const out: Record<string, unknown> = { command };
  if (cwd) out.cwd = cwd;
  if (description) out.description = description;
  return out;
}

function mapGlobInput(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    pattern: stringValue(args.globPattern ?? args.pattern),
  };
  const target = stringValue(args.targetDirectory ?? args.target_directory ?? args.path);
  if (target) out.path = target;
  return out;
}

function mapGrepInput(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    pattern: stringValue(args.pattern ?? args.query),
  };
  const target = stringValue(args.path ?? args.targetDirectory);
  if (target) out.path = target;
  if (args.outputMode) out.output_mode = stringValue(args.outputMode);
  if (args.glob) out.glob = stringValue(args.glob);
  if (args.caseInsensitive === true) out['-i'] = true;
  if (args.multiline === true) out.multiline = true;
  return out;
}

function mapWebSearchInput(args: Record<string, unknown>): Record<string, unknown> {
  const queries = stringArray(args.queries);
  const query = stringValue(args.query) || queries[0] || '';
  const out: Record<string, unknown> = {};
  if (query) out.query = query;
  if (queries.length > 0) out.queries = queries;
  return out;
}

function resolveTaskRunInBackground(args: Record<string, unknown>): boolean | undefined {
  if (typeof args.run_in_background === 'boolean') return args.run_in_background;
  if (typeof args.runInBackground === 'boolean') return args.runInBackground;
  const mode = stringValue(args.mode);
  if (mode === 'TASK_MODE_BACKGROUND') return true;
  if (mode === 'TASK_MODE_SYNCHRONOUS' || mode === 'TASK_MODE_SYNC') return false;
  return undefined;
}

function mapTaskInput(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    description: stringValue(args.description),
    prompt: stringValue(args.prompt ?? args.message ?? args.task),
  };
  const runInBackground = resolveTaskRunInBackground(args);
  if (runInBackground !== undefined) out.run_in_background = runInBackground;
  const subagent =
    parseCursorSubagentType(args.subagentType ?? args.subagent_type)
    ?? stringValue(args.subagent_type ?? args.subagentType ?? args.agent);
  if (subagent) out.subagent_type = subagent;
  return out;
}

function mapMcpInput(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  const server = stringValue(args.server);
  const tool = stringValue(args.tool ?? args.name);
  if (server) out.server = server;
  if (tool) out.tool = tool;
  return out;
}

const CURSOR_TOOL_INPUT_MAPPERS: Partial<Record<string, CursorInputMapper>> = {
  readToolCall: (args) => ({ file_path: stringValue(args.path) }),
  writeToolCall: mapWriteInput,
  editToolCall: mapWriteInput,
  replaceEnvToolCall: (args) => ({
    file_path: stringValue(args.path),
    old_string: stringValue(args.oldString ?? args.old_string),
    new_string: stringValue(args.newString ?? args.new_string),
  }),
  deleteToolCall: (args) => ({ path: stringValue(args.path) }),
  shellToolCall: mapShellInput,
  writeShellStdinToolCall: (args) => ({
    session_id: stringValue(args.sessionId ?? args.session_id),
    chars: stringValue(args.chars ?? args.text),
  }),
  globToolCall: mapGlobInput,
  grepToolCall: mapGrepInput,
  lsToolCall: (args) => ({ path: stringValue(args.path ?? args.targetDirectory) || '.' }),
  webFetchToolCall: mapFetchInput,
  fetchToolCall: mapFetchInput,
  webSearchToolCall: mapWebSearchInput,
  semSearchToolCall: (args) => ({ query: stringValue(args.query) }),
  updateTodosToolCall: mapTodosInput,
  readTodosToolCall: mapTodosInput,
  askQuestionToolCall: (args) => ({ questions: normalizeQuestionsArg(args) }),
  taskToolCall: mapTaskInput,
  mcpToolCall: mapMcpInput,
};

export function mapCursorToolInput(
  kind: string,
  args: Record<string, unknown>,
  description: string | undefined,
): Record<string, unknown> {
  const mapper = CURSOR_TOOL_INPUT_MAPPERS[kind];
  return mapper ? mapper(args, description) : { ...args };
}

function normalizeTodosArg(args: Record<string, unknown>): Array<Record<string, unknown>> {
  const source = Array.isArray(args.todos)
    ? args.todos
    : Array.isArray(args.plan)
      ? args.plan
      : [];

  const out: Array<Record<string, unknown>> = [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const text = stringValue(item.content ?? item.title ?? item.step ?? item.text);
    if (!text) continue;
    out.push({
      id: stringValue(item.id),
      content: text,
      activeForm: stringValue(item.activeForm) || text,
      status: stringValue(item.status) || 'pending',
    });
  }
  return out;
}

function normalizeQuestionsArg(args: Record<string, unknown>): Array<Record<string, unknown>> {
  const questions = args.questions;
  if (!Array.isArray(questions)) return [];

  const out: Array<Record<string, unknown>> = [];
  questions.forEach((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as Record<string, unknown>;
    const options: Array<{ label: string; description: string }> = [];
    if (Array.isArray(item.options)) {
      for (const option of item.options) {
        if (typeof option === 'string') {
          options.push({ label: option, description: '' });
          continue;
        }
        if (!option || typeof option !== 'object') continue;
        const raw = option as Record<string, unknown>;
        const label = stringValue(raw.label ?? raw.title);
        if (!label) continue;
        options.push({ label, description: stringValue(raw.description) });
      }
    }

    out.push({
      question: stringValue(item.question) || `Question ${index + 1}`,
      ...(item.id ? { id: stringValue(item.id) } : {}),
      header: stringValue(item.header) || `Q${index + 1}`,
      options,
      multiSelect: Boolean(item.multiSelect ?? item.multi_select),
    });
  });
  return out;
}
