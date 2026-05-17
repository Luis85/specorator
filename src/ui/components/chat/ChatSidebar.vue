<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import { tryAsync } from '@/domain/shared/tryAsync';
import { useChatStore } from '@/ui/stores/chatStore';
import { useClaudeCliPort } from '@/ui/composables/useClaudeCliPort';
import { usePlatform } from '@/ui/composables/usePlatform';
import { useVaultPort } from '@/ui/composables/useVaultPort';
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort';
import { useSettingsPort } from '@/ui/composables/useSettingsPort';
import { useSecretStorePort } from '@/ui/composables/useSecretStorePort';
import { SECRET_ID_ANTHROPIC } from '@/domain/ports';
import { useLoggerPort } from '@/ui/composables/useLoggerPort';
import { useSessionLogWriter } from '@/ui/composables/useSessionLogWriter';
import { buildPrompt } from '@/application/chat/buildPrompt';
import type { ContextFile } from '@/application/chat/buildPrompt';
import {
	assembleSystemPrompt,
	getActiveFeatureSlug,
	loadWorkflowStateSnapshot,
} from '@/application/chat/assembleSystemPrompt';
import { buildStagePromptMap } from '@/application/chat/stagePromptMap';
import {
	CONFIRM_MODAL_PORT,
	SETTINGS_VERSION_KEY,
	TRANSPORT_KIND_KEY,
	OPEN_PLUGIN_SETTINGS_KEY,
} from '@/infrastructure/bridge/ports';
import type { SessionId } from '@/domain/chat/SessionId';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import type {
	ConfirmModalPort,
	TranslationPort,
	StreamDelta,
	ClaudeCliErrorCode,
} from '@/domain/ports';
import type { TransportKind } from '@/domain/chat/TransportKind';
import { queryStructured, type StructuredCliCallOptions } from '@/application/chat/queryStructured';
import { proposeFileWrite } from '@/application/chat/proposeFileWrite';
import { validateProposalPath } from '@/application/chat/validateProposalPath';
import {
	commitFileWriteProposal,
	rejectFileWriteProposal,
} from '@/application/chat/commitFileWriteProposal';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema';
import { EnvelopeParseError } from '@/application/chat/errors';
import type { PathValidationError, CommitProposalErrorCode } from '@/application/chat/errors';
import ContextFileList from './ContextFileList.vue';
import ChatInput from './ChatInput.vue';
import ChatResponse from './ChatResponse.vue';
import SubprocessStartingPill from './SubprocessStartingPill.vue';
import SessionResumeIndicator from './SessionResumeIndicator.vue';
import TransportStatusPill from './TransportStatusPill.vue';
import FileWriteProposalCard from './FileWriteProposalCard.vue';

const emit = defineEmits<{
	'select-command': [command: SlashCommand];
}>();

const store = useChatStore();
const claudeCliPort = useClaudeCliPort();
const { isMobile } = usePlatform();
const vaultPort = useVaultPort();
const workspacePort = useWorkspacePort();
const settingsPort = useSettingsPort();
const secretStorePort = useSecretStorePort();
const loggerPort = useLoggerPort();
const sessionLogWriterFactory = useSessionLogWriter();

/**
 * Optional injections wired by `SpecoratorView` (PR-ASM-4 batch 9). Both are
 * optional so unit tests and the standalone browser UI can mount the sidebar
 * without providing them — the proposal flow simply degrades gracefully when
 * `ConfirmModalPort` is missing (overwrite confirmation cannot be shown).
 */
const confirmModalPort = inject<ConfirmModalPort | undefined>(CONFIRM_MODAL_PORT, undefined);
const transportKindRef = inject<Ref<TransportKind> | undefined>(TRANSPORT_KIND_KEY, undefined);
// Routes the chat-degraded recovery CTA to Obsidian's plugin settings tab
// (Codex P2, PR #350). Defaults to a no-op so unit tests and the standalone
// browser UI — which do not have Obsidian's `App` available — can mount the
// sidebar without crashing when the button is clicked.
const noopOpenPluginSettings = (): void => {
	/* default for unit tests and the standalone browser UI */
};
const openPluginSettings = inject<() => void>(OPEN_PLUGIN_SETTINGS_KEY, noopOpenPluginSettings);

/**
 * Vue-i18n composable wired to the EN/DE catalogues in `src/ui/i18n/locales/`.
 * The commit pipeline expects a `TranslationPort`, so we adapt `useI18n().t`
 * to the port shape (T-ASM-074).
 */
const { t: tI18n } = useI18n();
const inlineTranslator: TranslationPort = {
	t(key: string, params?: Record<string, unknown>): string {
		return tI18n(key, params ?? {});
	},
};

/**
 * Generate an id for a new thread / proposal using the Web Crypto API.
 * `crypto.randomUUID()` is available in every environment this plugin runs in
 * (Obsidian's Electron, modern browsers for the standalone UI, and Node ≥19
 * for tests). The previous `Math.random()` fallback was dead code in
 * production — it only ran when `crypto.randomUUID` was undefined, which
 * never occurs in supported environments — and CodeQL flagged it as
 * insecure randomness, so it has been removed (CodeQL alert on PR #350).
 */
function generateThreadId(): string {
	return globalThis.crypto.randomUUID();
}

function generateProposalId(): string {
	return globalThis.crypto.randomUUID();
}

/**
 * Unique id for an in-memory `ChatMessage` (IDEA-ASV-001, agent-sidepanel-v2
 * Increment 2). The id is opaque to callers and used purely as a Vue `:key`
 * in `MessageList.vue`; thread continuity is carried by `threadId`.
 */
function generateMessageId(): string {
	return globalThis.crypto.randomUUID();
}

/**
 * Frozen stage-prompt descriptor table. Built once per component instance and
 * passed to `assembleSystemPrompt` on every send (REQ-ASM-019 — recomputed
 * per send, but the descriptor source is referentially stable).
 */
const stagePromptMap = buildStagePromptMap();

