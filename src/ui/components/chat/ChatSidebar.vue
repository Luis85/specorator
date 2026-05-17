<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import { tryAsync } from '@/domain/shared/tryAsync';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';
import { useProposalStore } from '@/ui/stores/proposalStore';
import { useClaudeCliPort } from '@/ui/composables/useClaudeCliPort';
import { usePlatform } from '@/ui/composables/usePlatform';
import { useVaultPort } from '@/ui/composables/useVaultPort';
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort';
import { useSettingsPort } from '@/ui/composables/useSettingsPort';
import { useSecretStorePort } from '@/ui/composables/useSecretStorePort';
import { SECRET_ID_ANTHROPIC } from '@/domain/ports';
import { useLoggerPort } from '@/ui/composables/useLoggerPort';
import { useSessionLogWriter } from '@/ui/composables/useSessionLogWriter';
import { buildStagePromptMap } from '@/application/chat/stagePromptMap';
import {
	CONFIRM_MODAL_PORT,
	SETTINGS_VERSION_KEY,
	TRANSPORT_KIND_KEY,
	OPEN_PLUGIN_SETTINGS_KEY,
} from '@/infrastructure/bridge/ports';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import type { ConfirmModalPort, TranslationPort } from '@/domain/ports';
import type { TransportKind } from '@/domain/chat/TransportKind';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { PathValidationError } from '@/application/chat/errors';
import { buildTurnInput } from '@/application/chat/TurnInputBuilder';
import { ChatTurnOrchestrator } from '@/application/chat/ChatTurnOrchestrator';
import { useProposalDecisions } from '@/ui/composables/useProposalDecisions';
import { useInjectedA11yAnnouncer } from '@/ui/composables/useA11yAnnouncer';
import ContextFileList from './ContextFileList.vue';
import ChatInput from './ChatInput.vue';
import ChatResponse from './ChatResponse.vue';
import SubprocessStartingPill from './SubprocessStartingPill.vue';
import SessionResumeIndicator from './SessionResumeIndicator.vue';
import TransportStatusPill from './TransportStatusPill.vue';
import FileWriteProposalCard from './FileWriteProposalCard.vue';
import ChatDegradedState from './ChatDegradedState.vue';

const emit = defineEmits<{
	'select-command': [command: SlashCommand];
}>();

const messagesStore = useMessagesStore();
const threadsStore = useChatThreadsStore();
const streamingStore = useStreamingTurnStore();
const proposalStore = useProposalStore();
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
 * without providing them.
 */
const confirmModalPort = inject<ConfirmModalPort | undefined>(CONFIRM_MODAL_PORT, undefined);
const transportKindRef = inject<Ref<TransportKind> | undefined>(TRANSPORT_KIND_KEY, undefined);
const noopOpenPluginSettings = (): void => {
	/* default for unit tests and the standalone browser UI */
};
const openPluginSettings = inject<() => void>(OPEN_PLUGIN_SETTINGS_KEY, noopOpenPluginSettings);

const { t: tI18n } = useI18n();
const inlineTranslator: TranslationPort = {
	t(key: string, params?: Record<string, unknown>): string {
		return tI18n(key, params ?? {});
	},
};

function generateProposalId(): string {
	return globalThis.crypto.randomUUID();
}

const stagePromptMap = buildStagePromptMap();

// Local reactive state
const available = ref(false);
const availabilityChecked = ref(false);
const containerEl = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null);

// Per-proposal path-validation errors (REQ-ASM-048). Keyed by proposalId; a
// non-null entry forces the card into its 'path-invalid' state.
const proposalPathErrors = ref<Map<string, PathValidationError>>(new Map());

// Last user turn (for Retry — REQ-ASM-050). Captured on each send.
const lastUserTurn = ref<string>('');

/**
 * `AbortController` for the in-flight streaming turn (PR-ASV-2-ui). Non-null
 * while the orchestrator is consuming `queryStream`; cleared on terminal delta.
 */
const inFlightAbort = ref<AbortController | null>(null);

/**
 * WP-7 a11y wave: announcer shared across the agent sidepanel via
 * `A11Y_ANNOUNCER_KEY` (provided by `AgentSidepanelRoot`). When mounted
 * standalone (tests / GitHub Pages demo) `useInjectedA11yAnnouncer` falls
 * back to a fresh local instance so calls are a no-op.
 */
const announcer = useInjectedA11yAnnouncer();

function handleStopGeneration(): void {
	inFlightAbort.value?.abort();
	announcer.announce(tI18n('agent.generationAbortedAnnouncement'));
}

