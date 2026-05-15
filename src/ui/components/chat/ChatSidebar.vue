<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Ref } from 'vue'
import { tryAsync } from '@/domain/shared/tryAsync'
import { useChatStore } from '@/ui/stores/chatStore'
import { useClaudeCliPort } from '@/ui/composables/useClaudeCliPort'
import { usePlatform } from '@/ui/composables/usePlatform'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useSessionLogWriter } from '@/ui/composables/useSessionLogWriter'
import { buildPrompt } from '@/application/chat/buildPrompt'
import type { ContextFile } from '@/application/chat/buildPrompt'
import {
  assembleSystemPrompt,
  getActiveFeatureSlug,
  loadWorkflowStateSnapshot,
} from '@/application/chat/assembleSystemPrompt'
import { buildStagePromptMap } from '@/application/chat/stagePromptMap'
import {
  CONFIRM_MODAL_PORT,
  SETTINGS_VERSION_KEY,
  TRANSPORT_KIND_KEY,
} from '@/infrastructure/bridge/ports'
import type { SessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { ConfirmModalPort, TranslationPort } from '@/domain/ports'
import type { TransportKind } from '@/domain/chat/TransportKind'
import {
  queryStructured,
  type StructuredCliCallOptions,
} from '@/application/chat/queryStructured'
import { proposeFileWrite } from '@/application/chat/proposeFileWrite'
import { validateProposalPath } from '@/application/chat/validateProposalPath'
import {
  commitFileWriteProposal,
  rejectFileWriteProposal,
} from '@/application/chat/commitFileWriteProposal'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'
import { EnvelopeParseError } from '@/application/chat/errors'
import type {
  PathValidationError,
  CommitProposalErrorCode,
} from '@/application/chat/errors'
import ContextFileList from './ContextFileList.vue'
import ChatInput from './ChatInput.vue'
import ChatResponse from './ChatResponse.vue'
import SubprocessStartingPill from './SubprocessStartingPill.vue'
import SessionResumeIndicator from './SessionResumeIndicator.vue'
import TransportStatusPill from './TransportStatusPill.vue'
import FileWriteProposalCard from './FileWriteProposalCard.vue'

const store = useChatStore()
const claudeCliPort = useClaudeCliPort()
const { isMobile } = usePlatform()
const vaultPort = useVaultPort()
const workspacePort = useWorkspacePort()
const settingsPort = useSettingsPort()
const loggerPort = useLoggerPort()
const sessionLogWriterFactory = useSessionLogWriter()

/**
 * Optional injections wired by `SpecoratorView` (PR-ASM-4 batch 9). Both are
 * optional so unit tests and the standalone browser UI can mount the sidebar
 * without providing them — the proposal flow simply degrades gracefully when
 * `ConfirmModalPort` is missing (overwrite confirmation cannot be shown).
 */
const confirmModalPort = inject<ConfirmModalPort | undefined>(CONFIRM_MODAL_PORT, undefined)
const transportKindRef = inject<Ref<TransportKind> | undefined>(TRANSPORT_KIND_KEY, undefined)

/**
 * Vue-i18n composable wired to the EN/DE catalogues in `src/ui/i18n/locales/`.
 * The commit pipeline expects a `TranslationPort`, so we adapt `useI18n().t`
 * to the port shape (T-ASM-074).
 */
const { t: tI18n } = useI18n()
const inlineTranslator: TranslationPort = {
  t(key: string, params?: Record<string, unknown>): string {
    return tI18n(key, params ?? {})
  },
}

/**
 * Generate a UUID for new thread / proposal ids. Falls back to a timestamp-keyed
 * value when `crypto.randomUUID` is missing (older test environments). The
 * fallback is collision-resistant enough for in-memory maps within a session.
 */
function generateUuid(prefix: string): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (c?.randomUUID !== undefined) return c.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function generateThreadId(): string {
  return generateUuid('thread')
}

function generateProposalId(): string {
  return generateUuid('proposal')
}

/**
 * Frozen stage-prompt descriptor table. Built once per component instance and
 * passed to `assembleSystemPrompt` on every send (REQ-ASM-019 — recomputed
 * per send, but the descriptor source is referentially stable).
 */
const stagePromptMap = buildStagePromptMap()

// Local reactive state
const available = ref(false)
const availabilityChecked = ref(false)
const containerEl = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// Structured-output parse failure flag (REQ-ASM-025). Cleared on every new
// send; surfaced via ChatResponse `state='structured-fail'`.
const structuredFail = ref(false)

// Per-proposal path-validation errors (REQ-ASM-048). Keyed by proposalId; a
// non-null entry forces the card into its 'path-invalid' state.
const proposalPathErrors = ref<Map<string, PathValidationError>>(new Map())

// Last user turn (for Retry — REQ-ASM-050). Captured on each send.
const lastUserTurn = ref<string>('')

/**
 * Proposal IDs whose commit is currently in flight. Used by
 * `handleAcceptProposal` to guard against re-entrant clicks (a fast
 * double-click could fire `commitFileWriteProposal` twice for the same
 * proposal, producing duplicate vault writes / audit rows — Codex P1,
 * PR #347). Cleared on terminal status flip.
 */
const inFlightAccepts = new Set<string>()

// Settings-version watcher (D-CCS-003)
const settingsVersion = inject(SETTINGS_VERSION_KEY, ref(0))
watch(settingsVersion, async () => {
  if (claudeCliPort === undefined) return
  available.value = await claudeCliPort.isAvailable()
})

// Active file watcher
let unsubscribeActiveFile: (() => void) | null = null

function updateActiveFile(snapshot: { path: string; basename: string; extension: string } | null): void {
  if (snapshot !== null) {
    store.setActiveFile({
      path: snapshot.path,
      label: `${snapshot.basename}.${snapshot.extension}`,
      isAuto: true,
    })
  } else {
    store.setActiveFile(null)
  }
}

function focusTextarea(): void {
  // Access the exposed textareaEl from ChatInput via the component instance
  const ta = inputRef.value?.textareaEl as HTMLTextAreaElement | null | undefined
  ta?.focus()
}

onMounted(async () => {
  if (claudeCliPort !== undefined) {
    available.value = await claudeCliPort.isAvailable()
  }
  availabilityChecked.value = true

  // Subscribe to active file changes
  const snapshot = workspacePort.getActiveFile()
  updateActiveFile(snapshot)
  unsubscribeActiveFile = workspacePort.onActiveFileChanged(updateActiveFile)

  await nextTick()
  if (available.value && !isMobile) {
    focusTextarea()
  } else {
    // Focus degraded notice heading
    const heading = containerEl.value?.querySelector('[data-testid="chat-degraded-heading"]') as HTMLElement | null
    heading?.focus()
  }
})

onUnmounted(() => {
  unsubscribeActiveFile?.()
})

// Transport kind for the pill (REQ-ASM-002). Defaults to 'api-key' when no
// reactive ref is provided — keeps unit tests and standalone UI working.
const transportKind = computed<TransportKind>(() => transportKindRef?.value ?? 'api-key')

// Pending proposals for the active thread; surfaces them into the proposalCard
// slot on ChatResponse. Each entry pairs the proposal DTO with its (optional)
// path-validation error so the card can render the 'path-invalid' state.
const activeThreadProposals = computed<
  ReadonlyArray<{ proposal: FileWriteProposal; pathError: PathValidationError | null }>
>(() => {
  const tid = store.activeThreadId
  if (tid === null) return []
  const out: { proposal: FileWriteProposal; pathError: PathValidationError | null }[] = []
  for (const p of store.proposals.values()) {
    if (p.threadId !== tid) continue
    out.push({ proposal: p, pathError: proposalPathErrors.value.get(p.proposalId) ?? null })
  }
  return out
})

// Determine chat response state from store
type ResponseState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'trimmed-success'
  | 'timeout'
  | 'error'
  | 'structured-fail'

const responseState = computed<ResponseState>(() => {
  if (store.status === 'loading') return 'loading'
  if (store.status === 'error') {
    return store.errorType === 'timeout' ? 'timeout' : 'error'
  }
  if (structuredFail.value) return 'structured-fail'
  if (store.response !== null) {
    return store.truncated ? 'trimmed-success' : 'success'
  }
  // Render success state (empty text) when there are pending proposals so the
  // proposalCard slot is mounted alongside the (potentially empty) response.
  if (activeThreadProposals.value.length > 0) return 'success'
  return 'idle'
})

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
  const activeFile = workspacePort.getActiveFile()
  const slug = getActiveFeatureSlug(activeFile?.path ?? null, specsFolder)
  const snapshot =
    slug !== null
      ? await loadWorkflowStateSnapshot(slug, vaultPort, loggerPort, specsFolder)
      : null
  const systemPromptSuffix = assembleSystemPrompt(snapshot, stagePromptMap)
  return { slug, systemPromptSuffix }
}