// Local reactive state
const available = ref(false);
const availabilityChecked = ref(false);
const containerEl = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null);

// Structured-output parse failure flag (REQ-ASM-025). Cleared on every new
// send; surfaced via ChatResponse `state='structured-fail'`. Lives on the
// store so the agent sidepanel's "New conversation" handler can reset it —
// Codex P2 finding on PR #369 (without store residency the banner persisted
// across a thread reset because `ChatSidebar` is never remounted).

// Per-proposal path-validation errors (REQ-ASM-048). Keyed by proposalId; a
// non-null entry forces the card into its 'path-invalid' state.
const proposalPathErrors = ref<Map<string, PathValidationError>>(new Map());

// Last user turn (for Retry — REQ-ASM-050). Captured on each send.
const lastUserTurn = ref<string>('');

/**
 * `AbortController` for the in-flight streaming turn (PR-ASV-2-ui). Non-null
 * while `handleSend` is consuming `queryStream`; cleared on terminal delta.
 * Drives the "Stop generation" button: clicking it calls `.abort()` which
 * propagates through the port's stream options to the underlying adapter
 * (subprocess kill or SDK abort), then the stream emits a terminal `error`
 * delta and the handler surfaces a `query_failed` status.
 */
const inFlightAbort = ref<AbortController | null>(null);

function handleStopGeneration(): void {
	inFlightAbort.value?.abort();
}

/**
 * Proposal IDs whose decision (Accept or Reject) is currently in flight. Used
 * by both `handleAcceptProposal` and `handleRejectProposal` to guard against
 * re-entrant clicks and against cross-decision races: a user who clicks
 * Accept and then quickly clicks Reject must NOT produce contradictory
 * audit rows — the second click is a no-op while the first is still
 * resolving (Codex P1, PR #347). Cleared on terminal status flip.
 */
const inFlightDecisions = new Set<string>();

// Settings-version watcher (D-CCS-003)
const settingsVersion = inject(SETTINGS_VERSION_KEY, ref(0));
watch(settingsVersion, async () => {
	if (claudeCliPort === undefined) return;
	available.value = await claudeCliPort.isAvailable();
});

// Active file watcher
let unsubscribeActiveFile: (() => void) | null = null;

function updateActiveFile(
	snapshot: { path: string; basename: string; extension: string } | null,
): void {
	if (snapshot !== null) {
		store.setActiveFile({
			path: snapshot.path,
			label: `${snapshot.basename}.${snapshot.extension}`,
			isAuto: true,
		});
	} else {
		store.setActiveFile(null);
	}
}

function focusTextarea(): void {
	// Access the exposed textareaEl from ChatInput via the component instance
	const ta = inputRef.value?.textareaEl as HTMLTextAreaElement | null | undefined;
	ta?.focus();
}

onMounted(async () => {
	if (claudeCliPort !== undefined) {
		available.value = await claudeCliPort.isAvailable();
	}
	availabilityChecked.value = true;

	// Subscribe to active file changes
	const snapshot = workspacePort.getActiveFile();
	updateActiveFile(snapshot);
	unsubscribeActiveFile = workspacePort.onActiveFileChanged(updateActiveFile);

	await nextTick();
	if (available.value && !isMobile) {
		focusTextarea();
	} else {
		// Focus degraded notice heading
		const heading = containerEl.value?.querySelector(
			'[data-testid="chat-degraded-heading"]',
		) as HTMLElement | null;
		heading?.focus();
	}
});

onUnmounted(() => {
	unsubscribeActiveFile?.();
});

// Transport kind for the pill (REQ-ASM-002). Defaults to 'api-key' when no
// reactive ref is provided — keeps unit tests and standalone UI working.
const transportKind = computed<TransportKind>(() => transportKindRef?.value ?? 'api-key');

// Pending proposals for the active thread; surfaces them into the proposalCard
// slot on ChatResponse. Each entry pairs the proposal DTO with its (optional)
// path-validation error so the card can render the 'path-invalid' state.
const activeThreadProposals = computed<
	ReadonlyArray<{ proposal: FileWriteProposal; pathError: PathValidationError | null }>
>(() => {
	const tid = store.activeThreadId;
	if (tid === null) return [];
	const out: { proposal: FileWriteProposal; pathError: PathValidationError | null }[] = [];
	for (const p of store.proposals.values()) {
		if (p.threadId !== tid) continue;
		out.push({ proposal: p, pathError: proposalPathErrors.value.get(p.proposalId) ?? null });
	}
	return out;
});

// Determine chat response state from store
type ResponseState =
	| 'idle'
	| 'loading'
	| 'success'
	| 'trimmed-success'
	| 'timeout'
	| 'error'
	| 'structured-fail';

const responseState = computed<ResponseState>(() => {
	if (store.status === 'loading') return 'loading';
	// Pending proposal cards take precedence over error/timeout/structured-fail
	// banners (Codex P2, PR #347). A failed or parse-erroring later turn must
	// not hide still-actionable Accept/Reject controls for proposals already
	// on screen — otherwise the user is stranded mid-decision and loses access
	// to the controls until another successful turn occurs. The `loading`
	// state still wins so an in-flight turn is signalled.
	//
	// Path-invalid proposals are excluded: they render as a non-interactive
	// error message (no Accept/Reject buttons) and stay `pending` indefinitely,
	// so treating them as "actionable" would suppress error banners with no
	// benefit to the user (Codex P2, PR #347).
	const hasActionablePendingProposal = activeThreadProposals.value.some(
		(entry) => entry.proposal.status === 'pending' && entry.pathError === null,
	);
	if (hasActionablePendingProposal) return 'success';
	if (store.status === 'error') {
		return store.errorType === 'timeout' ? 'timeout' : 'error';
	}
	if (store.structuredFail) return 'structured-fail';
	if (store.response !== null) {
		return store.truncated ? 'trimmed-success' : 'success';
	}
	// Render success state (empty text) when there are non-pending proposals
	// on the thread so the proposalCard slot is mounted alongside the
	// (potentially empty) response.
	if (activeThreadProposals.value.length > 0) return 'success';
	return 'idle';
});

