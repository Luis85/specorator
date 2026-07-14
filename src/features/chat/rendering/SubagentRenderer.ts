import { type App,setIcon } from 'obsidian';

import { getToolIcon } from '../../../core/tools/toolIcons';
import { TOOL_TASK } from '../../../core/tools/toolNames';
import type { SubagentInfo, ToolCallInfo } from '../../../core/types';
import { setupCollapsible } from './collapsible';
import {
  buildAsyncHeaderAriaLabel,
  buildAsyncStatusPill,
  buildSyncHeaderAriaLabel,
  buildSyncRootClasses,
  buildSyncStatusPill,
  getAsyncStatusText,
  resolveSubagentResultText,
  shouldShowRunningPlaceholder,
  truncateDescription,
} from './subagentViewModel';
import {
  renderExpandedContent,
  setToolIcon,
} from './ToolCallRenderer';
import { getToolName, getToolSummary, TOOL_CALL_STATUS_ICONS } from './toolCallViewModel';
import { getToolLabel } from './toolLabel';

interface SubagentToolView {
  wrapperEl: HTMLElement;
  nameEl: HTMLElement;
  summaryEl: HTMLElement;
  statusEl: HTMLElement;
  contentEl: HTMLElement;
}

interface SubagentSection {
  wrapperEl: HTMLElement;
  bodyEl: HTMLElement;
}

export interface SubagentState {
  app: App;
  wrapperEl: HTMLElement;
  contentEl: HTMLElement;
  headerEl: HTMLElement;
  labelEl: HTMLElement;
  statusEl: HTMLElement;
  promptSectionEl: HTMLElement;
  promptBodyEl: HTMLElement;
  toolsContainerEl: HTMLElement;
  resultSectionEl: HTMLElement | null;
  resultBodyEl: HTMLElement | null;
  toolElements: Map<string, SubagentToolView>;
  info: SubagentInfo;
}

function extractTaskDescription(input: Record<string, unknown>): string {
  return (input.description as string) || 'Subagent task';
}

function extractTaskPrompt(input: Record<string, unknown>): string {
  return (input.prompt as string) || '';
}

function createSection(parentEl: HTMLElement, title: string, bodyClass?: string): SubagentSection {
  const wrapperEl = parentEl.createDiv({ cls: 'specorator-subagent-section' });

  const headerEl = wrapperEl.createDiv({ cls: 'specorator-subagent-section-header' });
  headerEl.setAttribute('tabindex', '0');
  headerEl.setAttribute('role', 'button');

  const titleEl = headerEl.createDiv({ cls: 'specorator-subagent-section-title' });
  titleEl.setText(title);

  const bodyEl = wrapperEl.createDiv({ cls: 'specorator-subagent-section-body' });
  if (bodyClass) bodyEl.addClass(bodyClass);

  const state = { isExpanded: false };
  setupCollapsible(wrapperEl, headerEl, bodyEl, state, {
    baseAriaLabel: title,
  });

  return { wrapperEl, bodyEl };
}

function setPromptText(promptBodyEl: HTMLElement, prompt: string): void {
  promptBodyEl.empty();
  const textEl = promptBodyEl.createDiv({ cls: 'specorator-subagent-prompt-text' });
  textEl.setText(prompt || 'No prompt provided');
}

function createSubagentHeader(
  wrapperEl: HTMLElement,
  description: string,
  ariaLabel?: string,
): { headerEl: HTMLElement; labelEl: HTMLElement } {
  const headerEl = wrapperEl.createDiv({ cls: 'specorator-subagent-header' });
  headerEl.setAttribute('tabindex', '0');
  headerEl.setAttribute('role', 'button');
  if (ariaLabel !== undefined) {
    headerEl.setAttribute('aria-expanded', 'false');
    headerEl.setAttribute('aria-label', ariaLabel);
  }

  const iconEl = headerEl.createDiv({ cls: 'specorator-subagent-icon' });
  iconEl.setAttribute('aria-hidden', 'true');
  setIcon(iconEl, getToolIcon(TOOL_TASK));

  const labelEl = headerEl.createDiv({ cls: 'specorator-subagent-label' });
  labelEl.setText(truncateDescription(description));

  return { headerEl, labelEl };
}