/**
 * Load file contents for all context files; failed reads yield empty content.
 */
async function loadContextFileBodies(): Promise<ContextFile[]> {
  return Promise.all(
    store.contextFiles.map(async (entry) => {
      const readResult = await tryAsync(() => vaultPort.readFile(entry.path))
      return {
        path: entry.path,
        label: entry.label,
        isAuto: entry.isAuto,
        content: readResult.ok ? readResult.value : '',
      }
    }),
  )
}

/**
 * Resolve (or lazily create) the active `ChatThreadRecord`. Returns the
 * thread id and whether this turn carries a resume session id (REQ-ASM-035).
 */
function resolveActiveThread(args: {
  slug: string | null
  transport: 'api-key' | 'subscription'
}): { threadId: string; resumeSessionId: SessionId | undefined; isResumedTurn: boolean } {
  const nowIso = new Date().toISOString()
  let threadId = store.activeThreadId
  if (threadId === null || !store.chatThreads.has(threadId)) {
    threadId = threadId ?? generateThreadId()
    const fresh: ChatThreadRecord = {
      threadId,
      sessionId: null,
      feature: args.slug,
      logPath: '',
      transport: args.transport,
      createdAt: nowIso,
      lastUsedAt: nowIso,
    }
    store.upsertThread(fresh)
    store.setActiveThreadId(threadId)
  }
  const record = store.chatThreads.get(threadId)
  const resumeSessionId = record?.sessionId ?? undefined
  return { threadId, resumeSessionId, isResumedTurn: resumeSessionId !== undefined }
}

