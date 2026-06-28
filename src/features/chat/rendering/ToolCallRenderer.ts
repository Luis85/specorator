import { type App,setIcon } from 'obsidian';

import type { TodoItem } from '../../../core/tools/todo';
import { getToolIcon, MCP_ICON_MARKER } from '../../../core/tools/toolIcons';
import {
  isAgentLifecycleTool,
  TOOL_APPLY_PATCH,
  TOOL_ASK_USER_QUESTION,
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
import type { ToolCallInfo } from '../../../core/types';
import type { DiffStats } from '../../../core/types/diff';
import { appendMcpIcon } from '../../../shared/icons';
import { parseApplyPatchDiffs, parseFileUpdateChangeDiffs } from '../../../utils/diff';
import { decorateVaultFileLink } from '../../../utils/fileLink';
import {
  isApplyPatchErrorResult,
  renderApplyPatchChangeList,
  renderApplyPatchResultFallback,
} from './applyPatchExpandedHelpers';
import {
  renderAskUserQuestionFallback,
  renderAskUserQuestionResult,
} from './askUserQuestionRenderer';
import { setupCollapsible } from './collapsible';
import { contentFallback } from './contentFallback';
import { renderDiffContent, renderDiffStats } from './DiffRenderer';
import { renderTodoItems } from './todoUtils';
import {
  fileNameOnly,
  getAgentLifecycleSummary,
  getApplyPatchSummary,
  getInputText,
  getToolLabel,
  getWebSearchSummary,
  getWriteStdinSummary,
  parseToolSearchQuery,
  truncateText,
} from './toolLabel';
import { renderLinesExpanded } from './toolLinesExpanded';
import { renderWebSearchExpanded } from './webSearchRenderer';

// Re-exported so existing consumers (e.g. WriteEditRenderer, SubagentRenderer, tests)
// keep importing these from here after the label logic moved to ./toolLabel.
export { fileNameOnly, getToolLabel };

export function setToolIcon(el: HTMLElement, name: string): void {
  const icon = getToolIcon(name);
  if (icon === MCP_ICON_MARKER) {
    appendMcpIcon(el);
  } else {
    setIcon(el, icon);
  }
}

export function getToolName(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case TOOL_TODO_WRITE: {
      const todos = input.todos as Array<{ status: string }> | undefined;
      if (todos && Array.isArray(todos) && todos.length > 0) {
        const completed = todos.filter(t => t.status === 'completed').length;
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
    case TOOL_EDIT: {
      const filePath = getInputText(input, 'file_path');
      return fileNameOnly(filePath);
    }
    case TOOL_BASH: {
      const cmd = getInputText(input, 'command');
      return truncateText(cmd, 60);
    }
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
      if (isAgentLifecycleTool(name)) {
        return getAgentLifecycleSummary(name, input);
      }
      return '';
  }
}

function isFileSearchHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  return /^Found \d+ files?:/i.test(trimmed) || /^\d+ matches across/i.test(trimmed);
}

function renderFileSearchExpanded(app: App, container: HTMLElement, result: string): void {
  const lines = result.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    container.createDiv({ cls: 'specorator-tool-empty', text: 'No matches found' });
    return;
  }

  const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
  for (const line of lines) {
    const stripped = line.replace(/^\s*\d+→/, '').trim();
    const lineEl = linesEl.createDiv({ cls: 'specorator-tool-line' });
    if (!isFileSearchHeaderLine(stripped)) {
      lineEl.addClass('hoverable');
      lineEl.setText(stripped || ' ');
      decorateVaultFileLink(app, lineEl, stripped);
    } else {
      lineEl.setText(stripped || ' ');
    }
  }
}

function renderToolSearchExpanded(container: HTMLElement, result: string): void {
  let toolNames: string[] = [];
  try {
    const parsed = JSON.parse(result) as Array<{ type: string; tool_name: string }>;
    if (Array.isArray(parsed)) {
      toolNames = parsed
        .filter(item => item.type === 'tool_reference' && item.tool_name)
        .map(item => item.tool_name);
    }
  } catch {
    // Fall back to showing raw result
  }

  if (toolNames.length === 0) {
    renderLinesExpanded(container, result, 20);
    return;
  }

  for (const name of toolNames) {
    const lineEl = container.createDiv({ cls: 'specorator-tool-search-item' });
    const iconEl = lineEl.createSpan({ cls: 'specorator-tool-search-icon' });
    setToolIcon(iconEl, name);
    lineEl.createSpan({ text: name });
  }
}