function updateSyncHeaderAria(state: SubagentState): void {
  state.headerEl.setAttribute('aria-label', buildSyncHeaderAriaLabel(state.info.description, state.info.status));
  const pill = buildSyncStatusPill(state.info.status);
  state.statusEl.setAttribute('aria-label', pill.ariaLabel);
}

function renderSubagentToolContent(app: App, contentEl: HTMLElement, toolCall: ToolCallInfo): void {
  contentEl.empty();

  if (shouldShowRunningPlaceholder(toolCall)) {
    const emptyEl = contentEl.createDiv({ cls: 'specorator-subagent-tool-empty' });
    emptyEl.setText('Running...');
    return;
  }

  renderExpandedContent(app, contentEl, toolCall.name, toolCall.result, toolCall.input);
}

function setSubagentToolStatus(view: SubagentToolView, status: ToolCallInfo['status']): void {
  view.statusEl.className = 'specorator-subagent-tool-status';
  view.statusEl.addClass(`status-${status}`);
  view.statusEl.empty();
  view.statusEl.setAttribute('aria-label', `Status: ${status}`);

  const statusIcon = TOOL_CALL_STATUS_ICONS[status];
  if (statusIcon) {
    setIcon(view.statusEl, statusIcon);
  }
}

function updateSubagentToolView(app: App, view: SubagentToolView, toolCall: ToolCallInfo): void {
  view.wrapperEl.className = `specorator-subagent-tool-item specorator-subagent-tool-${toolCall.status}`;
  view.nameEl.setText(getToolName(toolCall.name, toolCall.input));
  view.summaryEl.setText(getToolSummary(toolCall.name, toolCall.input));
  setSubagentToolStatus(view, toolCall.status);
  renderSubagentToolContent(app, view.contentEl, toolCall);
}

function createSubagentToolView(app: App, parentEl: HTMLElement, toolCall: ToolCallInfo): SubagentToolView {
  const wrapperEl = parentEl.createDiv({
    cls: `specorator-subagent-tool-item specorator-subagent-tool-${toolCall.status}`,
  });
  wrapperEl.dataset.toolId = toolCall.id;

  const headerEl = wrapperEl.createDiv({ cls: 'specorator-subagent-tool-header' });
  headerEl.setAttribute('tabindex', '0');
  headerEl.setAttribute('role', 'button');

  const iconEl = headerEl.createDiv({ cls: 'specorator-subagent-tool-icon' });
  iconEl.setAttribute('aria-hidden', 'true');
  setToolIcon(iconEl, toolCall.name);

  const nameEl = headerEl.createDiv({ cls: 'specorator-subagent-tool-name' });
  const summaryEl = headerEl.createDiv({ cls: 'specorator-subagent-tool-summary' });
  const statusEl = headerEl.createDiv({ cls: 'specorator-subagent-tool-status' });

  const contentEl = wrapperEl.createDiv({ cls: 'specorator-subagent-tool-content' });

  const collapseState = { isExpanded: toolCall.isExpanded ?? false };
  setupCollapsible(wrapperEl, headerEl, contentEl, collapseState, {
    initiallyExpanded: toolCall.isExpanded ?? false,
    onToggle: (expanded) => {
      toolCall.isExpanded = expanded;
    },
    baseAriaLabel: getToolLabel(toolCall.name, toolCall.input),
  });

  const view: SubagentToolView = {
    wrapperEl,
    nameEl,
    summaryEl,
    statusEl,
    contentEl,
  };
  updateSubagentToolView(app, view, toolCall);

  return view;
}

