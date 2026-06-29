import type { BrowserSelectionContext } from '../../utils/browser';
import type { CanvasSelectionContext } from '../../utils/canvas';
import type { EditorSelectionContext } from '../../utils/editor';
import type {
  ApprovalDecision,
  Conversation,
  ExitPlanModeCallback,
  ImageAttachment,
  StreamChunk,
} from '../types';

export interface ApprovalDecisionOption {
  label: string;
  description?: string;
  value: string;
  decision?: ApprovalDecision;
}

export interface ApprovalNetworkContext {
  host: string;
  protocol: string;
}

export interface ApprovalCallbackOptions {
  decisionReason?: string;
  blockedPath?: string;
  agentID?: string;
  decisionOptions?: ApprovalDecisionOption[];
  networkApprovalContext?: ApprovalNetworkContext;
  additionalPermissions?: unknown;
}

export type ApprovalCallback = (
  toolName: string,
  input: Record<string, unknown>,
  description: string,
  options?: ApprovalCallbackOptions,
) => Promise<ApprovalDecision>;

export type AskUserQuestionCallback = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<Record<string, string | string[]> | null>;

export interface ChatTurnRequest {
  text: string;
  images?: ImageAttachment[];
  currentNotePath?: string;
  editorSelection?: EditorSelectionContext | null;
  browserSelection?: BrowserSelectionContext | null;
  canvasSelection?: CanvasSelectionContext | null;
  externalContextPaths?: string[];
  enabledMcpServers?: Set<string>;
}

export interface PreparedChatTurn {
  request: ChatTurnRequest;
  persistedContent: string;
  prompt: string;
  isCompact: boolean;
  mcpMentions: Set<string>;
}

export interface ChatRuntimeQueryOptions {
  allowedTools?: string[];
  model?: string;
  mcpMentions?: Set<string>;
  enabledMcpServers?: Set<string>;
  forceColdStart?: boolean;
  externalContextPaths?: string[];
  /** System prompt appendix sourced from the conversation's bound roster agent. Claude-only. */
  boundAgentPrompt?: string;
  /** Model override sourced from the conversation's bound roster agent. Beats settings.model but loses to an explicit tab/work-order override. Claude-only. */
  boundAgentModel?: string;
  /** Agent slug (roster id with `roster:` stripped). Forwarded to providers that
   *  support native agent activation so they can use their own agent protocol
   *  rather than raw system-prompt injection. Claude-only for now. */
  boundAgentSlug?: string;
  /** Human-readable description of the bound agent forwarded to native agent
   *  definitions that require one (e.g. Claude SDK AgentDefinition.description). */
  boundAgentDescription?: string;
}

export interface ChatRuntimeEnsureReadyOptions {
  allowSessionCreation?: boolean;
  force?: boolean;
}

export type ChatRuntimeConversationState = Pick<
  Conversation,
  'sessionId' | 'providerState'
>;

/**
 * Minimal bound-agent projection synced to a runtime before ensureReady() so
 * the persistent query starts with the correct system-prompt key. Matches the
 * shape of `BoundAgentProjection` (features layer); defined here to keep the
 * core runtime contract free of feature-layer imports.
 */
export interface BoundAgentState {
  prompt?: string;
  model?: string;
  /** Agent slug forwarded to providers that support native agent activation. */
  slug?: string;
  description?: string;
}

export interface SessionUpdateResult {
  updates: Partial<Conversation>;
}

export interface ChatRewindResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export type ChatRewindMode = 'conversation' | 'code-and-conversation';

export interface SubagentRuntimeState {
  hasRunning: boolean;
}

export interface ChatTurnMetadata {
  userMessageId?: string;
  assistantMessageId?: string;
  wasSent?: boolean;
  planCompleted?: boolean;
  /**
   * Text the controller should auto-send as a resumed follow-up turn once this
   * turn completes. Cursor uses it to deliver an AskUserQuestion answer back to
   * the agent: its one-shot CLI cannot answer the tool in-process, so the
   * collected answer continues the conversation as the next (resumed) turn.
   */
  autoFollowUpText?: string;
}

export interface AutoTurnResult {
  chunks: StreamChunk[];
  metadata: ChatTurnMetadata;
}

export type AutoTurnCallback = (result: AutoTurnResult) => void | Promise<void>;

export type {
  ApprovalDecision,
  ExitPlanModeCallback,
};