/**
 * Compute the stage-aware system-prompt suffix for this send (REQ-ASM-013,
 * REQ-ASM-014, REQ-ASM-018, REQ-ASM-019). Resolves the active feature from
 * the current editor file, reads its workflow-state, and assembles a
 * one-shot stage preamble. Any failure falls back to an empty suffix so
 * the send still proceeds (REQ-ASM-015).
 */
async function computeStagePromptContext(
	specsFolder: string,
): Promise<{ slug: string | null; systemPromptSuffix: string }> {
	const activeFile = workspacePort.getActiveFile();
	const slug = getActiveFeatureSlug(activeFile?.path ?? null, specsFolder);
	const snapshot =
		slug !== null
			? await loadWorkflowStateSnapshot(slug, vaultPort, loggerPort, specsFolder)
			: null;
	const systemPromptSuffix = assembleSystemPrompt(snapshot, stagePromptMap);
	return { slug, systemPromptSuffix };
}

/**
 * Load file contents for all context files; failed reads yield empty content.
 */
async function loadContextFileBodies(): Promise<ContextFile[]> {
	// Use the path-deduped view so a file present in both the auto slot and a
	// manual entry is included exactly once in the prompt budget (Codex P2
	// follow-up, PR #351). The underlying manual entry stays in state and
	// resurfaces when the auto slot moves away.
	return Promise.all(
		store.effectiveContextFiles.map(async (entry) => {
			const readResult = await tryAsync(() => vaultPort.readFile(entry.path));
			return {
				path: entry.path,
				label: entry.label,
				isAuto: entry.isAuto,
				content: readResult.ok ? readResult.value : '',
			};
		}),
	);
}

/**
 * Mint a fresh thread record for this turn and evict the previous thread's
 * in-memory message bucket (Codex P2 on PR #369). The `ChatThreadRecord`
 * for the previous thread is intentionally preserved in `chatThreads` —
 * a future thread-switcher UI can still resume its session_id — but the
 * UI-only message bucket would otherwise accumulate unreachably.
 */
function mintRotatedThread(args: {
	previousThreadId: string | null;
	slug: string | null;
	transport: 'api-key' | 'subscription';
	nowIso: string;
}): string {
	const threadId = generateThreadId();
	const fresh: ChatThreadRecord = {
		threadId,
		sessionId: null,
		feature: args.slug,
		logPath: '',
		transport: args.transport,
		createdAt: args.nowIso,
		lastUsedAt: args.nowIso,
	};
	store.upsertThread(fresh);
	store.setActiveThreadId(threadId);
	if (args.previousThreadId !== null && args.previousThreadId !== threadId) {
		store.clearThreadMessages(args.previousThreadId);
		// Codex P2 (PR #369, fifth review): also evict the previous
		// thread's proposals on automatic rotation, mirroring the same
		// fix on the "New conversation" handler. With no thread switcher
		// in Increment 1, proposals (including `envelope.content`
		// payloads) become unreachable but stay resident; repeated
		// `/create` turns across feature switches accumulated unbounded
		// hidden state.
		store.clearThreadProposals(args.previousThreadId);
	}
	return threadId;
}

/**
 * Resolve (or lazily create) the active `ChatThreadRecord`. Returns the
 * thread id and whether this turn carries a resume session id (REQ-ASM-035).
 *
 * Rotates when the active thread's transport OR feature slug no longer
 * matches the resolved values for this turn (Codex P2, PR #350):
 *   - transport mismatch: resuming a session id from a different transport
 *     produces incoherent context and audit metadata;
 *   - feature mismatch: session-log paths are derived from `thread.feature`,
 *     so reusing a `specs/foo/` thread for a `specs/bar/` turn would corrupt
 *     per-feature traceability + resume metadata.
 */
function resolveActiveThread(args: {
	slug: string | null;
	transport: 'api-key' | 'subscription';
}): { threadId: string; resumeSessionId: SessionId | undefined; isResumedTurn: boolean } {
	const nowIso = new Date().toISOString();
	const previousThreadId = store.activeThreadId;
	const existing =
		previousThreadId !== null ? store.chatThreads.get(previousThreadId) : undefined;
	const shouldRotate =
		previousThreadId === null ||
		existing?.transport !== args.transport ||
		existing.feature !== args.slug;
	const threadId = shouldRotate
		? mintRotatedThread({ previousThreadId, slug: args.slug, transport: args.transport, nowIso })
		: previousThreadId;
	const record = store.chatThreads.get(threadId);
	const resumeSessionId = record?.sessionId ?? undefined;
	return { threadId, resumeSessionId, isResumedTurn: resumeSessionId !== undefined };
}

/**
 * Fire-and-forget mirror of a successful turn to the vault (REQ-ASM-040). The
 * writer drops the write silently when no `session_id` has been captured yet
 * (first-ever turn on an `'api-key'` thread). All failures are routed to
 * `loggerPort.warn` so the chat-send path completes normally.
 */
function mirrorTurnToVault(args: {
	threadId: string;
	userMessage: string;
	assistantResponse: string;
}): void {
	const thread = store.chatThreads.get(args.threadId);
	if (thread === undefined) return;
	void sessionLogWriterFactory
		.getWriter()
		.then((writer) =>
			writer.appendUserAssistant(thread, {
				user: args.userMessage,
				assistant: args.assistantResponse,
			}),
		)
		.catch((error: unknown) => {
			loggerPort.warn('SessionLogWriter.appendUserAssistant failed', {
				threadId: args.threadId,
				reason: error instanceof Error ? error.message : String(error),
			});
		});
}

/**
 * Apply success-side store mutations and schedule the vault mirror.
 */
