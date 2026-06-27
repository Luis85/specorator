import { setIcon } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type { TranslationKey } from '../../../i18n/types';
import type { TaskSpec, TaskStatus } from '../model/taskTypes';
import type { WorkOrderDetailModalCallbacks } from './WorkOrderDetailModal';

// Footer button visual variant. `ghost` = transparent secondary; `cta` = the
// accent primary; `danger` = the destructive red action. The visual tokens for
// each live in CSS keyed off the modifier class in the modal renderer.
export type FooterActionVariant = 'ghost' | 'cta' | 'danger';

// One sticky-footer action: a real `<button>` with a leading Lucide icon and a
// keyed label. `side` groups the button left (secondary/ghost) or right
// (primary group); `run` is invoked after the modal closes (close-on-click is
// preserved for every action). Actions whose callback is optional/missing are
// filtered out before they are pushed.
export interface FooterAction {
  variant: FooterActionVariant;
  icon: string;
  labelKey: TranslationKey;
  side: 'left' | 'right';
  run: () => void;
}

/**
 * Resolve the footer action list for the current status. Every status gets
 * Open note (ghost, left) and — when a conversation link exists and can be
 * opened — Open conversation (ghost, left). The right-side primary group is
 * status-specific. Statuses the spec does not tabulate fall back to a minimal
 * footer so none renders a dead footer.
 *
 * Behavior-preserving extraction of the modal's former `footerActions` method:
 * control flow, push order, and the per-callback presence guards are identical.
 */
export function footerActionsForStatus(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
): FooterAction[] {
  const { status } = task.frontmatter;
  const actions: FooterAction[] = [];

  // Open note — present on every status.
  actions.push({
    variant: 'ghost',
    icon: 'file-text',
    labelKey: 'tasks.workOrderModal.actionOpenNote',
    side: 'left',
    run: () => callbacks.onOpenNote(task),
  });

  // Open conversation — left ghost, only when the linked conversation exists
  // and can still be opened (mirrors the sidebar Conversation-row guard).
  const canOpenConversation =
    Boolean(task.frontmatter.conversation_id) &&
    Boolean(callbacks.onOpenConversation) &&
    (callbacks.canOpenConversation?.(task) ?? true);

  const addOpenConversation = (): void => {
    if (!canOpenConversation) return;
    actions.push({
      variant: 'ghost',
      icon: 'message-square',
      labelKey: 'tasks.workOrderModal.actionOpenConversation',
      side: 'left',
      run: () => callbacks.onOpenConversation?.(task),
    });
  };

  appendStatusActions(status, task, callbacks, actions, addOpenConversation);

  return actions;
}

// Per-status appenders that push the right-side primary group (and any extra
// left ghost actions) onto `actions`. The ordering and guards match the
// original switch exactly; the table keeps the dispatch flat. Statuses absent
// from the table fall through to the `ready` / `needs_fix` default below
// (Open note + Open conversation only — Run is a board action now).
const STATUS_APPENDERS: Partial<
  Record<
    TaskStatus,
    (
      task: TaskSpec,
      callbacks: WorkOrderDetailModalCallbacks,
      actions: FooterAction[],
      addOpenConversation: () => void,
    ) => void
  >
> = {
  inbox: (task, callbacks, actions) => appendInboxActions(task, callbacks, actions),
  // Live / read-only states: Open conversation + a single Stop danger.
  running: appendLiveActions,
  needs_input: appendLiveActions,
  needs_approval: appendLiveActions,
  review: appendReviewActions,
  needs_handoff: appendNeedsHandoffActions,
  done: (task, callbacks, actions) => appendDoneActions(task, callbacks, actions),
  failed: (task, callbacks, actions) => appendArchiveRightAction(task, callbacks, actions),
  canceled: (task, callbacks, actions) => appendArchiveRightAction(task, callbacks, actions),
};

// Push the status-specific right-side primary group (and any extra left ghost
// actions) onto `actions`.
function appendStatusActions(
  status: TaskStatus,
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
  addOpenConversation: () => void,
): void {
  const appender = STATUS_APPENDERS[status];
  if (appender) {
    appender(task, callbacks, actions, addOpenConversation);
    return;
  }
  // ready / needs_fix (and any future status): Open note + Open conversation
  // only.
  addOpenConversation();
}

function appendInboxActions(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
): void {
  if (callbacks.onMarkReady) {
    actions.push({
      variant: 'cta',
      icon: 'check',
      labelKey: 'tasks.workOrderModal.actionMarkReady',
      side: 'right',
      run: () => callbacks.onMarkReady?.(task),
    });
  }
}

function appendLiveActions(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
  addOpenConversation: () => void,
): void {
  addOpenConversation();
  if (callbacks.onStop) {
    actions.push({
      variant: 'danger',
      icon: 'square',
      labelKey: 'tasks.workOrderModal.actionStop',
      side: 'right',
      run: () => callbacks.onStop?.(task),
    });
  }
}

function appendReviewActions(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
  addOpenConversation: () => void,
): void {
  addOpenConversation();
  if (callbacks.onRework) {
    actions.push({
      variant: 'ghost',
      icon: 'rotate-ccw',
      labelKey: 'tasks.workOrderModal.actionRework',
      side: 'right',
      run: () => callbacks.onRework?.(task),
    });
  }
  if (callbacks.onAccept) {
    actions.push({
      variant: 'cta',
      icon: 'check',
      labelKey: 'tasks.workOrderModal.actionAccept',
      side: 'right',
      run: () => callbacks.onAccept?.(task),
    });
  }
}