function renderWebFetchExpanded(container: HTMLElement, result: string): void {
  const maxChars = 500;
  const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
  const lineEl = linesEl.createDiv({ cls: 'specorator-tool-line specorator-tool-line-wrap' });

  if (result.length > maxChars) {
    lineEl.setText(result.slice(0, maxChars));
    linesEl.createDiv({
      cls: 'specorator-tool-truncated',
      text: `... ${result.length - maxChars} more characters`,
    });
  } else {
    lineEl.setText(result);
  }
}

function renderApplyPatchExpanded(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string | undefined,
): void {
  const patchText = typeof input.patch === 'string' ? input.patch : '';
  const parsedDiffs = getApplyPatchFileDiffs(input);

  if (isApplyPatchErrorResult(result)) {
    renderLinesExpanded(container, result as string, 20);
  }

  if (parsedDiffs.length > 0) {
    renderApplyPatchDiffSections(container, parsedDiffs);
    return;
  }

  if (renderApplyPatchChangeList(container, input.changes)) return;

  if (patchText) {
    renderLinesExpanded(container, patchText, 80);
    return;
  }

  renderApplyPatchResultFallback(container, result, (text, max) =>
    renderLinesExpanded(container, text, max),
  );
}

function renderApplyPatchDiffSections(
  container: HTMLElement,
  fileDiffs: ReturnType<typeof parseApplyPatchDiffs>,
): void {
  for (const fileDiff of fileDiffs) {
    const sectionEl = container.createDiv({ cls: 'specorator-tool-patch-section' });

    if (fileDiff.operation === 'delete' && fileDiff.diffLines.length === 0) {
      sectionEl.createDiv({ cls: 'specorator-tool-empty', text: 'File deleted' });
      continue;
    }

    if (fileDiff.diffLines.length === 0) {
      sectionEl.createDiv({ cls: 'specorator-tool-empty', text: 'No textual diff available' });
      continue;
    }

    const diffRow = sectionEl.createDiv({ cls: 'specorator-write-edit-diff-row' });
    const diffEl = diffRow.createDiv({ cls: 'specorator-write-edit-diff' });
    renderDiffContent(diffEl, fileDiff.diffLines);
  }
}

function getApplyPatchFileDiffs(input: Record<string, unknown>): ReturnType<typeof parseApplyPatchDiffs> {
  const patchText = typeof input.patch === 'string' ? input.patch : '';
  const parsedDiffs = patchText ? parseApplyPatchDiffs(patchText) : [];
  return parsedDiffs.length > 0 ? parsedDiffs : parseFileUpdateChangeDiffs(input.changes);
}

function getApplyPatchDiffStats(input: Record<string, unknown>): DiffStats | undefined {
  const fileDiffs = getApplyPatchFileDiffs(input);
  if (fileDiffs.length === 0) return undefined;

  const stats = fileDiffs.reduce<DiffStats>(
    (acc, fileDiff) => ({
      added: acc.added + fileDiff.stats.added,
      removed: acc.removed + fileDiff.stats.removed,
    }),
    { added: 0, removed: 0 }
  );

  return stats.added > 0 || stats.removed > 0 ? stats : undefined;
}

function getDiffStatsAriaLabel(stats: DiffStats): string {
  return `Changes: +${stats.added} -${stats.removed}`;
}

function renderAgentLifecycleExpanded(container: HTMLElement, result: string): void {
  // Try to parse as JSON for structured display
  const trimmed = result.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
      for (const [key, value] of Object.entries(parsed)) {
        const lineEl = linesEl.createDiv({ cls: 'specorator-tool-line' });
        const displayValue = formatToolDisplayValue(value);
        lineEl.setText(`${key}: ${displayValue}`);
      }
      return;
    } catch { /* fall through to plain text */ }
  }
  renderLinesExpanded(container, result, 20);
}

function formatToolDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}