function applySuccessfulTurn(args: {
	threadId: string;
	isResumedTurn: boolean;
	userMessage: string;
	assistantResponse: string;
	truncated: boolean;
}): void {
	store.setResponse(args.assistantResponse, args.truncated);
	store.setUserText('');
	store.markThreadUsed(args.threadId);
	if (args.isResumedTurn) {
		// Flash the resume indicator for this turn only (REQ-ASM-035).
		store.setSessionResumed(true);
	}
	// Mirror this turn to the multi-turn in-memory message log
	// (IDEA-ASV-001, agent-sidepanel-v2 Increment 2). The user turn is
	// appended first; the assistant turn carries the `truncated` flag so the
	// message list can render the per-turn "context trimmed" notice without
	// depending on `store.truncated` (which only describes the latest turn).
	const nowIso = new Date().toISOString();
	store.appendMessage({
		id: generateMessageId(),
		threadId: args.threadId,
		role: 'user',
		text: args.userMessage,
		createdAt: nowIso,
	});
	store.appendMessage({
		id: generateMessageId(),
		threadId: args.threadId,
		role: 'assistant',
		text: args.assistantResponse,
		createdAt: nowIso,
		truncated: args.truncated,
	});
	mirrorTurnToVault({
		threadId: args.threadId,
		userMessage: args.userMessage,
		assistantResponse: args.assistantResponse,
	});
}

/**
 * Heuristic for routing a user message to the structured-output path. Trust-
 * first proposals require the user to explicitly request a file creation via
 * a slash command (`/create-file` or `/create`). Free-text prompts that
 * happen to mention "create file" continue to use `query()` — keeps the
 * structured path opt-in so existing chat flows are unaffected.
 */
function isStructuredIntent(message: string): boolean {
	const trimmed = message.trim().toLowerCase();
	return trimmed.startsWith('/create-file') || trimmed.startsWith('/create ');
}

/**
 * Build a FileWriteProposal DTO from a validated envelope and add it to the
 * store. Records any path-validation error against the proposal so the card
 * renders in 'path-invalid' state (REQ-ASM-048).
 */
function addProposalFromEnvelope(args: {
	envelope: CreateFileEnvelope;
	threadId: string;
	pathError: PathValidationError | null;
	originPrompt: string;
}): FileWriteProposal {
	const proposalId = generateProposalId();
	const proposal: FileWriteProposal = {
		proposalId,
		threadId: args.threadId,
		envelope: args.envelope,
		status: 'pending',
		proposedAt: new Date().toISOString(),
		decidedAt: null,
		failureReason: null,
		originPrompt: args.originPrompt,
	};
	store.addProposal(proposal);
	if (args.pathError !== null) {
		const next = new Map(proposalPathErrors.value);
		next.set(proposalId, args.pathError);
		proposalPathErrors.value = next;
	}
	return proposal;
}

/**
 * Structured-output branch of `handleSend`. Calls `queryStructured`, runs the
 * read-only `proposeFileWrite` to check existence, validates the path, and
 * adds a `FileWriteProposal` to the store. Renders the structured-fail state
 * on parse error (REQ-ASM-025).
 */
async function handleStructuredSend(args: {
	prompt: string;
	systemPromptSuffix: string;
	resumeSessionId: SessionId | undefined;
	isResumedTurn: boolean;
	threadId: string;
	userMessage: string;
	truncated: boolean;
	onSessionId: (id: SessionId) => void;
}): Promise<void> {
	if (claudeCliPort === undefined) {
		store.setError('query_failed');
		return;
	}
	const options: StructuredCliCallOptions = {
		timeoutMs: 30_000,
		systemPromptSuffix: args.systemPromptSuffix,
		resumeSessionId: args.resumeSessionId,
		// REQ-ASM-031 / REQ-ASM-046 — load-bearing: structured threads must
		// capture session_id so the subsequent `appendProposalDecision` finds a
		// non-null sessionId. Without this, the audit row would reject with
		// `SessionLogNoSessionError` and the commit pipeline would surface
		// `SESSION_LOG_FAILED` even though the model itself succeeded.
		onSessionId: args.onSessionId,
	};
	store.setCliStartingUp(true);
	const structuredResult = await queryStructured(claudeCliPort, args.prompt, options);
	store.setCliStartingUp(false);

	if (!structuredResult.ok) {
		if (structuredResult.error instanceof EnvelopeParseError) {
			// Parse failure — surface 'structured-fail' state (REQ-ASM-025) but do
			// not register an error on the store (separate UX from CLI errors).
			store.setStructuredFail(true);
			store.setResponse('', false);
			return;
		}
		// Transport-level error from queryStructured → same error mapping as the
		// free-text path.
		const code = structuredResult.error.errorCode;
		store.setError(code === 'TIMEOUT' ? 'timeout' : 'query_failed');
		return;
	}

	const envelope = structuredResult.value;

	// Read-only preview (REQ-ASM-041). Failure to read the vault is non-fatal:
	// we still surface the proposal so the user can decide; the commit path
	// re-checks file existence.
	const previewResult = await proposeFileWrite(envelope, vaultPort);
	if (!previewResult.ok) {
		loggerPort.warn('proposeFileWrite failed; rendering proposal without preview', {
			path: envelope.path,
			reason: previewResult.error.message,
		});
	}

	// Defence-in-depth path validation (REQ-ASM-048). On failure we still add
	// the proposal so the user sees the rejection in-context, but with a
	// `pathValidationError` that forces the card into 'path-invalid' state.
	const settings = await settingsPort.getSettings();
	const validationResult = validateProposalPath(envelope, settings.specsFolder);
	const pathError = validationResult.ok ? null : validationResult.error;

	addProposalFromEnvelope({
		envelope,
		threadId: args.threadId,
		pathError,
		originPrompt: args.userMessage,
	});

	// Mirror the structured turn to the session log too (the assistant body is
	// an empty string — the proposal card replaces the prose). The `truncated`
	// flag is forwarded from `buildPrompt` so the proposal turn surfaces the
	// same context-trim warning the free-text path does — users must see when
	// a proposal was generated from clipped context (Codex P2, PR #347).
	applySuccessfulTurn({
		threadId: args.threadId,
		isResumedTurn: args.isResumedTurn,
		userMessage: args.userMessage,
		assistantResponse: '',
		truncated: args.truncated,
	});
}