/**
 * WP-7 A11y #5: Esc-aborts. `ChatInput` emits `abort` when the user presses
 * Escape during streaming; mirrors the Stop button click. Centralising here
 * keeps the keyboard path and the mouse path on the same code lane.
 */
function handleAbortFromInput(): void {
	if (inFlightAbort.value === null) return;
	handleStopGeneration();
}

const settingsVersion = inject(SETTINGS_VERSION_KEY, ref(0));
watch(settingsVersion, async () => {
	if (claudeCliPort === undefined) return;
	available.value = await claudeCliPort.isAvailable();
});

let unsubscribeActiveFile: (() => void) | null = null;

function updateActiveFile(
	snapshot: { path: string; basename: string; extension: string } | null,
): void {
	if (snapshot !== null) {
		messagesStore.setActiveFile({
			path: snapshot.path,
			label: `${snapshot.basename}.${snapshot.extension}`,
			isAuto: true,
		});
	} else {
		messagesStore.setActiveFile(null);
	}
}

function focusTextarea(): void {
	const ta = inputRef.value?.textareaEl as HTMLTextAreaElement | null | undefined;
	ta?.focus();
}

/**
 * UX #11 (WP-8) Codex P2: focus the textarea AND dispatch a synthetic
 * `input` event so `ChatInput`'s `handleInput` runs — which is what opens
 * the slash palette / @-mention picker based on the leading character.
 * External `setUserText` alone updates the model but doesn't fire the
 * textarea's `@input` handler, so the picker would stay closed after a
 * starter-tile click.
 */
function focusInputForTilePrefill(): void {
	const ta = inputRef.value?.textareaEl as HTMLTextAreaElement | null | undefined;
	if (ta === null || ta === undefined) return;
	ta.focus();
	ta.setSelectionRange(ta.value.length, ta.value.length);
	ta.dispatchEvent(new Event('input', { bubbles: true }));
}

defineExpose({ focusInputForTilePrefill });

onMounted(async () => {
	if (claudeCliPort !== undefined) {
		available.value = await claudeCliPort.isAvailable();
	}
	availabilityChecked.value = true;

	const snapshot = workspacePort.getActiveFile();
	updateActiveFile(snapshot);
	unsubscribeActiveFile = workspacePort.onActiveFileChanged(updateActiveFile);

	await nextTick();
	if (available.value && !isMobile) {
		focusTextarea();
	} else {
		const heading = containerEl.value?.querySelector(
			'[data-testid="chat-degraded-heading"]',
		) as HTMLElement | null;
		heading?.focus();
	}
});

onUnmounted(() => {
	unsubscribeActiveFile?.();
});

const transportKind = computed<TransportKind>(() => transportKindRef?.value ?? 'api-key');

const activeThreadProposals = computed<
	ReadonlyArray<{ proposal: FileWriteProposal; pathError: PathValidationError | null }>
>(() => {
	const tid = threadsStore.activeThreadId;
	if (tid === null) return [];
	const out: { proposal: FileWriteProposal; pathError: PathValidationError | null }[] = [];
	for (const p of proposalStore.proposals.values()) {
		if (p.threadId !== tid) continue;
		out.push({ proposal: p, pathError: proposalPathErrors.value.get(p.proposalId) ?? null });
	}
	return out;
});

type ResponseState =
	| 'idle'
	| 'loading'
	| 'success'
	| 'trimmed-success'
	| 'timeout'
	| 'error'
	| 'structured-fail';

const responseState = computed<ResponseState>(() => {
	if (messagesStore.status === 'loading') return 'loading';
	const hasActionablePendingProposal = activeThreadProposals.value.some(
		(entry) => entry.proposal.status === 'pending' && entry.pathError === null,
	);
	if (hasActionablePendingProposal) return 'success';
	if (messagesStore.status === 'error') {
		return messagesStore.errorType === 'timeout' ? 'timeout' : 'error';
	}
	if (messagesStore.structuredFail) return 'structured-fail';
	if (messagesStore.response !== null) {
		return messagesStore.truncated ? 'trimmed-success' : 'success';
	}
	if (activeThreadProposals.value.length > 0) return 'success';
	return 'idle';
});

/**
 * Lazily-constructed orchestrator. Holds the four chat-store mutations and
 * the streaming/structured dispatch — see `src/application/chat/ChatTurnOrchestrator.ts`.
 * Constructed once per component instance; re-created when the port reference
 * changes (it doesn't today, but the guard is cheap).
 */