/**
 * Fire-and-forget mirror of a successful turn to the vault (REQ-ASM-040). The
 * writer drops the write silently when no `session_id` has been captured yet
 * (first-ever turn on an `'api-key'` thread). All failures are routed to
 * `loggerPort.warn` so the chat-send path completes normally.
 */
function mirrorTurnToVault(args: {
  threadId: string
  userMessage: string
  assistantResponse: string
}): void {
  const thread = store.chatThreads.get(args.threadId)
  if (thread === undefined) return
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
      })
    })
}

/**
 * Apply success-side store mutations and schedule the vault mirror.
 */
function applySuccessfulTurn(args: {
  threadId: string
  isResumedTurn: boolean
  userMessage: string
  assistantResponse: string
  truncated: boolean
}): void {
  store.setResponse(args.assistantResponse, args.truncated)
  store.setUserText('')
  store.markThreadUsed(args.threadId)
  if (args.isResumedTurn) {
    // Flash the resume indicator for this turn only (REQ-ASM-035).
    store.setSessionResumed(true)
  }
  mirrorTurnToVault({
    threadId: args.threadId,
    userMessage: args.userMessage,
    assistantResponse: args.assistantResponse,
  })
}

/**
 * Heuristic for routing a user message to the structured-output path. Trust-
 * first proposals require the user to explicitly request a file creation via
 * a slash command (`/create-file` or `/create`). Free-text prompts that
 * happen to mention "create file" continue to use `query()` — keeps the
 * structured path opt-in so existing chat flows are unaffected.
 */
function isStructuredIntent(message: string): boolean {
  const trimmed = message.trim().toLowerCase()
  return trimmed.startsWith('/create-file') || trimmed.startsWith('/create ')
}

/**
 * Build a FileWriteProposal DTO from a validated envelope and add it to the
 * store. Records any path-validation error against the proposal so the card
 * renders in 'path-invalid' state (REQ-ASM-048).
 */