// Send handler
async function handleSend(): Promise<void> {
	const text = store.userText.trim();
	if (!text) return; // REQ-CCS-015: empty text guard
	if (store.status === 'loading') return;
	if (!available.value) return;

	// Snapshot the raw user text *before* beginRequest() so we can mirror it to
	// the session log post-turn — beginRequest does not clear userText, but the
	// success branch below does.
	const userMessage = store.userText;
	lastUserTurn.value = userMessage;

	// Clear any prior structured-fail flag at every new send.
	store.setStructuredFail(false);
	// Codex P2 on PR #372: reset the streaming buffer BEFORE the structured/
	// free-text branch split so every new send starts from empty streaming
	// state. Without this, a previous streamed reply could leave
	// `streamingText` populated when the next turn is routed through
	// `handleStructuredSend()` — during that turn `store.status === 'loading'`,
	// so `MessageList.vue` would treat the stale text as an active stream and
	// render the old assistant output as the current response.
	store.resetStreaming();

	store.beginRequest();

	// Stage-aware system-prompt suffix (REQ-ASM-013, REQ-ASM-014, REQ-ASM-018,
	// REQ-ASM-019). Recomputed every send — no caching. Resolves the active
	// feature from the current editor file, reads its workflow-state, and
	// assembles a one-shot stage preamble. Any failure (no active file, file
	// not under specsFolder, vault read error, malformed frontmatter, unknown
	// stage) falls back to an empty suffix so the send still proceeds.
	const settings = await settingsPort.getSettings();
	const { slug, systemPromptSuffix } = await computeStagePromptContext(settings.specsFolder);

	// ── Session-persistence wiring (T-ASM-057, REQ-ASM-031/034/035/037/040) ──
	// Use the resolved active transport (from `transportKindRef`), NOT the
	// raw `settings.transportKind`. Under `transportKind === 'auto'` the
	// selector may resolve to either subscription or api-key depending on
	// CLI / API-key availability — recording the setting's raw value here
	// would persist `'api-key'` even when the turn actually ran through the
	// subscription adapter, polluting audit logs and resume metadata
	// (Codex P2, PR #350).
	const resolvedKind = transportKind.value;
	const transport: 'api-key' | 'subscription' =
		resolvedKind === 'subscription' ? 'subscription' : 'api-key';
	const { threadId, resumeSessionId, isResumedTurn } = resolveActiveThread({ slug, transport });
	const onSessionId = (id: SessionId): void => {
		store.captureSessionId(threadId, id);
	};

	const loadedFiles = await loadContextFileBodies();
	const { prompt, truncated } = buildPrompt(store.userText, loadedFiles);

	if (claudeCliPort === undefined) {
		store.setError('query_failed');
		return;
	}

	// Structured path (REQ-ASM-021/041). Opt-in via slash command — keeps the
	// free-text path completely unchanged for regular prompts.
	if (isStructuredIntent(userMessage)) {
		await handleStructuredSend({
			prompt,
			systemPromptSuffix,
			resumeSessionId,
			isResumedTurn,
			threadId,
			userMessage,
			truncated,
			onSessionId,
		});
		await nextTick();
		focusTextarea();
		return;
	}

	// Cold-spawn pill (R-ASM-003). Cleared on completion or error.
	store.setCliStartingUp(true);
	// IDEA-ASV-001 Increment 2 (PR-ASV-2-ui): consume the streaming
	// `queryStream` rather than the non-streaming `query`. Text deltas
	// accumulate into `store.streamingText` so `MessageList.vue` can
	// render the in-flight assistant turn live. The exposed
	// `inFlightAbort` ref lets the Stop button cancel mid-stream.
	const abortController = new AbortController();
	inFlightAbort.value = abortController;
	const streamResult = await consumeStream({
		stream: claudeCliPort.queryStream(prompt, {
			timeoutMs: 30_000,
			systemPromptSuffix,
			resumeSessionId,
			onSessionId,
			signal: abortController.signal,
		}),
		threadId,
	});
	inFlightAbort.value = null;
	store.setCliStartingUp(false);

	if (streamResult.kind === 'success') {
		applySuccessfulTurn({
			threadId,
			isResumedTurn,
			userMessage,
			assistantResponse: streamResult.text,
			truncated,
		});
	} else {
		store.setError(streamResult.errorCode === 'TIMEOUT' ? 'timeout' : 'query_failed');
	}
	// Don't call `store.resetStreaming()` here — that also clears
	// `sessionResumed`, which `applySuccessfulTurn` may have just set
	// (REQ-ASM-035 flash-once contract). `streamingText` is cleared by the
	// next turn's `resetStreaming()` at the top of `handleSend`; in the
	// interim the streaming bubble in `MessageList` is gated on
	// `store.status === 'loading'` so it stays hidden in the success state.
	await nextTick();
	focusTextarea();
}

type DrainOutcome =
	| { kind: 'done'; text: string }
	| { kind: 'error'; errorCode: ClaudeCliErrorCode };

/**
 * Dispatch one delta to the store and return a terminal outcome when the
 * stream is over. Extracted from `consumeStream` to keep the async-iterator
 * loop under the project's complexity budget.
 */
function applyStreamDelta(
	delta: StreamDelta,
	chunks: string[],
	threadId: string,
): DrainOutcome | null {
	if (delta.type === 'done') return { kind: 'done', text: chunks.join('') };
	if (delta.type === 'error') return { kind: 'error', errorCode: delta.error.errorCode };
	applyNonTerminalDelta(delta, chunks, threadId);
	return null;
}