let orchestrator: ChatTurnOrchestrator | null = null;
function getOrchestrator(): ChatTurnOrchestrator {
	if (orchestrator !== null) return orchestrator;
	orchestrator = new ChatTurnOrchestrator({
		claudeCliPort,
		settings: settingsPort,
		vault: vaultPort,
		logger: loggerPort,
		messages: messagesStore,
		threads: threadsStore,
		streaming: streamingStore,
		proposals: proposalStore,
		getSessionLogWriter: () => sessionLogWriterFactory.getWriter(),
		nowIso: () => new Date().toISOString(),
		randomId: () => generateProposalId(),
		abortControllerFactory: () => new AbortController(),
	});
	return orchestrator;
}

// Send handler — orchestrator-routed. The component owns only UI concerns:
// snapshot inputs, surface the AbortController, refocus, and seed the
// per-proposal path-error map for the proposal card.
async function handleSend(): Promise<void> {
	const text = messagesStore.userText.trim();
	if (!text) return;
	if (messagesStore.status === 'loading') return;
	if (!available.value) return;

	// Flip the cross-component request state to `'loading'` SYNCHRONOUSLY before
	// any await, so every gate that depends on `messagesStore.status === 'loading'`
	// (the "New conversation" button in AgentSidepanelRoot, the textarea / send
	// button / context-file list, the orchestrator's own re-entry guard) sees the
	// in-flight turn during the potentially-slow `buildTurnInput()` vault reads.
	// Without this, a fast second Enter or a mid-preflight "New conversation"
	// click could orphan the in-flight response onto a stale activeThreadId
	// (Codex P1 #3254392924).
	messagesStore.setStructuredFail(false);
	streamingStore.resetStreaming();
	messagesStore.beginRequest();

	// WP-7 A11y #5: announce ONCE at the start of the turn so SR users learn
	// that (a) a response is generating and (b) Escape aborts it. The Stop
	// button itself carries `aria-keyshortcuts="Escape"` for the same hint
	// to SRs that walk the focus order.
	announcer.announce(tI18n('agent.generationStartedAnnouncement'));

	lastUserTurn.value = messagesStore.userText;

	const input = await buildTurnInput({
		messages: {
			userText: messagesStore.userText,
			effectiveContextFiles: messagesStore.effectiveContextFiles,
		},
		threads: {
			activeThreadId: threadsStore.activeThreadId,
			chatThreads: threadsStore.chatThreads,
		},
		transportKindRaw: transportKindRef?.value ?? 'api-key',
		stagePromptMap,
		vault: vaultPort,
		workspace: workspacePort,
		settings: settingsPort,
		logger: loggerPort,
	});

	// `onAbortController` fires the moment the orchestrator mints the
	// streaming controller — before any delta arrives. Plugging it into
	// `inFlightAbort` makes the "Stop generation" button visible for the
	// duration of the stream, matching the pre-refactor behaviour.
	const result = await getOrchestrator().sendTurn(input, {
		onAbortController: (controller) => {
			inFlightAbort.value = controller;
		},
	});
	inFlightAbort.value = null;
	if (result.ok && result.value.kind === 'structured-success') {
		const pathError = getOrchestrator().consumePathError(result.value.proposal.proposalId);
		if (pathError !== null) {
			const next = new Map(proposalPathErrors.value);
			next.set(result.value.proposal.proposalId, pathError);
			proposalPathErrors.value = next;
		}
	}
	await nextTick();
	focusTextarea();
}

const proposalDecisions = useProposalDecisions({
	settingsPort,
	vaultPort,
	loggerPort,
	confirmModalPort,
	sessionLogWriterFactory,
	translator: inlineTranslator,
	threadsStore,
	proposalStore,
	proposalPathErrors,
});
/**
 * WP-7 A11y #4: after a proposal Accept/Reject resolves, the card is
 * unmounted by the proposal-store status mutation; without restoring focus
 * to the textarea, focus drops to `<body>` and a keyboard user is stranded.
 * We await the decision (so the card has time to update its `aria-hidden` /
 * unmount surface) then call `focusTextarea()`.
 */
async function handleAcceptProposal(payload: { proposalId: string }): Promise<void> {
	await proposalDecisions.handleAcceptProposal(payload);
	await nextTick();
	focusTextarea();
	announcer.announce(tI18n('agent.proposalDecidedAnnouncement'));
}
async function handleRejectProposal(payload: { proposalId: string }): Promise<void> {
	await proposalDecisions.handleRejectProposal(payload);
	await nextTick();
	focusTextarea();
	announcer.announce(tI18n('agent.proposalDecidedAnnouncement'));
}

