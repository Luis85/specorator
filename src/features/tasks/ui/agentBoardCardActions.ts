import type { TranslationKey } from '../../../i18n/types';
import type { PersonaResolver } from '../../agents/personaRegistry';
import type { TaskSpec, TaskStatus } from '../model/taskTypes';

// Data + contract module for the Agent Board card surface. The imperative
// DOM-building (`AgentBoardCardActions`, the portal popover) was deleted in the
// Task 5b Vue cutover; the Vue `CardActionCluster`/`OverflowMenu`/`CardReplySurface`
// components consume the `CARD_ACTIONS` spec table plus the `AgentBoardRenderCallbacks`
// and `AgentBoardPauseState` types re-homed here.

/** Pause payload surfaced on a card while a run waits for input or approval. */
export interface AgentBoardPauseState {
  question?: string;
  action?: string;
  risk?: string;
  defaultValue?: string;
  reversible?: boolean;
  runId?: string;
}

export interface AgentBoardRenderCallbacks {
  onOpenDetail(task: TaskSpec): void;
  onRun(task: TaskSpec): void;
  onStop(task: TaskSpec): void;
  onAccept(task: TaskSpec): void;
  onRework(task: TaskSpec): void;
  onMarkReady(task: TaskSpec): void;
  onReopen(task: TaskSpec): void;
  onMoveToInbox(task: TaskSpec): void;
  onAddWorkOrder(): void;
  onRunNextReady(): void;
  /**
   * Auto-run switch toggle: (re)starts or pauses the shared queue. Vue-only —
   * the imperative toolbar embeds this on `QueueToolbarState.onToggle`, so the
   * imperative renderer never reads it here; the Vue toolbar routes actions
   * through this callbacks contract like every other button, and the Task 5b
   * cutover maps it to `AgentBoardView.onToggleQueue()`.
   */
  onToggleAutoRun?(): void;
  /** Dismiss a card's queue skip chip (clears the runner's shared skip map). The
   *  chip itself is a reactive store overlay, not read through this contract. */
  onAckSkip?: (task: TaskSpec) => void;
  onContextMenu(task: TaskSpec, event: MouseEvent): void;
  onToggleLaneCollapse(laneId: string): void;
  onReply?(task: TaskSpec, content: string): void;
  onApprove?(task: TaskSpec): void;
  onReject?(task: TaskSpec, reason: string): void;
  onCancelPaused?(task: TaskSpec): void;
  /** needs_handoff → review: salvage a run that finished without a structured handoff. */
  onSendToReview?(task: TaskSpec): void;
  /** needs_handoff → failed: give up on a run that finished without a structured handoff. */
  onMarkFailed?(task: TaskSpec): void;
  /** ⋯ menu: move a terminal/inbox work order to the archive folder. */
  onArchive(task: TaskSpec): void;
  /** ⋯ menu: open the work-order note in a new tab. */
  onOpenNote(task: TaskSpec): void;
  /** ⋯ menu: open the linked conversation in a new tab. */
  onOpenConversation(task: TaskSpec): void;
  /** Whether the linked conversation still exists; gates "Open conversation". */
  canOpenConversation?(task: TaskSpec): boolean;
  /** Resolves an `agent` id to the persona whose avatar the card footer renders. */
  resolvePersona?: PersonaResolver;
}

/**
 * One card action — the per-status primary button or a ⋯ overflow-menu item.
 * `labelKey` resolves through the i18n helper; `icon` is a Lucide glyph;
 * `variant` keys the primary button styling; `danger` marks destructive ⋯ menu
 * items (red). `run` is resolved against the live callbacks at click time.
 */
export interface CardAction {
  labelKey: TranslationKey;
  icon: string;
  variant?: 'cta' | 'danger' | 'ghost';
  danger?: boolean;
  run: (callbacks: AgentBoardRenderCallbacks, task: TaskSpec) => void;
  /** When present, the action is only shown if this returns true. */
  available?: (callbacks: AgentBoardRenderCallbacks, task: TaskSpec) => boolean;
}

export interface CardActionModel {
  primary: CardAction | null;
  /** Optional labeled button rendered between the primary and the ⋯ menu. */
  secondary?: CardAction;
  menu: CardAction[];
}