function applyNonTerminalDelta(
	delta: Exclude<StreamDelta, { type: 'done' } | { type: 'error' }>,
	chunks: string[],
	threadId: string,
): void {
	switch (delta.type) {
		case 'text':
			chunks.push(delta.text);
			store.appendStreamingDelta(delta.text);
			return;
		case 'session-id':
			store.captureSessionId(threadId, delta.sessionId);
			return;
		case 'thinking':
			store.appendStreamingThinking(delta.text);
			return;
		case 'tool-use-start':
			store.startStreamingToolCall(delta.blockId, delta.toolName, delta.inputJson);
			return;
		case 'tool-use-input-delta':
			store.appendStreamingToolCallInput(delta.blockId, delta.inputJson);
			return;
		case 'tool-use-stop':
			store.finishStreamingToolCall(delta.blockId);
			return;
		case 'usage':
			store.setLastUsage({
				inputTokens: delta.inputTokens,
				outputTokens: delta.outputTokens,
			});
			return;
		case 'compact-boundary':
			// Push a synthetic notice into the per-thread compact-boundary
			// log so `MessageList.vue` can render an inline divider. Without
			// this the auto-compaction event was invisible — hiding a
			// critical history-rewrite transition (Codex P2 on PR #379).
			store.appendCompactBoundaryNotice(threadId, { reason: delta.reason });
			return;
	}
}

/**
 * Drain `queryStream` to a terminal delta. Accumulates `text` deltas into
 * `store.streamingText` so `MessageList.vue` can render the in-flight
 * assistant turn token-by-token. Returns a normalised result describing
 * how the stream terminated:
 *   - `success` with the joined text on a `done` delta
 *   - `error` with the error code on an `error` delta
 * Never throws — a rogue iterable that throws is treated as `query_failed`.
 */
async function consumeStream(args: {
	stream: AsyncIterable<StreamDelta>;
	threadId: string;
}): Promise<{ kind: 'success'; text: string } | { kind: 'error'; errorCode: ClaudeCliErrorCode }> {
	const chunks: string[] = [];
	const drained = await tryAsync(async (): Promise<DrainOutcome | null> => {
		for await (const delta of args.stream) {
			const terminal = applyStreamDelta(delta, chunks, args.threadId);
			if (terminal !== null) return terminal;
		}
		return null;
	});
	if (!drained.ok) {
		return { kind: 'error', errorCode: 'QUERY_FAILED' };
	}
	const outcome = drained.value;
	if (outcome === null) return { kind: 'error', errorCode: 'QUERY_FAILED' };
	if (outcome.kind === 'done') return { kind: 'success', text: outcome.text };
	return { kind: 'error', errorCode: outcome.errorCode };
}

/**
 * Mirror a terminal proposal failure to the session log (best-effort).
 * Used by `handleAcceptProposal`'s pre-commit failure branches
 * (settings-read, revalidation, …) so every terminal outcome carries an
 * audit row regardless of which step rejected. Both `getWriter()` AND
 * `appendProposalDecision` are caught; a logging failure must never
 * block the user-visible status flip (Codex trust-first invariant,
 * PR #350).
 */
async function mirrorTerminalProposalFailure(
	proposal: FileWriteProposal,
	thread: ChatThreadRecord,
	context: string,
): Promise<void> {
	await (async () => {
		const writer = await sessionLogWriterFactory.getWriter();
		await writer.appendProposalDecision({
			thread,
			proposal: {
				envelope: { path: proposal.envelope.path, rationale: undefined },
			},
			decision: 'failed',
			decidedAt: new Date().toISOString(),
		});
	})().catch((thrown: unknown) => {
		loggerPort.warn(`handleAcceptProposal: ${context} audit mirror failed`, {
			proposalId: proposal.proposalId,
			reason: thrown instanceof Error ? thrown.message : String(thrown),
		});
	});
}

/**
 * Look up a proposal by id. Returns `null` if missing (e.g. cleared by reset).
 */
function findProposal(proposalId: string): FileWriteProposal | null {
	return store.proposals.get(proposalId) ?? null;
}

/**
 * Accept handler (REQ-ASM-043). `commitFileWriteProposal` is the **only**
 * sanctioned vault-mutation path for an LLM proposal (NFR-ASM-011); the card
 * UI cannot bypass it.
 */