function addProposalFromEnvelope(args: {
  envelope: CreateFileEnvelope
  threadId: string
  pathError: PathValidationError | null
  originPrompt: string
}): FileWriteProposal {
  const proposalId = generateProposalId()
  const proposal: FileWriteProposal = {
    proposalId,
    threadId: args.threadId,
    envelope: args.envelope,
    status: 'pending',
    proposedAt: new Date().toISOString(),
    decidedAt: null,
    failureReason: null,
    originPrompt: args.originPrompt,
  }
  store.addProposal(proposal)
  if (args.pathError !== null) {
    const next = new Map(proposalPathErrors.value)
    next.set(proposalId, args.pathError)
    proposalPathErrors.value = next
  }
  return proposal
}

/**
 * Structured-output branch of `handleSend`. Calls `queryStructured`, runs the
 * read-only `proposeFileWrite` to check existence, validates the path, and
 * adds a `FileWriteProposal` to the store. Renders the structured-fail state
 * on parse error (REQ-ASM-025).
 */
async function handleStructuredSend(args: {
  prompt: string
  systemPromptSuffix: string
  resumeSessionId: SessionId | undefined
  isResumedTurn: boolean
  threadId: string
  userMessage: string
  onSessionId: (id: SessionId) => void
}): Promise<void> {
  if (claudeCliPort === undefined) {
    store.setError('query_failed')
    return
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
  }
  store.setCliStartingUp(true)
  const structuredResult = await queryStructured(claudeCliPort, args.prompt, options)
  store.setCliStartingUp(false)

  if (!structuredResult.ok) {
    if (structuredResult.error instanceof EnvelopeParseError) {
      // Parse failure — surface 'structured-fail' state (REQ-ASM-025) but do
      // not register an error on the store (separate UX from CLI errors).
      structuredFail.value = true
      store.setResponse('', false)
      return
    }
    // Transport-level error from queryStructured → same error mapping as the
    // free-text path.
    const code = structuredResult.error.errorCode
    store.setError(code === 'TIMEOUT' ? 'timeout' : 'query_failed')
    return
  }

  const envelope = structuredResult.value

  // Read-only preview (REQ-ASM-041). Failure to read the vault is non-fatal:
  // we still surface the proposal so the user can decide; the commit path
  // re-checks file existence.
  const previewResult = await proposeFileWrite(envelope, vaultPort)
  if (!previewResult.ok) {
    loggerPort.warn('proposeFileWrite failed; rendering proposal without preview', {
      path: envelope.path,
      reason: previewResult.error.message,
    })
  }

  // Defence-in-depth path validation (REQ-ASM-048). On failure we still add
  // the proposal so the user sees the rejection in-context, but with a
  // `pathValidationError` that forces the card into 'path-invalid' state.
  const settings = await settingsPort.getSettings()
  const validationResult = validateProposalPath(envelope, settings.specsFolder)
  const pathError = validationResult.ok ? null : validationResult.error

  addProposalFromEnvelope({
    envelope,
    threadId: args.threadId,
    pathError,
    originPrompt: args.userMessage,
  })

  // Mirror the structured turn to the session log too (the assistant body is
  // an empty string — the proposal card replaces the prose).
  applySuccessfulTurn({
    threadId: args.threadId,
    isResumedTurn: args.isResumedTurn,
    userMessage: args.userMessage,
    assistantResponse: '',
    truncated: false,
  })
}