// Reusable ⋯ menu items (labels reuse the modal/context-menu keys where they
// already exist; board-only labels live under tasks.board.cardAction.*).
const MENU_OPEN_NOTE: CardAction = {
  labelKey: 'tasks.board.contextMenu.openNote',
  icon: 'file-text',
  run: (cb, task) => cb.onOpenNote(task),
};
const MENU_OPEN_CONVERSATION: CardAction = {
  labelKey: 'tasks.board.contextMenu.openConversation',
  icon: 'message-square',
  run: (cb, task) => cb.onOpenConversation(task),
  // Same guard the detail modal + right-click menu use: a persisted
  // conversation_id whose conversation still resolves.
  available: (cb, task) => Boolean(task.frontmatter.conversation_id) && (cb.canOpenConversation?.(task) ?? true),
};
// Visible "Go to conversation" button (live cards surface it next to Stop rather
// than burying it in the ⋯ menu). Same guard as MENU_OPEN_CONVERSATION: a
// persisted conversation_id whose conversation still resolves.
const GO_TO_CONVERSATION: CardAction = {
  labelKey: 'tasks.board.cardAction.goToConversation',
  icon: 'message-square',
  variant: 'ghost',
  run: (cb, task) => cb.onOpenConversation(task),
  available: (cb, task) => Boolean(task.frontmatter.conversation_id) && (cb.canOpenConversation?.(task) ?? true),
};
const MENU_ARCHIVE: CardAction = {
  labelKey: 'tasks.board.contextMenu.archive',
  icon: 'archive',
  danger: true,
  run: (cb, task) => cb.onArchive(task),
};
const MENU_BACK_TO_INBOX: CardAction = {
  labelKey: 'tasks.board.cardAction.backToInbox',
  icon: 'rotate-ccw',
  run: (cb, task) => cb.onMoveToInbox(task),
};
const MENU_STOP: CardAction = {
  labelKey: 'tasks.workOrderModal.actionStop',
  icon: 'square',
  danger: true,
  run: (cb, task) => cb.onStop(task),
};
const MENU_REWORK: CardAction = {
  labelKey: 'tasks.workOrderModal.actionRework',
  icon: 'rotate-ccw',
  run: (cb, task) => cb.onRework(task),
};
const MENU_MARK_FAILED: CardAction = {
  labelKey: 'tasks.workOrderModal.actionMarkFailed',
  icon: 'triangle',
  danger: true,
  run: (cb, task) => cb.onMarkFailed?.(task),
};

/**
 * Per-status primary action + ⋯ overflow menu (the spec table). `needs_fix`
 * mirrors `ready` and `canceled` mirrors `failed` (both restored from the
 * pre-cluster recovery actions); any status the spec does not tabulate falls
 * back to an Open-note-only menu so every card stays actionable.
 */
export const CARD_ACTIONS: Partial<Record<TaskStatus, CardActionModel>> = {
  inbox: {
    primary: { labelKey: 'tasks.workOrderModal.actionMarkReady', icon: 'check', variant: 'cta', run: (cb, task) => cb.onMarkReady(task) },
    // No "Run now": inbox items aren't runnable (must transition to ready first).
    menu: [MENU_OPEN_NOTE, MENU_ARCHIVE],
  },
  ready: {
    primary: { labelKey: 'tasks.board.cardAction.run', icon: 'play', variant: 'cta', run: (cb, task) => cb.onRun(task) },
    // No Archive: ready/needs_fix are actionable, not archivable (ARCHIVABLE_STATUSES).
    menu: [MENU_OPEN_NOTE, MENU_BACK_TO_INBOX],
  },
  needs_fix: {
    primary: { labelKey: 'tasks.board.cardAction.run', icon: 'play', variant: 'cta', run: (cb, task) => cb.onRun(task) },
    menu: [MENU_OPEN_NOTE, MENU_BACK_TO_INBOX],
  },
  running: {
    primary: { labelKey: 'tasks.workOrderModal.actionStop', icon: 'square', variant: 'danger', run: (cb, task) => cb.onStop(task) },
    // "Go to conversation" is a visible button on the live card; the ⋯ menu drops
    // the duplicate Open-conversation entry it used to carry.
    secondary: GO_TO_CONVERSATION,
    menu: [MENU_OPEN_NOTE],
  },
  needs_input: {
    primary: null,
    menu: [MENU_OPEN_NOTE, MENU_OPEN_CONVERSATION, MENU_STOP],
  },
  needs_approval: {
    primary: null,
    menu: [MENU_OPEN_NOTE, MENU_OPEN_CONVERSATION, MENU_STOP],
  },
  review: {
    primary: { labelKey: 'tasks.workOrderModal.actionAccept', icon: 'check', variant: 'cta', run: (cb, task) => cb.onAccept(task) },
    menu: [MENU_REWORK, MENU_OPEN_NOTE, MENU_OPEN_CONVERSATION, MENU_BACK_TO_INBOX],
  },
  needs_handoff: {
    primary: { labelKey: 'tasks.workOrderModal.actionSendToReview', icon: 'check', variant: 'cta', run: (cb, task) => cb.onSendToReview?.(task) },
    menu: [MENU_MARK_FAILED, MENU_OPEN_NOTE],
  },
  done: {
    primary: { labelKey: 'tasks.workOrderModal.actionReopen', icon: 'rotate-ccw', variant: 'ghost', run: (cb, task) => cb.onReopen(task) },
    menu: [MENU_OPEN_NOTE, MENU_ARCHIVE],
  },
  failed: {
    primary: { labelKey: 'tasks.board.cardAction.retry', icon: 'rotate-ccw', variant: 'cta', run: (cb, task) => cb.onMarkReady(task) },
    menu: [MENU_OPEN_NOTE, MENU_ARCHIVE],
  },
  canceled: {
    primary: { labelKey: 'tasks.board.cardAction.retry', icon: 'rotate-ccw', variant: 'cta', run: (cb, task) => cb.onMarkReady(task) },
    menu: [MENU_OPEN_NOTE, MENU_ARCHIVE],
  },
};

export const FALLBACK_CARD_ACTIONS: CardActionModel = { primary: null, menu: [MENU_OPEN_NOTE] };