async function handleAcceptProposal(payload: { proposalId: string }): Promise<void> {
	// Concurrency guard (Codex P1, PR #347). The `inFlightDecisions` Set
	// guards Accept against re-entrance AND against a cross-decision race
	// where the user clicks Reject while an Accept commit is still in
	// flight — both paths share the same set so the second click is a
	// no-op until the first resolves. The terminal-status check below
	// covers the post-resolution case (status already moved out of
	// `pending`).
	if (inFlightDecisions.has(payload.proposalId)) return;
	const proposal = findProposal(payload.proposalId);
	if (proposal === null) return;
	if (proposal.status !== 'pending') return;
	const thread = store.chatThreads.get(proposal.threadId);
	if (thread === undefined) return;
	// Note: the optional `confirmModalPort` is forwarded unconditionally; the
	// commit pipeline only fails when the target path already exists AND no
	// modal is available (the overwrite-gate path needs interactive consent).
	// Non-overwrite Accepts succeed in environments without the optional port
	// (Codex P2, PR #347).
	inFlightDecisions.add(payload.proposalId);
	// Always clear the in-flight lock — a thrown downstream call (e.g.
	// `getWriter()`) would otherwise leave the proposal permanently locked
	// (Codex P2, PR #347). Uses `Promise.prototype.finally` because the
	// project's `no-restricted-syntax` rule forbids raw try/catch (and the
	// same applies to try/finally) outside `src/infrastructure/**`.
	await (async () => {
		// Re-validate the envelope path against the CURRENT specs folder
		// before any vault mutation (Codex P2, PR #350). The proposal was
		// validated at creation time, but settings can change between
		// creation and accept — re-checking here prevents a stale proposal
		// from bypassing containment after a specsFolder change.
		//
		// `getSettings()` can reject under a bridge/vault error; wrap it via
		// `tryAsync` so a transient failure does not strand the proposal in
		// `pending` (Codex P2 #3, PR #350). On read failure we fail the
		// Accept rather than committing under stale settings.
		const settingsResult = await tryAsync(() => settingsPort.getSettings());
		if (!settingsResult.ok) {
			loggerPort.warn(
				'handleAcceptProposal: settingsPort.getSettings() failed during revalidation',
				{
					proposalId: payload.proposalId,
					reason: settingsResult.error.message,
				},
			);
			// Mirror the terminal failure to the session log so the audit
			// trail stays complete even when the pre-commit settings read
			// rejects (Codex P2 #4, PR #350).
			await mirrorTerminalProposalFailure(proposal, thread, 'settings-read-failed');
			store.setProposalStatus(payload.proposalId, 'failed', 'WRITE_FAILED');
			return;
		}
		const currentSettings = settingsResult.value;
		const revalidation = validateProposalPath(proposal.envelope, currentSettings.specsFolder);
		if (!revalidation.ok) {
			const next = new Map(proposalPathErrors.value);
			next.set(payload.proposalId, revalidation.error);
			proposalPathErrors.value = next;
			await mirrorTerminalProposalFailure(proposal, thread, 'revalidation-failed');
			store.setProposalStatus(payload.proposalId, 'failed', 'WRITE_FAILED');
			return;
		}
		const writer = await sessionLogWriterFactory.getWriter();
		const result = await commitFileWriteProposal(proposal, thread, {
			vault: vaultPort,
			logger: loggerPort,
			sessionLog: writer,
			confirmModal: confirmModalPort,
			i18n: inlineTranslator,
			nowIso: () => new Date().toISOString(),
		});
		if (result.ok) {
			store.setProposalStatus(payload.proposalId, 'accepted');
		} else {
			const code: CommitProposalErrorCode = result.error.errorCode;
			store.setProposalStatus(payload.proposalId, 'failed', code);
		}
	})().finally(() => {
		inFlightDecisions.delete(payload.proposalId);
	});
}

/**
 * Reject handler (REQ-ASM-045). Never touches the vault — only writes an
 * audit row via `rejectFileWriteProposal`. Shares the `inFlightDecisions`
 * concurrency guard with Accept so a Reject click cannot append a
 * contradictory audit row while an Accept commit is still resolving for
 * the same proposal (Codex P1, PR #347).
 */
async function handleRejectProposal(payload: { proposalId: string }): Promise<void> {
	if (inFlightDecisions.has(payload.proposalId)) return;
	const proposal = findProposal(payload.proposalId);
	if (proposal === null) return;
	if (proposal.status !== 'pending') return;
	const thread = store.chatThreads.get(proposal.threadId);
	if (thread === undefined) {
		store.setProposalStatus(payload.proposalId, 'rejected');
		return;
	}
	inFlightDecisions.add(payload.proposalId);
	// Always clear the in-flight lock — a thrown downstream call (e.g.
	// `getWriter()`) would otherwise leave the proposal permanently locked
	// (Codex P2, PR #347). See `handleAcceptProposal` for the `Promise.finally`
	// pattern rationale (project rule forbids raw try/catch outside
	// `src/infrastructure/**`).
	await (async () => {
		const writer = await sessionLogWriterFactory.getWriter();
		await rejectFileWriteProposal(proposal, thread, {
			sessionLog: writer,
			logger: loggerPort,
			nowIso: () => new Date().toISOString(),
		});
		store.setProposalStatus(payload.proposalId, 'rejected');
	})().finally(() => {
		inFlightDecisions.delete(payload.proposalId);
	});
}

/**
 * Retry handler (REQ-ASM-050). Re-issues the prior user turn through the
 * same `handleSend` pathway. Previous proposals stay in the audit trail
 * unchanged — `addProposalFromEnvelope` always uses a fresh proposalId.
 */
async function handleRetryProposal(payload: { proposalId: string }): Promise<void> {
	// Resubmit the exact prompt that authored THIS proposal — not the global
	// `lastUserTurn`. With multiple proposal cards in a thread, retrying an
	// older card would otherwise resend a newer prompt and regenerate an
	// unrelated proposal (Codex P2, PR #347).
	const proposal = findProposal(payload.proposalId);
	const promptText = proposal?.originPrompt ?? lastUserTurn.value;
	if (promptText.trim() === '') return;
	store.setUserText(promptText);
	await handleSend();
}

function handleRemoveFile(event: { path: string }): void {
	store.removeContextFile(event.path);
}

function handleUserTextUpdate(text: string): void {
	store.setUserText(text);
}

/**
 * Mention-picker selection (PR-ASV-4 / D-ASV-3). `ChatInput` already
 * replaces the `@<query>` text fragment inline; the sidebar's job is to
 * create the matching context-file chip via `store.addContextFile`.
 */
function handleAddContextFile(candidate: { path: string; name: string }): void {
	// Codex P2 on PR #376: promote auto entry to manual so explicit mention
	// survives editor rotation.
	const existing = store.contextFiles.find((f) => f.path === candidate.path);
	if (existing?.isAuto === true) {
		store.removeContextFile(candidate.path);
	}
	store.addContextFile({
		path: candidate.path,
		label: candidate.name,
		isAuto: false,
	});
}

/**
 * Forward the slash-command-palette selection up to `AgentSidepanelRoot`,
 * which owns the dispatcher (PR-ASV-3, D-ASV-2).
 */
function handleSelectCommand(command: SlashCommand): void {
	emit('select-command', command);
}

// Determine if API key is missing when unavailable. Reads from
// `SecretStorePort` (OS keychain) since the Anthropic key no longer lives in
// the synced `PluginSettings` blob. Codex P2: wrap in `tryAsync` so a
// transient keychain error degrades to "missing" (the same fallback the
// `available === false` branch produces) instead of bubbling up.
async function isApiKeyMissing(): Promise<boolean> {
	if (!secretStorePort.available) return true;
	const outcome = await tryAsync(() => secretStorePort.getSecret(SECRET_ID_ANTHROPIC));
	if (!outcome.ok) return true;
	return (outcome.value ?? '').trim() === '';
}