// Send handler
async function handleSend(): Promise<void> {
  const text = store.userText.trim()
  if (!text) return // REQ-CCS-015: empty text guard
  if (store.status === 'loading') return
  if (!available.value) return

  // Snapshot the raw user text *before* beginRequest() so we can mirror it to
  // the session log post-turn — beginRequest does not clear userText, but the
  // success branch below does.
  const userMessage = store.userText
  lastUserTurn.value = userMessage

  // Clear any prior structured-fail flag at every new send.
  structuredFail.value = false

  store.beginRequest()

  // Stage-aware system-prompt suffix (REQ-ASM-013, REQ-ASM-014, REQ-ASM-018,
  // REQ-ASM-019). Recomputed every send — no caching. Resolves the active
  // feature from the current editor file, reads its workflow-state, and
  // assembles a one-shot stage preamble. Any failure (no active file, file
  // not under specsFolder, vault read error, malformed frontmatter, unknown
  // stage) falls back to an empty suffix so the send still proceeds.
  const settings = await settingsPort.getSettings()
  const { slug, systemPromptSuffix } = await computeStagePromptContext(settings.specsFolder)

  // ── Session-persistence wiring (T-ASM-057, REQ-ASM-031/034/035/037/040) ──
  const transport: 'api-key' | 'subscription' =
    settings.transportKind === 'subscription' ? 'subscription' : 'api-key'
  const { threadId, resumeSessionId, isResumedTurn } = resolveActiveThread({ slug, transport })
  const onSessionId = (id: SessionId): void => {
    store.captureSessionId(threadId, id)
  }

  const loadedFiles = await loadContextFileBodies()
  const { prompt, truncated } = buildPrompt(store.userText, loadedFiles)

  if (claudeCliPort === undefined) {
    store.setError('query_failed')
    return
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
      onSessionId,
    })
    await nextTick()
    focusTextarea()
    return
  }

  // Cold-spawn pill (R-ASM-003). Cleared on completion or error.
  store.setCliStartingUp(true)
  const queryResult = await tryAsync(() =>
    claudeCliPort.query(prompt, {
      timeoutMs: 30_000,
      systemPromptSuffix,
      resumeSessionId,
      onSessionId,
    }),
  )
  store.setCliStartingUp(false)

  if (!queryResult.ok) {
    // `claudeCliPort.query` is contracted never to throw (returns a Result),
    // but a rogue mock or future regression could; fall back to query_failed.
    store.setError('query_failed')
    await nextTick()
    focusTextarea()
    return
  }

  const result = queryResult.value
  if (result.ok) {
    applySuccessfulTurn({
      threadId,
      isResumedTurn,
      userMessage,
      assistantResponse: result.value,
      truncated,
    })
  } else {
    store.setError(result.error.errorCode === 'TIMEOUT' ? 'timeout' : 'query_failed')
  }
  await nextTick()
  focusTextarea()
}

/**
 * Look up a proposal by id. Returns `null` if missing (e.g. cleared by reset).
 */
function findProposal(proposalId: string): FileWriteProposal | null {
  return store.proposals.get(proposalId) ?? null
}

/**
 * Accept handler (REQ-ASM-043). `commitFileWriteProposal` is the **only**
 * sanctioned vault-mutation path for an LLM proposal (NFR-ASM-011); the card
 * UI cannot bypass it.
 */
async function handleAcceptProposal(payload: { proposalId: string }): Promise<void> {
  // Re-entrant guard (Codex P1, PR #347). A fast double-click on Accept could
  // fire two commits for the same proposal before the first promise resolves;
  // the second one would race the vault write + audit row. Two guards:
  //   1. The terminal-status check below rejects clicks on proposals that
  //      already moved out of `pending`.
  //   2. The `inFlightAccepts` Set rejects clicks while the first commit is
  //      still in flight (between click 1 and the `setProposalStatus` call
  //      that flips the status to a terminal value).
  if (inFlightAccepts.has(payload.proposalId)) return
  const proposal = findProposal(payload.proposalId)
  if (proposal === null) return
  if (proposal.status !== 'pending') return
  const thread = store.chatThreads.get(proposal.threadId)
  if (thread === undefined) return
  if (confirmModalPort === undefined) {
    // No modal port available → cannot honour REQ-ASM-044 overwrite gate.
    // Surface as a failed proposal rather than silently writing.
    loggerPort.warn('ConfirmModalPort missing; cannot commit proposal', {
      proposalId: payload.proposalId,
    })
    store.setProposalStatus(payload.proposalId, 'failed', 'WRITE_FAILED')
    return
  }
  inFlightAccepts.add(payload.proposalId)
  const writer = await sessionLogWriterFactory.getWriter()
  const result = await commitFileWriteProposal(proposal, thread, {
    vault: vaultPort,
    logger: loggerPort,
    sessionLog: writer,
    confirmModal: confirmModalPort,
    i18n: inlineTranslator,
    nowIso: () => new Date().toISOString(),
  })
  inFlightAccepts.delete(payload.proposalId)
  if (result.ok) {
    store.setProposalStatus(payload.proposalId, 'accepted')
  } else {
    const code: CommitProposalErrorCode = result.error.errorCode
    store.setProposalStatus(payload.proposalId, 'failed', code)
  }
}