function ensureResultSection(state: SubagentState): SubagentSection {
  if (state.resultSectionEl && state.resultBodyEl) {
    return { wrapperEl: state.resultSectionEl, bodyEl: state.resultBodyEl };
  }

  const section = createSection(state.contentEl, 'Result', 'specorator-subagent-result-body');
  section.wrapperEl.addClass('specorator-subagent-section-result');
  state.resultSectionEl = section.wrapperEl;
  state.resultBodyEl = section.bodyEl;
  return section;
}

function setResultText(state: SubagentState, text: string): void {
  const section = ensureResultSection(state);
  section.bodyEl.empty();
  const resultEl = section.bodyEl.createDiv({ cls: 'specorator-subagent-result-output' });
  resultEl.setText(text);
}

export function createSubagentBlock(
  app: App,
  parentEl: HTMLElement,
  taskToolId: string,
  taskInput: Record<string, unknown>,
): SubagentState {
  const description = extractTaskDescription(taskInput);
  const prompt = extractTaskPrompt(taskInput);

  const info: SubagentInfo = {
    id: taskToolId,
    description,
    prompt,
    status: 'running',
    toolCalls: [],
    isExpanded: false,
  };

  const wrapperEl = parentEl.createDiv({ cls: 'specorator-subagent-list' });
  wrapperEl.dataset.subagentId = taskToolId;

  const { headerEl, labelEl } = createSubagentHeader(wrapperEl, description);

  const statusEl = headerEl.createDiv({ cls: 'specorator-subagent-status status-running' });
  statusEl.setAttribute('aria-label', 'Status: running');

  const contentEl = wrapperEl.createDiv({ cls: 'specorator-subagent-content' });

  const promptSection = createSection(contentEl, 'Prompt', 'specorator-subagent-prompt-body');
  promptSection.wrapperEl.addClass('specorator-subagent-section-prompt');
  setPromptText(promptSection.bodyEl, prompt);

  const toolsContainerEl = contentEl.createDiv({ cls: 'specorator-subagent-tools' });

  setupCollapsible(wrapperEl, headerEl, contentEl, info);

  const state: SubagentState = {
    app,
    wrapperEl,
    contentEl,
    headerEl,
    labelEl,
    statusEl,
    promptSectionEl: promptSection.wrapperEl,
    promptBodyEl: promptSection.bodyEl,
    toolsContainerEl,
    resultSectionEl: null,
    resultBodyEl: null,
    toolElements: new Map<string, SubagentToolView>(),
    info,
  };

  updateSyncHeaderAria(state);
  return state;
}

export function addSubagentToolCall(
  state: SubagentState,
  toolCall: ToolCallInfo
): void {
  const existingIndex = state.info.toolCalls.findIndex(tc => tc.id === toolCall.id);
  if (existingIndex >= 0) {
    const existingToolCall = state.info.toolCalls[existingIndex];
    const mergedToolCall: ToolCallInfo = {
      ...existingToolCall,
      ...toolCall,
      input: {
        ...existingToolCall.input,
        ...toolCall.input,
      },
      result: toolCall.result ?? existingToolCall.result,
      isExpanded: toolCall.isExpanded ?? existingToolCall.isExpanded,
    };

    state.info.toolCalls[existingIndex] = mergedToolCall;

    const existingView = state.toolElements.get(toolCall.id);
    if (existingView) {
      updateSubagentToolView(state.app, existingView, mergedToolCall);
    }

    updateSyncHeaderAria(state);
    return;
  }

  state.info.toolCalls.push(toolCall);

  const toolView = createSubagentToolView(state.app, state.toolsContainerEl, toolCall);
  state.toolElements.set(toolCall.id, toolView);

  updateSyncHeaderAria(state);
}