const apiKeyMissing = ref(false);

onMounted(async () => {
	apiKeyMissing.value = await isApiKeyMissing();
});

watch(availabilityChecked, async () => {
	if (availabilityChecked.value && !available.value) {
		apiKeyMissing.value = await isApiKeyMissing();
	}
});

watch(available, async () => {
	if (!available.value) {
		apiKeyMissing.value = await isApiKeyMissing();
	}
});
</script>

<template>
	<div ref="containerEl" class="sp-chat-sidebar" data-testid="chat-sidebar">
		<!-- Mobile degradation (REQ-CCS-020) -->
		<div v-if="isMobile" class="sp-chat__degraded">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Chat is available on desktop only.
			</h3>
			<p class="sp-chat__degraded-body">
				Open Obsidian on your Mac, Windows, or Linux computer to use the AI assistant.
			</p>
		</div>

		<!-- Not yet checked (avoid flash of wrong state) -->
		<template v-else-if="!availabilityChecked" />

		<!--
      Subscription-transport CLI missing (Codex P2, PR #347). When the user
      has selected the subscription transport, the API key is irrelevant —
      availability depends on the locally-installed `claude` binary. Show
      CLI-install guidance instead of the (useless) API-key copy, even if
      `apiKeyMissing` happens to be true.
    -->
		<div v-else-if="!available && transportKind === 'subscription'" class="sp-chat__degraded">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Claude CLI is not available.
			</h3>
			<p class="sp-chat__degraded-body">
				The subscription transport needs the Claude CLI installed locally. Install Claude Code on
				this device, then reopen this view.
			</p>
		</div>

		<!-- API key missing degraded state (REQ-CCS-018) — api-key transport only. -->
		<div v-else-if="!available && apiKeyMissing" class="sp-chat__degraded">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Chat is not set up yet.
			</h3>
			<p class="sp-chat__degraded-body">
				To use this feature, add your Anthropic key in Settings. Your key is stored privately on
				this device and is never shared.
			</p>
			<button
				type="button"
				class="sp-btn sp-btn--secondary sp-btn--md"
				data-testid="chat-degraded-settings-link"
				@click="openPluginSettings"
			>
				Open settings
			</button>
		</div>

		<!-- SDK unavailable degraded state (REQ-CCS-019) -->
		<div v-else-if="!available && !apiKeyMissing" class="sp-chat__degraded">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				AI assistant is not available right now.
			</h3>
			<p class="sp-chat__degraded-body">
				The AI assistant could not start. This may be a temporary issue. If the problem continues,
				try restarting Obsidian.
			</p>
		</div>

		<!-- Ready state -->
		<template v-else>
			<div class="sp-chat__header">
				<h2 class="sp-chat__title">Ask Claude.</h2>
				<SessionResumeIndicator :resumed="store.sessionResumed" />
				<SubprocessStartingPill :visible="store.cliStartingUp" />
				<TransportStatusPill :kind="transportKind" />
				<button
					v-if="inFlightAbort !== null"
					type="button"
					class="sp-chat__stop"
					data-testid="chat-stop-generation"
					:aria-label="$t('chat.stopGenerationAriaLabel')"
					@click="handleStopGeneration"
				>
					{{ $t('chat.stopGeneration') }}
				</button>
			</div>

			<ContextFileList
				:files="store.effectiveContextFiles"
				:disabled="store.status === 'loading'"
				@remove="handleRemoveFile"
			/>

			<hr class="sp-chat__divider" />

			<ChatInput
				ref="inputRef"
				:model-value="store.userText"
				:disabled="store.status === 'loading'"
				:loading="store.status === 'loading'"
				@update:model-value="handleUserTextUpdate"
				@send="handleSend"
				@add-context-file="handleAddContextFile"
				@select-command="handleSelectCommand"
			/>

			<hr class="sp-chat__divider" />

			<ChatResponse :state="responseState" :text="store.response ?? undefined">
				<template #proposalCard>
					<FileWriteProposalCard
						v-for="entry in activeThreadProposals"
						:key="entry.proposal.proposalId"
						:proposal="entry.proposal"
						:path-validation-error="entry.pathError"
						@accept="handleAcceptProposal"
						@reject="handleRejectProposal"
						@retry="handleRetryProposal"
					/>
				</template>
			</ChatResponse>
		</template>
	</div>
</template>

<style scoped>
/*
 * Sized to content rather than `height: 100%` so the component composes
 * naturally inside `AgentSidepanelRoot` where it sits beneath a scrollable
 * `MessageList`. Hard 100% height made the input/response area extend past
 * the sidepanel viewport once history accumulated, clipping the active
 * controls (Codex P1 on PR #369). Vertical stacking is now driven by the
 * parent: in the agent sidepanel the parent gives ChatSidebar `flex: 0 0
 * auto` and `MessageList` takes the remaining grow space.
 */
.sp-chat-sidebar {
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	box-sizing: border-box;
	flex-shrink: 0;
}

.sp-chat__title {
	margin: 0;
	font-size: 1.125rem;
	font-weight: 700;
	color: var(--text-normal);
}

.sp-chat__header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.sp-chat__divider {
	margin: 0;
	border: none;
	border-top: 1px solid var(--background-modifier-border);
}

.sp-chat__stop {
	margin-left: auto;
	font-size: 0.75rem;
	font-weight: 500;
	padding: 0.25rem 0.625rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-error-border, var(--background-modifier-border));
	background: var(--background-modifier-error, var(--background-secondary));
	color: var(--text-on-accent, var(--text-normal));
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-chat__stop:hover {
	background: var(--background-modifier-error-hover, var(--interactive-hover));
}

.sp-chat__degraded {
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-chat__degraded-heading {
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-chat__degraded-body {
	margin: 0;
	font-size: 0.875rem;
	color: var(--text-muted);
}
</style>