async function handleRetryProposal(payload: { proposalId: string }): Promise<void> {
	const proposal = proposalStore.proposals.get(payload.proposalId) ?? null;
	const promptText = proposal?.originPrompt ?? lastUserTurn.value;
	if (promptText.trim() === '') return;
	messagesStore.setUserText(promptText);
	await handleSend();
}

function handleRemoveFile(event: { path: string }): void {
	messagesStore.removeContextFile(event.path);
}

function handleUserTextUpdate(text: string): void {
	messagesStore.setUserText(text);
}

function handleAddContextFile(candidate: { path: string; name: string }): void {
	const existing = messagesStore.contextFiles.find((f) => f.path === candidate.path);
	if (existing?.isAuto === true) {
		messagesStore.removeContextFile(candidate.path);
	}
	messagesStore.addContextFile({
		path: candidate.path,
		label: candidate.name,
		isAuto: false,
	});
}

function handleSelectCommand(command: SlashCommand): void {
	emit('select-command', command);
}

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
		<ChatDegradedState v-if="isMobile" variant="mobile" />

		<!-- Not yet checked (avoid flash of wrong state) -->
		<template v-else-if="!availabilityChecked" />

		<!-- Subscription-transport CLI missing (Codex P2, PR #347). -->
		<ChatDegradedState
			v-else-if="!available && transportKind === 'subscription'"
			variant="cli-missing"
		/>

		<!-- API key missing degraded state (REQ-CCS-018) — api-key transport only. -->
		<ChatDegradedState
			v-else-if="!available && apiKeyMissing"
			variant="api-key-missing"
			@open-settings="openPluginSettings"
		/>

		<!-- SDK unavailable degraded state (REQ-CCS-019) -->
		<ChatDegradedState
			v-else-if="!available && !apiKeyMissing"
			variant="sdk-unavailable"
		/>

		<!-- Ready state -->
		<template v-else>
			<div class="sp-chat__header">
				<h2 class="sp-chat__title">{{ $t('chat.title') }}</h2>
				<SessionResumeIndicator :resumed="streamingStore.sessionResumed" />
				<SubprocessStartingPill :visible="streamingStore.cliStartingUp" />
				<TransportStatusPill :kind="transportKind" />
				<button
					v-if="inFlightAbort !== null"
					type="button"
					class="sp-chat__stop"
					data-testid="chat-stop-generation"
					:aria-label="$t('chat.stopGenerationAriaLabel')"
					aria-keyshortcuts="Escape"
					@click="handleStopGeneration"
				>
					{{ $t('chat.stopGeneration') }}
				</button>
			</div>

			<ContextFileList
				:files="messagesStore.effectiveContextFiles"
				:disabled="messagesStore.status === 'loading'"
				@remove="handleRemoveFile"
			/>

			<hr class="sp-chat__divider" />

			<ChatInput
				ref="inputRef"
				:model-value="messagesStore.userText"
				:disabled="messagesStore.status === 'loading'"
				:loading="messagesStore.status === 'loading'"
				@update:model-value="handleUserTextUpdate"
				@send="handleSend"
				@add-context-file="handleAddContextFile"
				@select-command="handleSelectCommand"
				@abort="handleAbortFromInput"
			/>

			<hr class="sp-chat__divider" />

			<!--
        UX-#1 / UX-#2 (WP-2): the agent sidepanel is the only ChatSidebar
        consumer today. `MessageList` renders the assistant text (and the
        streaming bubble during a turn), so `ChatResponse` runs in non-legacy
        mode — its `success` / `trimmed-success` branches drop the text body
        and the `loading` "Thinking…" copy, leaving only the `proposalCard`
        slot, the trim notice, and the error / structured-fail banners.
      -->
			<ChatResponse
				:state="responseState"
				:text="messagesStore.response ?? undefined"
				:legacy-mode="false"
			>
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

/*
 * UX #16 (WP-8): Stop just aborts a stream — it is not a destructive
 * confirmation. Render with neutral chrome (secondary background, normal
 * border) so the visual weight matches the consequence.
 */
.sp-chat__stop {
	margin-left: auto;
	font-size: 0.75rem;
	font-weight: 500;
	padding: 0.25rem 0.625rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
	color: var(--text-normal);
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-chat__stop:hover {
	background: var(--interactive-hover);
}
</style>