export function updateSubagentToolResult(
  state: SubagentState,
  toolId: string,
  toolCall: ToolCallInfo
): void {
  const idx = state.info.toolCalls.findIndex(tc => tc.id === toolId);
  if (idx !== -1) {
    state.info.toolCalls[idx] = toolCall;
  }

  const toolView = state.toolElements.get(toolId);
  if (!toolView) {
    return;
  }

  updateSubagentToolView(state.app, toolView, toolCall);
}

export function finalizeSubagentBlock(
  state: SubagentState,
  result: string,
  isError: boolean
): void {
  state.info.status = isError ? 'error' : 'completed';
  state.info.result = result;

  state.labelEl.setText(truncateDescription(state.info.description));

  const pill = buildSyncStatusPill(state.info.status);
  state.statusEl.className = 'specorator-subagent-status';
  state.statusEl.addClass(pill.pillClass);
  state.statusEl.empty();
  if (pill.icon) {
    setIcon(state.statusEl, pill.icon);
  }
  state.wrapperEl.removeClass('done');
  state.wrapperEl.removeClass('error');
  for (const cls of buildSyncRootClasses(state.info.status)) {
    state.wrapperEl.addClass(cls);
  }

  const displayStatus = isError ? 'error' : 'completed';
  const resolved = resolveSubagentResultText(displayStatus, result);
  setResultText(state, resolved?.text ?? (isError ? 'ERROR' : 'DONE'));

  updateSyncHeaderAria(state);
}

export interface AsyncSubagentState {
  app: App;
  wrapperEl: HTMLElement;
  contentEl: HTMLElement;
  headerEl: HTMLElement;
  labelEl: HTMLElement;
  statusTextEl: HTMLElement;  // Running / Completed / Error / Orphaned
  statusEl: HTMLElement;
  info: SubagentInfo;
}

function setAsyncWrapperStatus(wrapperEl: HTMLElement, status: string): void {
  const classes = ['pending', 'running', 'awaiting', 'completed', 'error', 'orphaned', 'async'];
  classes.forEach(cls => wrapperEl.removeClass(cls));
  wrapperEl.addClass('async');
  wrapperEl.addClass(status);
}

function updateAsyncLabel(state: AsyncSubagentState): void {
  state.labelEl.setText(truncateDescription(state.info.description));
  state.headerEl.setAttribute(
    'aria-label',
    buildAsyncHeaderAriaLabel(state.info.description, state.info.asyncStatus),
  );
}

function renderAsyncContentLikeSync(
  app: App,
  contentEl: HTMLElement,
  subagent: SubagentInfo,
  displayStatus: 'running' | 'completed' | 'error' | 'orphaned',
): void {
  contentEl.empty();

  const promptSection = createSection(contentEl, 'Prompt', 'specorator-subagent-prompt-body');
  promptSection.wrapperEl.addClass('specorator-subagent-section-prompt');
  setPromptText(promptSection.bodyEl, subagent.prompt || '');

  const toolsContainerEl = contentEl.createDiv({ cls: 'specorator-subagent-tools' });
  for (const originalToolCall of subagent.toolCalls) {
    const toolCall: ToolCallInfo = {
      ...originalToolCall,
      input: { ...originalToolCall.input },
    };
    createSubagentToolView(app, toolsContainerEl, toolCall);
  }

  if (displayStatus === 'running') {
    return;
  }

  const resultSection = createSection(contentEl, 'Result', 'specorator-subagent-result-body');
  resultSection.wrapperEl.addClass('specorator-subagent-section-result');
  const resultEl = resultSection.bodyEl.createDiv({ cls: 'specorator-subagent-result-output' });

  const resolved = resolveSubagentResultText(displayStatus, subagent.result);
  if (resolved) {
    resultEl.setText(resolved.text);
  }
}

/**
 * Create an async subagent block for a background Agent tool call.
 * Expandable to show the task prompt. Collapsed by default.
 */