export function renderExpandedContent(
  app: App,
  container: HTMLElement,
  toolName: string,
  result: string | undefined,
  input: Record<string, unknown> = {},
): void {
  if (!result && toolName !== TOOL_WEB_SEARCH && toolName !== TOOL_BASH && toolName !== TOOL_APPLY_PATCH) {
    container.createDiv({ cls: 'specorator-tool-empty', text: 'No result' });
    return;
  }

  const resolvedResult = result ?? '';

  if (isAgentLifecycleTool(toolName)) {
    renderAgentLifecycleExpanded(container, resolvedResult);
    return;
  }

  switch (toolName) {
    case TOOL_BASH:
      renderBashContent(container, input, resolvedResult);
      break;
    case TOOL_WRITE_STDIN:
      renderLinesExpanded(container, resolvedResult, 20);
      break;
    case TOOL_READ:
      renderLinesExpanded(container, resolvedResult, 15);
      break;
    case TOOL_GLOB:
    case TOOL_GREP:
    case TOOL_LS:
      renderFileSearchExpanded(app, container, resolvedResult);
      break;
    case TOOL_WEB_SEARCH:
      renderWebSearchExpanded(container, input, result);
      break;
    case TOOL_WEB_FETCH:
      renderWebFetchExpanded(container, resolvedResult);
      break;
    case TOOL_TOOL_SEARCH:
      renderToolSearchExpanded(container, resolvedResult);
      break;
    case TOOL_APPLY_PATCH:
      renderApplyPatchExpanded(container, input, result);
      break;
    default:
      renderLinesExpanded(container, resolvedResult, 20);
      break;
  }
}

function getTodos(input: Record<string, unknown>): TodoItem[] | undefined {
  const todos = input.todos;
  if (!todos || !Array.isArray(todos)) return undefined;
  return todos as TodoItem[];
}

function getCurrentTask(input: Record<string, unknown>): TodoItem | undefined {
  const todos = getTodos(input);
  if (!todos) return undefined;
  return todos.find(t => t.status === 'in_progress');
}

function areAllTodosCompleted(input: Record<string, unknown>): boolean {
  const todos = getTodos(input);
  if (!todos || todos.length === 0) return false;
  return todos.every(t => t.status === 'completed');
}

function resetStatusElement(statusEl: HTMLElement, statusClass: string, ariaLabel: string): void {
  statusEl.className = 'specorator-tool-status';
  statusEl.empty();
  statusEl.addClass(statusClass);
  statusEl.setAttribute('aria-label', ariaLabel);
}

const STATUS_ICONS: Record<string, string> = {
  completed: 'check',
  error: 'x',
  blocked: 'shield-off',
};

function setTodoWriteStatus(statusEl: HTMLElement, input: Record<string, unknown>): void {
  const isComplete = areAllTodosCompleted(input);
  const status = isComplete ? 'completed' : 'running';
  const ariaLabel = isComplete ? 'Status: completed' : 'Status: in progress';
  resetStatusElement(statusEl, `status-${status}`, ariaLabel);
  if (isComplete) setIcon(statusEl, 'check');
}

function setToolStatus(statusEl: HTMLElement, status: ToolCallInfo['status']): void {
  resetStatusElement(statusEl, `status-${status}`, `Status: ${status}`);
  const icon = STATUS_ICONS[status];
  if (icon) setIcon(statusEl, icon);
}

function setApplyPatchHeaderRight(statusEl: HTMLElement, toolCall: ToolCallInfo): void {
  const isError = toolCall.status === 'error' || toolCall.status === 'blocked';
  const stats = isError ? undefined : getApplyPatchDiffStats(toolCall.input);
  if (!stats) {
    setToolStatus(statusEl, toolCall.status);
    return;
  }

  statusEl.className = 'specorator-tool-status specorator-write-edit-stats';
  statusEl.empty();
  statusEl.setAttribute('aria-label', getDiffStatsAriaLabel(stats));
  renderDiffStats(statusEl, stats);
}

function setGenericToolHeaderRight(statusEl: HTMLElement, toolCall: ToolCallInfo): void {
  if (toolCall.name === TOOL_APPLY_PATCH) {
    setApplyPatchHeaderRight(statusEl, toolCall);
    return;
  }

  setToolStatus(statusEl, toolCall.status);
}

export function renderTodoWriteResult(
  container: HTMLElement,
  input: Record<string, unknown>
): void {
  container.empty();
  container.addClass('specorator-todo-panel-content');
  container.addClass('specorator-todo-list-container');

  const todos = input.todos as TodoItem[] | undefined;
  if (!todos || !Array.isArray(todos)) {
    const item = container.createSpan({ cls: 'specorator-tool-result-item' });
    item.setText('Tasks updated');
    return;
  }

  renderTodoItems(container, todos);
}

