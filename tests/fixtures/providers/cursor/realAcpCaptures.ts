// Real Cursor ACP wire captures, distilled to typed constants (captured
// 2026-07-12 and refreshed 2026-07-15 against `agent acp`). Every shape here was
// lifted verbatim from the
// on-the-wire JSON-RPC frames — model catalogs are trimmed to a representative
// subset and long plan bodies are truncated, but field names, nesting, and
// notable quirks (session/load returning no sessionId; cursor/task arriving as a
// blocking request; model ids carrying bracket variants incl. the empty `[]`)
// are preserved. Tests consume these instead of hand-written shapes so a
// regression in a mapper surfaces against ground truth.

import type {
  AcpLoadSessionResponse,
  AcpNewSessionResponse,
  AcpPlan,
  AcpRequestPermissionRequest,
  AcpToolCall,
  AcpToolCallUpdate,
} from '@/providers/acp/types';

// (a) Real `session/new` result. Models trimmed to ~6 representative entries
// including `default[]` (Auto), an empty-bracket variant (`gemini-3.1-pro[]`),
// and multi-axis bracket variants. `configOptions` mirrors the models/modes as
// category-tagged selects (the shape `extractAcpSessionModelState` actually
// reads, keyed off `category: "model"`).
export const CURSOR_NEW_SESSION_RESULT: AcpNewSessionResponse = {
  sessionId: '3c14db1e-2d3d-43ff-9b9f-622fb824c86d',
  modes: {
    currentModeId: 'agent',
    availableModes: [
      { id: 'agent', name: 'Agent', description: 'Full agent capabilities with tool access' },
      { id: 'plan', name: 'Plan', description: 'Read-only mode for planning and designing before implementation' },
      { id: 'ask', name: 'Ask', description: 'Q&A mode - no edits or command execution' },
    ],
  },
  models: {
    currentModelId: 'default[]',
    availableModels: [
      { modelId: 'default[]', name: 'Auto' },
      { modelId: 'composer-2.5[fast=true]', name: 'composer-2.5' },
      { modelId: 'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]', name: 'claude-opus-4-8' },
      { modelId: 'gpt-5.4[context=272k,reasoning=medium,fast=false]', name: 'gpt-5.4' },
      { modelId: 'claude-opus-4-5[thinking=true]', name: 'claude-opus-4-5' },
      { modelId: 'gemini-3.1-pro[]', name: 'gemini-3.1-pro' },
    ],
  },
  configOptions: [
    {
      id: 'mode',
      name: 'Mode',
      description: 'Controls how the agent executes tasks',
      category: 'mode',
      type: 'select',
      currentValue: 'agent',
      options: [
        { value: 'agent', name: 'Agent', description: 'Full agent capabilities with tool access' },
        { value: 'plan', name: 'Plan', description: 'Read-only mode for planning and designing before implementation' },
        { value: 'ask', name: 'Ask', description: 'Q&A mode - no edits or command execution' },
      ],
    },
    {
      id: 'model',
      name: 'Model',
      description: 'Controls which model variant is used for responses',
      category: 'model',
      type: 'select',
      currentValue: 'default[]',
      options: [
        { value: 'default[]', name: 'Auto' },
        { value: 'composer-2.5[fast=true]', name: 'composer-2.5' },
        { value: 'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]', name: 'claude-opus-4-8' },
        { value: 'gpt-5.4[context=272k,reasoning=medium,fast=false]', name: 'gpt-5.4' },
        { value: 'claude-opus-4-5[thinking=true]', name: 'claude-opus-4-5' },
        { value: 'gemini-3.1-pro[]', name: 'gemini-3.1-pro' },
      ],
    },
  ],
};

// The advertised model wire-value list a runtime derives from (a)'s model
// `configOptions` — the values `matchAdvertisedModelValue` matches selections
// against.
export const CURSOR_ADVERTISED_MODEL_VALUES: string[] =
  (CURSOR_NEW_SESSION_RESULT.models?.availableModels ?? [])
    .map((model) => model.modelId ?? model.id)
    .filter((value): value is string => typeof value === 'string');

// (b) Real `session/load` result — NOTE: no `sessionId`. The agent echoes only
// the session config; the loaded session keeps the id the caller requested.
export const CURSOR_LOAD_SESSION_RESULT: AcpLoadSessionResponse = {
  modes: { currentModeId: 'agent', availableModes: [] },
  models: { currentModelId: 'default[]', availableModels: [] },
  configOptions: [],
};