function appendNeedsHandoffActions(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
  addOpenConversation: () => void,
): void {
  addOpenConversation();
  if (callbacks.onMarkFailed) {
    actions.push({
      variant: 'danger',
      icon: 'triangle',
      labelKey: 'tasks.workOrderModal.actionMarkFailed',
      side: 'right',
      run: () => callbacks.onMarkFailed?.(task),
    });
  }
  if (callbacks.onSendToReview) {
    actions.push({
      variant: 'cta',
      icon: 'check',
      labelKey: 'tasks.workOrderModal.actionSendToReview',
      side: 'right',
      run: () => callbacks.onSendToReview?.(task),
    });
  }
}

function appendDoneActions(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
): void {
  if (callbacks.onArchive) {
    actions.push({
      variant: 'ghost',
      icon: 'archive',
      labelKey: 'tasks.workOrderModal.actionArchive',
      side: 'left',
      run: () => callbacks.onArchive?.(task),
    });
  }
  if (callbacks.onReopen) {
    actions.push({
      variant: 'ghost',
      icon: 'rotate-ccw',
      labelKey: 'tasks.workOrderModal.actionReopen',
      side: 'right',
      run: () => callbacks.onReopen?.(task),
    });
  }
}

// failed / canceled: a single right-side Archive ghost (when wired).
function appendArchiveRightAction(
  task: TaskSpec,
  callbacks: WorkOrderDetailModalCallbacks,
  actions: FooterAction[],
): void {
  if (callbacks.onArchive) {
    actions.push({
      variant: 'ghost',
      icon: 'archive',
      labelKey: 'tasks.workOrderModal.actionArchive',
      side: 'right',
      run: () => callbacks.onArchive?.(task),
    });
  }
}

/**
 * State the modal hands the footer renderer on each (re)paint. The status
 * actions are derived from `task`; the edit affordances are gated on `editable`
 * and swap on `editing`.
 */
export interface WorkOrderFooterRenderContext {
  task: TaskSpec;
  callbacks: WorkOrderDetailModalCallbacks;
  /** True while the main pane shows the inline edit form. */
  editing: boolean;
  /** True for the editable statuses (inbox / ready / needs_fix). */
  editable: boolean;
  /** Close-on-click for status actions (Open note / Mark ready / …). */
  close: () => void;
  /** Enter edit mode (the "Edit" affordance). */
  onEdit: () => void;
  /** Leave edit mode without persisting (the "Cancel" affordance). */
  onCancel: () => void;
  /** Persist the in-progress edit (the "Save" affordance). */
  onSave: () => void;
}

/**
 * Render the sticky footer: secondary (ghost) actions group left, the primary
 * group (CTA / danger) right. Status actions close the modal first then run
 * (close-on-click); the inline edit actions toggle in place. The Edit affordance
 * (view mode) and Cancel + Save (while editing) sit in the left group beside
 * Open note; while editing the status-specific right-side primary is suppressed.
 * Re-run on every edit toggle (clears the footer first).
 */
export function renderWorkOrderFooter(parent: HTMLElement, ctx: WorkOrderFooterRenderContext): void {
  parent.empty();
  const left = parent.createDiv({
    cls: 'specorator-work-order-modal-footer-group specorator-work-order-modal-footer-group--left',
  });
  const right = parent.createDiv({
    cls: 'specorator-work-order-modal-footer-group specorator-work-order-modal-footer-group--right',
  });

  for (const action of footerActionsForStatus(ctx.task, ctx.callbacks)) {
    if (ctx.editing && action.side === 'right') continue;
    renderFooterButton(action.side === 'right' ? right : left, action, ctx.close);
  }

  if (!ctx.editable) return;
  if (ctx.editing) {
    // Cancel + Save sit beside Open note in the left group (no right-side
    // primary while editing).
    renderFooterButton(left, editAction('ghost', 'x', 'tasks.workOrderModal.actionCancelEdit', 'left', ctx.onCancel), null);
    renderFooterButton(left, editAction('cta', 'check', 'tasks.workOrderModal.actionSaveSections', 'left', ctx.onSave), null);
  } else {
    renderFooterButton(left, editAction('ghost', 'pencil', 'tasks.workOrderModal.actionEdit', 'left', ctx.onEdit), null);
  }
}

function editAction(
  variant: FooterActionVariant,
  icon: string,
  labelKey: TranslationKey,
  side: 'left' | 'right',
  run: () => void,
): FooterAction {
  return { variant, icon, labelKey, side, run };
}

// `closeBeforeRun` carries the close-on-click contract for status actions; the
// inline edit actions pass null so they toggle the modal in place.
function renderFooterButton(
  parent: HTMLElement,
  action: FooterAction,
  closeBeforeRun: (() => void) | null,
): void {
  const button = parent.createEl('button', {
    cls: `specorator-work-order-modal-action specorator-work-order-modal-action--${action.variant}`,
    attr: { type: 'button' },
  });
  const icon = button.createSpan({ cls: 'specorator-work-order-modal-action-icon' });
  icon.setAttr('aria-hidden', 'true');
  // The mock `setIcon` is a no-op; the data attribute records the icon intent
  // so tests can assert it (consistent with the rest of the modal).
  icon.setAttr('data-icon', action.icon);
  setIcon(icon, action.icon);
  button.createSpan({ cls: 'specorator-work-order-modal-action-label', text: t(action.labelKey) });
  button.addEventListener('click', () => {
    closeBeforeRun?.();
    action.run();
  });
}