/**
 * Reject handler (REQ-ASM-045). Never touches the vault — only writes an
 * audit row via `rejectFileWriteProposal`.
 */
async function handleRejectProposal(payload: { proposalId: string }): Promise<void> {
  const proposal = findProposal(payload.proposalId)
  if (proposal === null) return
  const thread = store.chatThreads.get(proposal.threadId)
  if (thread === undefined) {
    store.setProposalStatus(payload.proposalId, 'rejected')
    return
  }
  const writer = await sessionLogWriterFactory.getWriter()
  await rejectFileWriteProposal(proposal, thread, {
    sessionLog: writer,
    logger: loggerPort,
    nowIso: () => new Date().toISOString(),
  })
  store.setProposalStatus(payload.proposalId, 'rejected')
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
  const proposal = findProposal(payload.proposalId)
  const promptText = proposal?.originPrompt ?? lastUserTurn.value
  if (promptText.trim() === '') return
  store.setUserText(promptText)
  await handleSend()
}

function handleRemoveFile(event: { path: string }): void {
  store.removeContextFile(event.path)
}

function handleUserTextUpdate(text: string): void {
  store.setUserText(text)
}

// Determine if API key is missing when unavailable
async function isApiKeyMissing(): Promise<boolean> {
  const settings = await settingsPort.getSettings()
  // Cast to string|undefined: legacy stored settings may lack this field at runtime.
  return ((settings.anthropicApiKey as string | undefined) ?? '').trim() === ''
}

const apiKeyMissing = ref(false)

onMounted(async () => {
  apiKeyMissing.value = await isApiKeyMissing()
})

watch(availabilityChecked, async () => {
  if (availabilityChecked.value && !available.value) {
    apiKeyMissing.value = await isApiKeyMissing()
  }
})

watch(available, async () => {
  if (!available.value) {
    apiKeyMissing.value = await isApiKeyMissing()
  }
})
</script>

<template>
  <div ref="containerEl" class="sp-chat-sidebar" data-testid="chat-sidebar">
    <!-- Mobile degradation (REQ-CCS-020) -->
    <div v-if="isMobile" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        Chat is available on desktop only.
      </h3>
      <p class="sp-chat__degraded-body">
        Open Obsidian on your Mac, Windows, or Linux computer to use the AI assistant.
      </p>
    </div>

    <!-- Not yet checked (avoid flash of wrong state) -->
    <template v-else-if="!availabilityChecked" />

    <!-- API key missing degraded state (REQ-CCS-018) -->
    <div v-else-if="!available && apiKeyMissing" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        Chat is not set up yet.
      </h3>
      <p class="sp-chat__degraded-body">
        To use this feature, add your Anthropic key in Settings. Your key is stored privately on this device and is never shared.
      </p>
      <RouterLink
        class="sp-btn sp-btn--secondary sp-btn--md"
        to="/settings"
        data-testid="chat-degraded-settings-link"
      >
        Open settings
      </RouterLink>
    </div>

    <!-- SDK unavailable degraded state (REQ-CCS-019) -->
    <div v-else-if="!available && !apiKeyMissing" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        AI assistant is not available right now.
      </h3>
      <p class="sp-chat__degraded-body">
        The AI assistant could not start. This may be a temporary issue. If the problem continues, try restarting Obsidian.
      </p>
    </div>

    <!-- Ready state -->
    <template v-else>
      <div class="sp-chat__header">
        <h2 class="sp-chat__title">Ask Claude.</h2>
        <SessionResumeIndicator :resumed="store.sessionResumed" />
        <SubprocessStartingPill :visible="store.cliStartingUp" />
        <TransportStatusPill :kind="transportKind" />
      </div>

      <ContextFileList
        :files="store.contextFiles"
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
      />

      <hr class="sp-chat__divider" />

      <ChatResponse
        :state="responseState"
        :text="store.response ?? undefined"
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
.sp-chat-sidebar {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  box-sizing: border-box;
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
