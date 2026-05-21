/**
 * Pure builder that snapshots the active chat-panel state into a
 * {@link TurnInput} DTO consumed by `ChatTurnOrchestrator.sendTurn()`
 * (Arch review #9, deepening Arch #1).
 *
 * Reads from:
 *   - the four chat stores (messages / threads / streaming / proposal — only
 *     the first two are needed today; the others are noted in the comments
 *     where they could grow);
 *   - `VaultPort` (to load context-file bodies for `buildPrompt`);
 *   - `LoggerPort` (warnings only — failures fall back to empty content);
 *   - `SettingsPort` (`specsFolder`, transport).
 *
 * Writes to:
 *   - **nothing**. The builder is read-only by contract. The orchestrator
 *     mutates stores, not the builder.
 *
 * The non-store helpers (intent classification, stage prompt assembly,
 * prompt budget) live inside the function so a future migration to the
 * `selectTransport` dispatcher only needs to extend this single seam.
 *
 * Pure-application-layer module (ADR-001 / ADR-008): no `obsidian`, no Vue,
 * no Pinia internals (we accept plain getters from the caller).
 */
import type { VaultPort } from '@/domain/ports/VaultPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { WorkspacePort } from '@/domain/ports/WorkspacePort';
import type { SettingsPort } from '@/domain/ports/SettingsPort';
import type { TransportKind } from '@/domain/chat/TransportKind';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ChatTransportAttachment } from '@/domain/ports/ChatTransportPort';
import { tryAsync } from '@/domain/shared/tryAsync';
import { buildPrompt, type ContextFile } from '@/application/chat/buildPrompt';
import {
	assembleSystemPrompt,
	getActiveFeatureSlug,
	loadWorkflowStateSnapshot,
} from '@/application/chat/assembleSystemPrompt';
import type { StagePromptMap } from '@/application/chat/stagePromptMap';
import type {
	ResolvedTransport,
	ThreadRotationDecision,
	TurnInput,
	TurnIntent,
} from './TurnInput';

/**
 * Minimal projection of the messages store the builder reads. Kept structural
 * (not `useMessagesStore` return type) so tests can pass plain objects.
 */
export interface MessagesSnapshot {
	readonly userText: string;
	readonly effectiveContextFiles: ReadonlyArray<{
		readonly path: string;
		readonly label: string;
		readonly isAuto: boolean;
	}>;
}

/**
 * Minimal projection of the threads store the builder reads.
 */
export interface ThreadsSnapshot {
	readonly activeThreadId: string | null;
	readonly chatThreads: ReadonlyMap<string, ChatThreadRecord>;
}

/**
 * Inputs to `buildTurnInput`. The caller (UI composable / `ChatSidebar`) is
 * responsible for snapshotting the four chat stores into the two shapes
 * above — that keeps the builder framework-agnostic.
 */
/**
 * Snapshot of the chat-input mode flags (WS-8 / WS-10). Plain getters so
 * tests can pass primitive booleans without mounting a Pinia store.
 */
export interface ChatInputModeSnapshot {
	readonly planMode: boolean;
	readonly instructionMode: boolean;
}

export interface BuildTurnInputArgs {
	readonly messages: MessagesSnapshot;
	readonly threads: ThreadsSnapshot;
	readonly transportKindRaw: TransportKind;
	readonly stagePromptMap: StagePromptMap;
	readonly vault: VaultPort;
	readonly workspace: WorkspacePort;
	readonly settings: SettingsPort;
	readonly logger: LoggerPort;
	/**
	 * WS-10 (REQ-MPS-036/037/039): per-turn mode flags. Optional so the
	 * tabbed `SpecoratorView` (which has no ModeIndicators surface yet) can
	 * omit it; the builder treats absence as "plan off / no instruction".
	 */
	readonly mode?: ChatInputModeSnapshot;
	/**
	 * WS-10 (REQ-MPS-040): per-provider selected model id snapshotted from
	 * `chatProviderStore.selectedModel`. Forwarded as
	 * `ChatTransportStreamOptions.model`.
	 */
	readonly selectedModel?: string;
	/**
	 * WS-10 (REQ-MPS-042/043): pending attachments snapshotted from
	 * `attachmentsStore.pending`.
	 */
	readonly attachments?: ReadonlyArray<ChatTransportAttachment>;
}

/**
 * Heuristic for routing a user message to the structured-output path
 * (REQ-ASM-021/041). Trust-first proposals require an explicit slash command —
 * free-text prompts that happen to mention "create file" continue to use
 * `query()`. Centralised here so the orchestrator does not re-derive intent.
 *
 * Exported for tests; not consumed outside this module.
 */
export function isStructuredIntent(message: string): TurnIntent {
	const trimmed = message.trim().toLowerCase();
	if (trimmed.startsWith('/create-file') || trimmed.startsWith('/create ')) {
		return 'structured';
	}
	return 'free-text';
}

/**
 * Resolve the raw transport kind from the optional reactive ref the plugin
 * injects, NOT from `settings.transportKind` (Codex P2, PR #350). Under
 * `'auto'` the selector resolves to either api-key or subscription at runtime;
 * recording the raw setting value would pollute audit + resume metadata.
 *
 * `'degraded'` is normalised to `'api-key'` because the orchestrator's only
 * branch on transport today is for resume-session bookkeeping — degraded
 * sessions don't resume.
 */
function resolveTransport(raw: TransportKind): ResolvedTransport {
	return raw === 'subscription' ? 'subscription' : 'api-key';
}