// (c) Real `cursor/task` request params. Arrives as a BLOCKING request (id 0),
// with empty description/prompt and an `unspecified` subagentType.
export interface CursorTaskRequestParams {
  toolCallId: string;
  description: string;
  prompt: string;
  subagentType: string;
}
export const CURSOR_TASK_REQUEST_PARAMS: CursorTaskRequestParams = {
  toolCallId: 'tool_ef673da0-8e2f-4749-9288-f6b50e2cea3',
  description: '',
  prompt: '',
  subagentType: 'unspecified',
};

// (d) Real `cursor/create_plan` request params. `plan` (the full markdown body)
// is truncated here; the surrounding envelope is verbatim.
export interface CursorCreatePlanParams {
  toolCallId: string;
  name: string;
  overview: string;
  plan: string;
  todos: Array<{ id: string; content: string; status: string }>;
  isProject: boolean;
  phases: unknown[];
}
export const CURSOR_CREATE_PLAN_PARAMS: CursorCreatePlanParams = {
  toolCallId: 'tool_3726bd8f-3ca4-4dd8-8a8c-3b81d8f687b',
  name: 'Reading Time Indicator',
  overview:
    'Add a muted "~N min read" badge to Library cards for vault markdown notes, computed at load time from note body text via a shared pure utility.',
  plan: '# Reading Time Indicator for Markdown Notes\n\n## Scope (assumed for v1)\n\nShow a reading-time badge on **Library list cards**. [truncated]',
  todos: [
    { id: 'util-reading-time', content: 'Add src/utils/readingTime.ts with strip/count/estimate + unit tests', status: 'pending' },
    { id: 'parse-wireup', content: 'Extend LoopDefinition + QuickAction with readingMinutes; compute in parse paths', status: 'pending' },
    { id: 'library-card-ui', content: 'Add readingMinutes prop + meta line to LibraryCard; wire Loops + Quick Actions panels', status: 'pending' },
  ],
  isProject: false,
  phases: [],
};

// (e) Real edit `tool_call` -> `tool_call_update` sequence. The initial call has
// an empty rawInput and pending status; the terminal update carries the diff.
export const CURSOR_EDIT_TOOL_CALL: AcpToolCall = {
  toolCallId: 'tool_c59e3c1c-0fca-4022-b3a2-7346b87ca8a',
  title: 'Edit File',
  kind: 'edit',
  status: 'pending',
  rawInput: {},
};
export const CURSOR_EDIT_TOOL_CALL_UPDATE: AcpToolCallUpdate = {
  toolCallId: 'tool_c59e3c1c-0fca-4022-b3a2-7346b87ca8a',
  status: 'completed',
  content: [
    {
      type: 'diff',
      path: 'C:\\Projects\\specorator\\acp-test\\notes.md',
      oldText: '-- /dev/null\n',
      newText:
        '++ b/C:\\Projects\\specorator\\acp-test\\notes.md\n# ACP Wire Test Notes\n\n- First checklist item\n- Second checklist item\n',
    },
  ],
};

// (f) Real `plan` session/update — entries carry content, priority, and status.
export const CURSOR_PLAN_SESSION_UPDATE: AcpPlan = {
  entries: [
    { content: 'Add src/utils/readingTime.ts with strip/count/estimate + unit tests', priority: 'medium', status: 'pending' },
    { content: 'Extend LoopDefinition + QuickAction with readingMinutes; compute in parse paths', priority: 'medium', status: 'pending' },
    { content: 'Add readingMinutes prop + meta line to LibraryCard; wire Loops + Quick Actions panels', priority: 'medium', status: 'pending' },
  ],
};

// (g) Real `session/request_permission` params for an edit (delete) tool call —
// three options: allow-once, allow-always, reject-once.
export const CURSOR_REQUEST_PERMISSION_PARAMS: AcpRequestPermissionRequest = {
  sessionId: '3c14db1e-2d3d-43ff-9b9f-622fb824c86d',
  toolCall: {
    toolCallId: 'tool_e202c8be-2d39-41d1-9d77-608626bf510',
    title: 'Delete `C:\\Projects\\specorator\\acp-test\\notes.md`',
    kind: 'edit',
    status: 'pending',
  },
  options: [
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ],
};