export function createAsyncSubagentBlock(
  app: App,
  parentEl: HTMLElement,
  taskToolId: string,
  taskInput: Record<string, unknown>,
): AsyncSubagentState {
  const description = (taskInput.description as string) || 'Background task';
  const prompt = (taskInput.prompt as string) || '';

  const info: SubagentInfo = {
    id: taskToolId,
    description,
    prompt,
    mode: 'async',
    status: 'running',
    toolCalls: [],
    isExpanded: false,
    asyncStatus: 'pending',
  };

  const wrapperEl = parentEl.createDiv({ cls: 'specorator-subagent-list' });
  setAsyncWrapperStatus(wrapperEl, 'pending');
  wrapperEl.dataset.asyncSubagentId = taskToolId;

  const { headerEl, labelEl } = createSubagentHeader(
    wrapperEl,
    description,
    `Background task: ${description} - Initializing - click to expand`,
  );

  const statusTextEl = headerEl.createDiv({ cls: 'specorator-subagent-status-text' });
  statusTextEl.setText(getAsyncStatusText('pending'));

  const statusEl = headerEl.createDiv({ cls: 'specorator-subagent-status status-running' });
  statusEl.setAttribute('aria-label', 'Status: running');

  const contentEl = wrapperEl.createDiv({ cls: 'specorator-subagent-content' });
  renderAsyncContentLikeSync(app, contentEl, info, 'running');

  setupCollapsible(wrapperEl, headerEl, contentEl, info);

  return {
    app,
    wrapperEl,
    contentEl,
    headerEl,
    labelEl,
    statusTextEl,
    statusEl,
    info,
  };
}

export function updateAsyncSubagentRunning(
  state: AsyncSubagentState,
  agentId: string
): void {
  state.info.asyncStatus = 'running';
  state.info.agentId = agentId;

  setAsyncWrapperStatus(state.wrapperEl, 'running');
  updateAsyncLabel(state);

  state.statusTextEl.setText(getAsyncStatusText('running'));

  renderAsyncContentLikeSync(state.app, state.contentEl, state.info, 'running');
}

export function finalizeAsyncSubagent(
  state: AsyncSubagentState,
  result: string,
  isError: boolean
): void {
  state.info.asyncStatus = isError ? 'error' : 'completed';
  state.info.status = isError ? 'error' : 'completed';
  state.info.result = result;

  setAsyncWrapperStatus(state.wrapperEl, isError ? 'error' : 'completed');
  updateAsyncLabel(state);

  state.statusTextEl.setText(getAsyncStatusText(isError ? 'error' : 'completed'));

  const pill = buildAsyncStatusPill(isError ? 'error' : 'completed');
  state.statusEl.className = 'specorator-subagent-status';
  state.statusEl.addClass(pill.pillClass);
  state.statusEl.empty();
  if (pill.icon) {
    setIcon(state.statusEl, pill.icon);
  }

  if (isError) {
    state.wrapperEl.addClass('error');
  } else {
    state.wrapperEl.addClass('done');
  }

  renderAsyncContentLikeSync(state.app, state.contentEl, state.info, isError ? 'error' : 'completed');
}

export function markAsyncSubagentOrphaned(state: AsyncSubagentState): void {
  state.info.asyncStatus = 'orphaned';
  state.info.status = 'error';
  state.info.result = 'Conversation ended before task completed';

  setAsyncWrapperStatus(state.wrapperEl, 'orphaned');
  updateAsyncLabel(state);

  state.statusTextEl.setText(getAsyncStatusText('orphaned'));

  const pill = buildAsyncStatusPill('orphaned');
  state.statusEl.className = 'specorator-subagent-status status-error';
  state.statusEl.empty();
  if (pill.icon) {
    setIcon(state.statusEl, pill.icon);
  }

  state.wrapperEl.addClass('error');
  state.wrapperEl.addClass('orphaned');

  renderAsyncContentLikeSync(state.app, state.contentEl, state.info, 'orphaned');
}
