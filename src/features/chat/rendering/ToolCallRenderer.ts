import { type App, setIcon } from 'obsidian';

import { getToolIcon, MCP_ICON_MARKER } from '../../../core/tools/toolIcons';
import {
  isAgentLifecycleTool,
  TOOL_APPLY_PATCH,
  TOOL_BASH,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_LS,
  TOOL_READ,
  TOOL_TOOL_SEARCH,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  TOOL_WRITE_STDIN,
} from '../../../core/tools/toolNames';
import { appendMcpIcon } from '../../../shared/icons';
import { parseApplyPatchDiffs, parseFileUpdateChangeDiffs } from '../../../utils/diff';
import { decorateVaultFileLink } from '../../../utils/fileLink';
import {
  isApplyPatchErrorResult,
  renderApplyPatchChangeList,
  renderApplyPatchResultFallback,
} from './applyPatchExpandedHelpers';
import { renderDiffContent } from './DiffRenderer';
import { renderLinesExpanded } from './toolLinesExpanded';
import { renderWebSearchExpanded } from './webSearchRenderer';

export function setToolIcon(el: HTMLElement, name: string): void {
  const icon = getToolIcon(name);
  if (icon === MCP_ICON_MARKER) {
    appendMcpIcon(el);
  } else {
    setIcon(el, icon);
  }
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
    if (!/^Found \d+ files?:/i.test(stripped) && !/^\d+ matches across/i.test(stripped)) {
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
    // Fall back to raw output.
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
  lineEl.setText(result.length > maxChars ? result.slice(0, maxChars) : result);
  if (result.length > maxChars) {
    linesEl.createDiv({
      cls: 'specorator-tool-truncated',
      text: `... ${result.length - maxChars} more characters`,
    });
  }
}

function getApplyPatchFileDiffs(input: Record<string, unknown>): ReturnType<typeof parseApplyPatchDiffs> {
  const patchText = typeof input.patch === 'string' ? input.patch : '';
  const parsedDiffs = patchText ? parseApplyPatchDiffs(patchText) : [];
  return parsedDiffs.length > 0 ? parsedDiffs : parseFileUpdateChangeDiffs(input.changes);
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
    for (const fileDiff of parsedDiffs) {
      const sectionEl = container.createDiv({ cls: 'specorator-tool-patch-section' });
      if (fileDiff.operation === 'delete' && fileDiff.diffLines.length === 0) {
        sectionEl.createDiv({ cls: 'specorator-tool-empty', text: 'File deleted' });
      } else if (fileDiff.diffLines.length === 0) {
        sectionEl.createDiv({ cls: 'specorator-tool-empty', text: 'No textual diff available' });
      } else {
        const diffRow = sectionEl.createDiv({ cls: 'specorator-write-edit-diff-row' });
        renderDiffContent(
          diffRow.createDiv({ cls: 'specorator-write-edit-diff' }),
          fileDiff.diffLines,
        );
      }
    }
    return;
  }
  if (renderApplyPatchChangeList(container, input.changes)) return;
  if (patchText) {
    renderLinesExpanded(container, patchText, 80);
    return;
  }
  renderApplyPatchResultFallback(container, result, (text, max) =>
    renderLinesExpanded(container, text, max));
}

function renderBashContent(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string,
): void {
  const command = typeof input.command === 'string' ? input.command : '';
  if (command) {
    container.createDiv({ cls: 'specorator-tool-bash-command', text: `$ ${command}` });
  }
  if (result) {
    renderLinesExpanded(container, result, 20);
  } else {
    container.createDiv({ cls: 'specorator-tool-empty', text: 'No result' });
  }
}

function renderAgentLifecycleExpanded(container: HTMLElement, result: string): void {
  const trimmed = result.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
      for (const [key, value] of Object.entries(parsed)) {
        const displayValue = typeof value === 'string'
          ? value
          : value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : `${value}`;
        linesEl.createDiv({ cls: 'specorator-tool-line', text: `${key}: ${displayValue}` });
      }
      return;
    } catch {
      // Fall through to raw output.
    }
  }
  renderLinesExpanded(container, result, 20);
}

/**
 * Imperative expanded-content adapter retained only for detached streaming
 * subagent lifecycle state. Stored and top-level transcript tools render in Vue.
 */
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
  }
}