export function isBlockedToolResult(content: unknown, isError?: boolean): boolean {
  const lower = extractToolResultContent(content, { fallbackIndent: 2 }).toLowerCase();
  if (lower.includes('outside the vault')) return true;
  if (lower.includes('access denied')) return true;
  if (lower.includes('user denied')) return true;
  if (lower.includes('approval')) return true;
  if (isError && lower.includes('deny')) return true;
  return false;
}

interface ToolElementStructure {
  toolEl: HTMLElement;
  header: HTMLElement;
  iconEl: HTMLElement;
  nameEl: HTMLElement;
  summaryEl: HTMLElement;
  statusEl: HTMLElement;
  content: HTMLElement;
  currentTaskEl: HTMLElement | null;
}

export function decorateToolSummaryPath(
  app: App,
  summaryEl: HTMLElement,
  toolName: string,
  input: Record<string, unknown>,
): void {
  switch (toolName) {
    case TOOL_READ:
    case TOOL_WRITE:
    case TOOL_EDIT: {
      const filePath = getInputText(input, 'file_path');
      if (filePath) {
        decorateVaultFileLink(app, summaryEl, filePath);
      }
      break;
    }
    case TOOL_LS: {
      const path = getInputText(input, 'path', '.');
      if (path && path !== '.') {
        decorateVaultFileLink(app, summaryEl, path);
      }
      break;
    }
    default:
      break;
  }
}

function createToolElementStructure(
  app: App,
  parentEl: HTMLElement,
  toolCall: ToolCallInfo,
): ToolElementStructure {
  const toolEl = parentEl.createDiv({ cls: 'specorator-tool-call' });
  if (toolCall.name === TOOL_BASH) {
    toolEl.addClass('specorator-tool-call-bash');
  }

  const header = toolEl.createDiv({ cls: 'specorator-tool-header' });
  header.setAttribute('tabindex', '0');
  header.setAttribute('role', 'button');

  const iconEl = header.createSpan({ cls: 'specorator-tool-icon' });
  iconEl.setAttribute('aria-hidden', 'true');
  setToolIcon(iconEl, toolCall.name);

  const nameEl = header.createSpan({ cls: 'specorator-tool-name' });
  nameEl.setText(getToolName(toolCall.name, toolCall.input));

  const summaryEl = header.createSpan({ cls: 'specorator-tool-summary' });
  summaryEl.setText(getToolSummary(toolCall.name, toolCall.input));
  decorateToolSummaryPath(app, summaryEl, toolCall.name, toolCall.input);

  const currentTaskEl = toolCall.name === TOOL_TODO_WRITE
    ? createCurrentTaskPreview(header, toolCall.input)
    : null;

  const statusEl = header.createSpan({ cls: 'specorator-tool-status' });

  const content = toolEl.createDiv({ cls: 'specorator-tool-content' });

  return { toolEl, header, iconEl, nameEl, summaryEl, statusEl, content, currentTaskEl };
}

function renderBashContent(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string,
  initialText?: string,
): void {
  const command = (input.command as string) || '';
  if (command) {
    const cmdEl = container.createDiv({ cls: 'specorator-tool-bash-command' });
    cmdEl.setText(`$ ${command}`);
  }
  if (initialText) {
    contentFallback(container, initialText);
  } else if (result) {
    renderLinesExpanded(container, result, 20);
  } else {
    container.createDiv({ cls: 'specorator-tool-empty', text: 'No result' });
  }
}

function createCurrentTaskPreview(
  header: HTMLElement,
  input: Record<string, unknown>
): HTMLElement {
  const currentTaskEl = header.createSpan({ cls: 'specorator-tool-current' });
  const currentTask = getCurrentTask(input);
  if (currentTask) {
    currentTaskEl.setText(currentTask.activeForm);
  }
  return currentTaskEl;
}

function createTodoToggleHandler(
  currentTaskEl: HTMLElement | null,
  statusEl: HTMLElement | null,
  onExpandChange?: (expanded: boolean) => void
): (expanded: boolean) => void {
  return (expanded: boolean) => {
    if (onExpandChange) onExpandChange(expanded);
    if (currentTaskEl) {
      currentTaskEl.toggleClass('specorator-hidden', expanded);
    }
    if (statusEl) {
      statusEl.toggleClass('specorator-hidden', expanded);
    }
  };
}

