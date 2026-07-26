import type { ProviderCapabilities } from '../../../../../core/providers/types';
import type { ChatRewindMode } from '../../../../../core/runtime/types';
import type { ChatMessage, ImageAttachment } from '../../../../../core/types';
import type { AgentPersona } from '../../../../agents/agentTypes';
import type { ActiveStreamState, TranscriptHydrationError } from './stores/transcriptStore';

/** One projected snapshot the view pushes on every ChatState.onMessagesChanged
 *  + streaming transition. Carries the full read-model (messages + active stream
 *  + the welcome/loading/hydration chrome) so every store field flows through the
 *  single `subscribe` channel — the engine has no direct handle to the store. */
export interface TranscriptSnapshot {
  messages: ChatMessage[];
  activeStream: ActiveStreamState | null;
  /** Bound conversation id; drives render-window reset on switch. */
  conversationId: string | null;
  /** Monotonic per-tab projection generation; bumps on conversation switch. */
  projectionRevision: number;
  /** Welcome greeting text; empty string hides it (e.g. once messages exist). */
  greeting: string;
  /** Non-null while a conversation/tab-switch hydration spinner is in flight. */
  loadingText: string | null;
  /** Recorded history-hydration failure banner, or null. */
  hydrationError: TranscriptHydrationError | null;
  /**
   * Persona to attribute this tab's ASSISTANT messages to, or null for an anonymous
   * transcript. Only Team Chat DM tabs ever carry one (pushed by `refreshDmAgentPersonas`);
   * every other surface projects null and so renders exactly as it did before this existed.
   *
   * PROJECTED, not a callback: the roster store is async, so the persona lands after mount
   * (and again on rename / re-avatar / delete). A callback read from a render computed is
   * untracked and would stay cached at its first value, leaving restored transcripts
   * anonymous and renamed agents stale.
   */
  messageIdentity: AgentPersona | null;
}

export type TranscriptSubscribe = (onChange: (s: TranscriptSnapshot) => void) => () => void;

/** Vue → engine actions. Thin delegators to SpecoratorView / controllers. */
export interface TranscriptCallbacks {
  subscribe: TranscriptSubscribe;
  /** Rewind a user message (Claude/Codex). */
  onRewind: (messageId: string, mode?: ChatRewindMode) => Promise<void>;
  /** Fork from a user message. */
  onFork: (messageId: string) => Promise<void>;
  /** Whether rewind is eligible for this message index (findRewindContext). */
  isRewindEligible: (messageId: string) => boolean;
  /**
   * Whether fork is eligible for this message. Split from `isRewindEligible` so a
   * surface can disable fork while keeping rewind — a Team Chat DM disables fork
   * (an unbound ad-hoc fork would escape the surface filter) but rewind, being
   * same-conversation, stays safe. Optional: when absent (older callback builders
   * / unit fixtures) the renderer falls back to `isRewindEligible`, the pre-split
   * behavior, so non-Team-Chat surfaces are byte-identical.
   */
  isForkEligible?: (messageId: string) => boolean;
  /** Open provider settings (runtime-error card, disabled-provider prompt). */
  openProviderSettings: (providerId: string) => void;
  /** Re-dispatch the user's last turn (runtime-error retry); null when unavailable. */
  onRetryLastTurn: (() => void) | null;
  /**
   * Whether a genuinely retryable turn exists right now (`hasRetryableTurn`).
   * Evaluated at render time so a runtime-error card rendered after a reload /
   * conversation switch — where no turn was dispatched this session — hides
   * Retry rather than silently no-opping or retrying an unrelated later turn.
   */
  canRetryLastTurn: () => boolean;
  /** Registered per-message actions (e.g. Create work order). */
  getMessageActions: (msg: ChatMessage) => Array<{ id: string; label: string; icon: string; run: () => void }>;
  /** Copy helper (writes to clipboard + transient "copied" feedback owned by caller). */
  copyText: (text: string) => void;
  /** Open a vault file (context-card @mention click / file links). */
  openFile: (path: string) => void;
  /** Resolve an image attachment's <img> src (vault file preferred over base64). */
  resolveImageSrc: (image: ImageAttachment) => string;
  /** Show an image in the full-size modal overlay. */
  showFullImage: (image: ImageAttachment) => void;
  /** Provider id of the active tab (capability gating, subagent adapter). */
  getProviderId: () => string;
  /** Active tab's provider capabilities (mirrors legacy `MessageRendererHooks.getCapabilities`; gates rewind/fork). */
  getCapabilities: () => ProviderCapabilities;
  /** Work-order note path for this tab, or null (drives protocol card splitting). */
  getWorkOrderPath: () => string | null;
}
