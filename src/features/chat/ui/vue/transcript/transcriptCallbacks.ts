import type { ProviderCapabilities } from '../../../../../core/providers/types';
import type { ChatRewindMode } from '../../../../../core/runtime/types';
import type { ChatMessage, ImageAttachment } from '../../../../../core/types';
import type { ActiveStreamState, TranscriptHydrationError } from './stores/transcriptStore';

/** One projected snapshot the view pushes on every ChatState.onMessagesChanged
 *  + streaming transition. Carries the full read-model (messages + active stream
 *  + the welcome/loading/hydration chrome) so every store field flows through the
 *  single `subscribe` channel — the engine has no direct handle to the store. */
export interface TranscriptSnapshot {
  messages: ChatMessage[];
  activeStream: ActiveStreamState | null;
  /** Welcome greeting text; empty string hides it (e.g. once messages exist). */
  greeting: string;
  /** Non-null while a conversation/tab-switch hydration spinner is in flight. */
  loadingText: string | null;
  /** Recorded history-hydration failure banner, or null. */
  hydrationError: TranscriptHydrationError | null;
}

export type TranscriptSubscribe = (onChange: (s: TranscriptSnapshot) => void) => () => void;

/** Vue → engine actions. Thin delegators to SpecoratorView / controllers. */
export interface TranscriptCallbacks {
  subscribe: TranscriptSubscribe;
  /** Rewind a user message (Claude/Codex). */
  onRewind: (messageId: string, mode?: ChatRewindMode) => Promise<void>;
  /** Fork from a user message. */
  onFork: (messageId: string) => Promise<void>;
  /** Whether rewind/fork are eligible for this message index (findRewindContext). */
  isRewindEligible: (messageId: string) => boolean;
  /** Open provider settings (runtime-error card, disabled-provider prompt). */
  openProviderSettings: (providerId: string) => void;
  /** Re-dispatch the user's last turn (runtime-error retry); null when unavailable. */
  onRetryLastTurn: (() => void) | null;
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