function renderToolContent(
  app: App,
  content: HTMLElement,
  toolCall: ToolCallInfo,
  initialText?: string,
): void {
  if (toolCall.name === TOOL_TODO_WRITE) {
    content.addClass('specorator-tool-content-todo');
    renderTodoWriteResult(content, toolCall.input);
  } else if (toolCall.name === TOOL_ASK_USER_QUESTION) {
    content.addClass('specorator-tool-content-ask');
    if (initialText) {
      renderAskUserQuestionFallback(content, toolCall, 'Waiting for answer...');
    } else if (!renderAskUserQuestionResult(content, toolCall)) {
      renderAskUserQuestionFallback(content, toolCall);
    }
  } else if (toolCall.name === TOOL_BASH) {
    renderBashContent(content, toolCall.input, toolCall.result ?? '', initialText);
  } else if (initialText) {
    contentFallback(content, initialText);
  } else {
    renderExpandedContent(app, content, toolCall.name, toolCall.result, toolCall.input);
  }
}

export function renderToolCall(
  app: App,
  parentEl: HTMLElement,
  toolCall: ToolCallInfo,
  toolCallElements: Map<string, HTMLElement>,
): HTMLElement {
  const { toolEl, header, statusEl, content, currentTaskEl } =
    createToolElementStructure(app, parentEl, toolCall);

  toolEl.dataset.toolId = toolCall.id;
  toolCallElements.set(toolCall.id, toolEl);

  setGenericToolHeaderRight(statusEl, toolCall);

  renderToolContent(app, content, toolCall, 'Running...');

  const state = { isExpanded: false };
  toolCall.isExpanded = false;
  const todoStatusEl = toolCall.name === TOOL_TODO_WRITE ? statusEl : null;
  setupCollapsible(toolEl, header, content, state, {
    initiallyExpanded: false,
    onToggle: createTodoToggleHandler(currentTaskEl, todoStatusEl, (expanded) => {
      toolCall.isExpanded = expanded;
    }),
    baseAriaLabel: getToolLabel(toolCall.name, toolCall.input)
  });

  return toolEl;
}

export function updateToolCallResult(
  app: App,
  toolId: string,
  toolCall: ToolCallInfo,
  toolCallElements: Map<string, HTMLElement>,
) {
  const toolEl = toolCallElements.get(toolId);
  if (!toolEl) return;

  if (toolCall.name === TOOL_TODO_WRITE) {
    const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
    if (statusEl) {
      setTodoWriteStatus(statusEl, toolCall.input);
    }
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    if (content) {
      renderTodoWriteResult(content, toolCall.input);
    }
    const nameEl = toolEl.querySelector('.specorator-tool-name') as HTMLElement;
    if (nameEl) {
      nameEl.setText(getToolName(toolCall.name, toolCall.input));
    }
    const currentTaskEl = toolEl.querySelector('.specorator-tool-current') as HTMLElement;
    if (currentTaskEl) {
      const currentTask = getCurrentTask(toolCall.input);
      currentTaskEl.setText(currentTask ? currentTask.activeForm : '');
    }
    return;
  }

  const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
  if (statusEl) {
    setGenericToolHeaderRight(statusEl, toolCall);
  }

  if (toolCall.name === TOOL_ASK_USER_QUESTION) {
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    if (content) {
      content.addClass('specorator-tool-content-ask');
      if (!renderAskUserQuestionResult(content, toolCall)) {
        renderAskUserQuestionFallback(content, toolCall);
      }
    }
    return;
  }

  const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
  if (content) {
    content.empty();
    renderExpandedContent(app, content, toolCall.name, toolCall.result, toolCall.input);
  }
}

/** For stored (non-streaming) tool calls — collapsed by default. */
export function renderStoredToolCall(
  app: App,
  parentEl: HTMLElement,
  toolCall: ToolCallInfo,
): HTMLElement {
  const { toolEl, header, statusEl, content, currentTaskEl } =
    createToolElementStructure(app, parentEl, toolCall);

  if (toolCall.name === TOOL_TODO_WRITE) {
    setTodoWriteStatus(statusEl, toolCall.input);
  } else {
    setGenericToolHeaderRight(statusEl, toolCall);
  }

  renderToolContent(app, content, toolCall);

  const state = { isExpanded: false };
  const todoStatusEl = toolCall.name === TOOL_TODO_WRITE ? statusEl : null;
  setupCollapsible(toolEl, header, content, state, {
    initiallyExpanded: false,
    onToggle: createTodoToggleHandler(currentTaskEl, todoStatusEl),
    baseAriaLabel: getToolLabel(toolCall.name, toolCall.input)
  });

  return toolEl;
}
