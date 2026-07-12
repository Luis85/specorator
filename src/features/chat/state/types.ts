import type { EditorView } from '@codemirror/view';

import type { ChatRuntimeQueryOptions, ChatTurnRequest } from '../../../core/runtime/types';
import type { TodoItem } from '../../../core/tools/todo';
import type {
  ChatMessage,
  ImageAttachment,
  SubagentInfo,
  ToolCallInfo,
  UsageInfo,
} from '../../../core/types';
import type { BrowserSelectionContext } from '../../../utils/browser';
import type { CanvasSelectionContext } from '../../../utils/canvas';
import type { EditorSelectionContext } from '../../../utils/editor';
import type { ThinkingBlockState } from '../rendering/ThinkingBlockRenderer';
import type { EditedFileEntry } from '../utils/editedFiles';

/** Queued message waiting to be sent after current streaming completes. */
export interface QueuedMessage {
  content: string;
  images?: ImageAttachment[];
  editorContext: EditorSelectionContext | null;
  browserContext?: BrowserSelectionContext | null;
  canvasContext: CanvasSelectionContext | null;
  /** Provider-neutral turn snapshot captured at enqueue time. */
  turnRequest?: ChatTurnRequest;
}

/** Pending tool call waiting to be rendered (buffered until input is complete). */
export interface PendingToolCall {
  toolCall: ToolCallInfo;
  parentEl: HTMLElement | null;
}

/**
 * The in-flight turn's reactive state, consumed by the Vue transcript island.
 * Null when no turn is streaming. Lives here (not in the store) so `ChatState`
 * can build it without importing the Pinia store; the store re-exports this type.
 */
export interface ActiveStreamState {
  /** id of the assistant ChatMessage currently being appended to. */
  messageId: string;
  /** index into that message's contentBlocks of the block being written (−1 when none open). */
  blockIndex: number;
  isThinking: boolean;
  isWriting: boolean;
  elapsedSeconds: number;
}

/** Stored selection state from editor polling. */
export interface StoredSelection {
  notePath: string;
  selectedText: string;
  lineCount: number;
  startLine?: number;
  from?: number;
  to?: number;
  editorView?: EditorView;
  domRanges?: Range[];
}

/** Centralized chat state data. */
export interface ChatStateData {
  // Message state
  messages: ChatMessage[];

  // Streaming control
  isStreaming: boolean;
  cancelRequested: boolean;
  streamGeneration: number;
  /** Guards against concurrent operations during conversation creation. */
  isCreatingConversation: boolean;
  /** Guards against concurrent operations during conversation switching. */
  isSwitchingConversation: boolean;
  /** True while the target conversation's transcript is being loaded asynchronously.
   *  Set after the instant tab swap + spinner render; cleared when the
   *  hydration result lands (or the hydration is aborted by a newer switch).
   *  Gates send / submit so the user can't dispatch into a half-loaded tab. */
  isHydrating: boolean;
  /** Local tab state is ahead of persisted conversation metadata. */
  hasPendingConversationSave: boolean;

  // Conversation identity
  currentConversationId: string | null;

  // Queued message
  queuedMessage: QueuedMessage | null;

  // Active streaming DOM state
  currentContentEl: HTMLElement | null;
  currentTextEl: HTMLElement | null;
  currentTextContent: string;
  currentThinkingState: ThinkingBlockState | null;

  // Active reactive-stream pointers (the Vue transcript renders the in-flight
  // turn from these). `activeMessageId` is the streaming assistant message id;
  // `activeBlockIndex` indexes its `contentBlocks` at the block currently
  // growing (−1 when no text/thinking block is open). Written alongside the
  // imperative DOM state during Tasks 15–17 (dual-write).
  activeMessageId: string | null;
  activeBlockIndex: number;
  /**
   * Which form the streaming indicator is currently rendering, driving the Vue
   * transcript's `StreamingIndicator`. `'thinking'` ⇔ the debounced flavor indicator is on
   * screen, `'writing'` ⇔ the immediate `Writing response…` placeholder, `null`
   * ⇔ hidden. This tracks the INDICATOR's show/showWriting/hide state, not the
   * reasoning/text block state. Written alongside the imperative DOM (dual-write).
   */
  streamingIndicatorMode: 'thinking' | 'writing' | null;
  queueIndicatorEl: HTMLElement | null;
  /** Debounce timeout for showing thinking indicator after inactivity. */
  thinkingIndicatorTimeout: number | null;

  // Tool tracking maps
  toolCallElements: Map<string, HTMLElement>;

  // Context window usage
  usage: UsageInfo | null;
  // Flag to ignore usage updates (during session reset)
  ignoreUsageUpdates: boolean;

  // Current todo items for the persistent bottom panel
  currentTodos: TodoItem[] | null;

  /**
   * Files the agent created or edited in this conversation, most-recent first.
   * Surfaced as a clickable list above the composer; appended live during
   * streaming and rebuilt from the transcript when a conversation loads.
   */
  editedFiles: EditedFileEntry[];

  // Attention state (approval pending, error, etc.)
  needsAttention: boolean;

  // Auto-scroll control during streaming
  autoScrollEnabled: boolean;

  // Response timer state
  responseStartTime: number | null;
  flavorTimerInterval: number | null;

  // Pending plan content for approve-new-session (auto-sends in new session after stream ends)
  pendingNewSessionPlan: string | null;

  // Plan file path captured from Write tool calls to provider plan directory during plan mode
  planFilePath: string | null;

  // Saved permission mode before entering plan mode (for Shift+Tab toggle restore)
  prePlanPermissionMode: string | null;

}

/** Callbacks for ChatState changes. */
export interface ChatStateCallbacks {
  onMessagesChanged?: () => void;
  onStreamingStateChanged?: (isStreaming: boolean) => void;
  onConversationChanged?: (id: string | null) => void;
  onUsageChanged?: (usage: UsageInfo | null) => void;
  onTodosChanged?: (todos: TodoItem[] | null) => void;
  onAttentionChanged?: (needsAttention: boolean) => void;
  onAutoScrollChanged?: (enabled: boolean) => void;
  onEditedFilesChanged?: (files: EditedFileEntry[]) => void;
}

/** Options for query execution. */
export type QueryOptions = ChatRuntimeQueryOptions;

// Re-export types that are used across the chat feature
export type {
  ChatMessage,
  EditedFileEntry,
  EditorSelectionContext,
  ImageAttachment,
  SubagentInfo,
  ThinkingBlockState,
  TodoItem,
  ToolCallInfo,
  UsageInfo,
};
