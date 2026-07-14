import { isAgentLifecycleTool } from '../../../core/tools/toolNames';
import {
  TOOL_APPLY_PATCH,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_ENTER_PLAN_MODE,
  TOOL_EXIT_PLAN_MODE,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_LS,
  TOOL_READ,
  TOOL_SKILL,
  TOOL_TODO_WRITE,
  TOOL_TOOL_SEARCH,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  TOOL_WRITE,
  TOOL_WRITE_STDIN,
} from '../../../core/tools/toolNames';
import { extractToolResultContent } from '../../../core/tools/toolResultContent';
import {
  fileNameOnly,
  getAgentLifecycleSummary,
  getApplyPatchSummary,
  getInputText,
  getWebSearchSummary,
  getWriteStdinSummary,
  parseToolSearchQuery,
  truncateText,
} from './toolLabel';

export function getToolName(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case TOOL_TODO_WRITE: {
      const todos = input.todos as Array<{ status: string }> | undefined;
      if (todos && Array.isArray(todos) && todos.length > 0) {
        const completed = todos.filter(todo => todo.status === 'completed').length;
        return `Tasks ${completed}/${todos.length}`;
      }
      return 'Tasks';
    }
    case TOOL_ENTER_PLAN_MODE:
      return 'Entering plan mode';
    case TOOL_EXIT_PLAN_MODE:
      return 'Plan complete';
    default:
      return name;
  }
}

export function getToolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case TOOL_READ:
    case TOOL_WRITE:
    case TOOL_EDIT:
      return fileNameOnly(getInputText(input, 'file_path'));
    case TOOL_BASH:
      return truncateText(getInputText(input, 'command'), 60);
    case TOOL_GLOB:
    case TOOL_GREP:
      return getInputText(input, 'pattern');
    case TOOL_WEB_SEARCH:
      return getWebSearchSummary(input, 60);
    case TOOL_WEB_FETCH:
      return truncateText(getInputText(input, 'url'), 60);
    case TOOL_LS:
      return fileNameOnly(getInputText(input, 'path', '.'));
    case TOOL_SKILL:
      return getInputText(input, 'skill');
    case TOOL_TOOL_SEARCH:
      return truncateText(parseToolSearchQuery(getInputText(input, 'query')), 60);
    case TOOL_TODO_WRITE:
      return '';
    case TOOL_APPLY_PATCH:
      return getApplyPatchSummary(input);
    case TOOL_WRITE_STDIN:
      return getWriteStdinSummary(input);
    default:
      return isAgentLifecycleTool(name) ? getAgentLifecycleSummary(name, input) : '';
  }
}

export function isBlockedToolResult(content: unknown, isError?: boolean): boolean {
  const lower = extractToolResultContent(content, { fallbackIndent: 2 }).toLowerCase();
  if (lower.includes('outside the vault')) return true;
  if (lower.includes('access denied')) return true;
  if (lower.includes('user denied')) return true;
  if (lower.includes('approval')) return true;
  return Boolean(isError && lower.includes('deny'));
}

/** Shared Obsidian icon names for tool/subagent tool-call status pills. */
export const TOOL_CALL_STATUS_ICONS: Partial<Record<'completed' | 'error' | 'blocked' | 'running', string>> = {
  completed: 'check',
  error: 'x',
  blocked: 'shield-off',
};