/**
 * Decide whether to rotate the active thread or reuse it (Codex P2, PR #350).
 * Rotates when:
 *   - no thread is active yet (first send);
 *   - the active thread's transport no longer matches this turn's transport;
 *   - the active thread's feature slug no longer matches this turn's slug.
 *
 * `'reuse'` carries the existing thread id and (when present) its captured
 * session id so the orchestrator can forward it as `resumeSessionId`
 * (REQ-ASM-035).
 */
function decideRotation(
	threads: ThreadsSnapshot,
	slug: string | null,
	transport: ResolvedTransport,
): ThreadRotationDecision {
	const previousThreadId = threads.activeThreadId;
	if (previousThreadId === null) {
		return { kind: 'rotate', previousThreadId };
	}
	const existing = threads.chatThreads.get(previousThreadId);
	// REQ-MPS-005: the on-thread `transport` is the discriminated object; compare
	// against the legacy resolved-transport string via the same Claude mapping
	// the orchestrator applies when minting a fresh thread.
	const existingResolved: ResolvedTransport | undefined =
		existing === undefined
			? undefined
			: existing.transport.mode === 'api'
				? 'api-key'
				: 'subscription';
	if (existingResolved !== transport || existing?.feature !== slug) {
		return { kind: 'rotate', previousThreadId };
	}
	return {
		kind: 'reuse',
		previousThreadId,
		reuseThreadId: previousThreadId,
		reuseSessionId: existing.sessionId ?? undefined,
	};
}

/**
 * Load file contents for all context files; failed reads yield empty content.
 * Uses the messages-store's `effectiveContextFiles` view (path-deduped) so
 * the prompt budget sees each path exactly once.
 */
async function loadContextFileBodies(
	messages: MessagesSnapshot,
	vault: VaultPort,
): Promise<ContextFile[]> {
	return Promise.all(
		messages.effectiveContextFiles.map(async (entry) => {
			const readResult = await tryAsync(() => vault.readFile(entry.path));
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
 * Compute the stage-aware system-prompt suffix (REQ-ASM-013, REQ-ASM-014,
 * REQ-ASM-018, REQ-ASM-019). Recomputed every send — no caching. Any failure
 * (no active file, vault read error, malformed frontmatter, unknown stage)
 * falls back to an empty suffix so the send still proceeds (REQ-ASM-015).
 */
async function computeStagePromptContext(
	specsFolder: string,
	args: BuildTurnInputArgs,
): Promise<{ slug: string | null; systemPromptSuffix: string }> {
	const activeFile = args.workspace.getActiveFile();
	const slug = getActiveFeatureSlug(activeFile?.path ?? null, specsFolder);
	const snapshot =
		slug !== null
			? await loadWorkflowStateSnapshot(slug, args.vault, args.logger, specsFolder)
			: null;
	const systemPromptSuffix = assembleSystemPrompt(snapshot, args.stagePromptMap);
	return { slug, systemPromptSuffix };
}

/**
 * Build a complete {@link TurnInput} DTO. Never throws — vault read failures
 * degrade to empty content; stage-prompt failures degrade to empty suffix.
 *
 * Algorithm (mirrors the order in the pre-refactor `ChatSidebar.handleSend`):
 *   1. Read settings for `specsFolder`.
 *   2. Compute stage-prompt context (slug + system suffix).
 *   3. Resolve transport from the injected raw kind.
 *   4. Decide thread rotation against the threads snapshot.
 *   5. Load context-file bodies via the vault port.
 *   6. Assemble the final prompt + truncation flag through `buildPrompt`.
 *   7. Classify intent (structured vs free-text).
 *   8. Return the sealed envelope.
 */
export async function buildTurnInput(args: BuildTurnInputArgs): Promise<TurnInput> {
	const settings = await args.settings.getSettings();
	const { slug, systemPromptSuffix } = await computeStagePromptContext(
		settings.specsFolder,
		args,
	);
	const transport = resolveTransport(args.transportKindRaw);
	const thread = decideRotation(args.threads, slug, transport);
	const loadedFiles = await loadContextFileBodies(args.messages, args.vault);
	const { prompt, truncated } = buildPrompt(args.messages.userText, loadedFiles);
	const intent = isStructuredIntent(args.messages.userText);
	const ws10Overrides = collectWs10Overrides(args);
	return {
		userMessage: args.messages.userText,
		prompt,
		truncated,
		systemPromptSuffix,
		slug,
		transport,
		intent,
		thread,
		transportKindRaw: args.transportKindRaw,
		...ws10Overrides,
	};
}

/**
 * Collect the WS-10 optional fields (`planMode` / `instructionSuffix` /
 * `model` / `attachments`) into one object so the main `buildTurnInput`
 * function stays under the per-function complexity cap. Each field is only
 * emitted when its source is meaningful (boolean true, non-empty string,
 * non-empty array) so the resulting `TurnInput` stays minimally populated.
 */
type Ws10Mutable = {
	-readonly [K in keyof Pick<
		TurnInput,
		'planMode' | 'instructionSuffix' | 'model' | 'attachments'
	>]?: TurnInput[K];
};

function collectWs10Overrides(args: BuildTurnInputArgs): Partial<TurnInput> {
	const out: Ws10Mutable = {};
	if (args.mode?.planMode === true) out.planMode = true;
	if (
		args.mode?.instructionMode === true &&
		args.messages.userText.startsWith('#')
	) {
		out.instructionSuffix = args.messages.userText.slice(1).trimStart();
	}
	if (args.selectedModel !== undefined && args.selectedModel !== '') {
		out.model = args.selectedModel;
	}
	const attachmentsList = args.attachments ?? [];
	if (attachmentsList.length > 0) {
		out.attachments = attachmentsList;
	}
	return out;
}
