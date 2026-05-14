import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Plain DTO stored in Pinia. Does NOT include file content — content is loaded
 * on-demand at send time via VaultPort.readFile(). Satisfies D-CCS-005.
 */
export interface ContextFileEntry {
  /** Vault-relative path, e.g. "specs/my-feature/requirements.md". Used as unique key. */
  readonly path: string
  /** Display name shown in the chip, e.g. "requirements.md". */
  readonly label: string
  /**
   * True if this entry was added automatically from the active Obsidian editor file.
   * Auto entries: (1) have no remove control, (2) are always placed first in the list,
   * (3) are replaced as a unit when the active file changes.
   */
  readonly isAuto: boolean
}

/**
 * Status of the chat panel's request lifecycle.
 *   idle    — no request in flight, panel ready for input
 *   loading — request sent, awaiting response
 *   error   — last request ended in failure (timeout or query error)
 */
export type ChatStatus = 'idle' | 'loading' | 'error'

/**
 * Subset of ClaudeCliErrorCode values that the store tracks for UI rendering.
 * Only timeout and query_failed appear as error states in the panel;
 * NOT_INSTALLED and API_KEY_MISSING are handled at the availability-check level.
 */
export type ChatErrorType = 'timeout' | 'query_failed'

/**
 * Pinia store for the chat sidebar panel.
 * State holds DTOs only — no domain class instances, no file content in state.
 * Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010,
 * REQ-CCS-013, REQ-CCS-014, REQ-CCS-016, SPEC-CCS-001 §4.
 */
export const useChatStore = defineStore('chat', () => {
  /**
   * Ordered list of context files. Auto entry (isAuto: true) always occupies index 0
   * when present. Manual entries follow in insertion order.
   */
  const contextFiles = ref<ContextFileEntry[]>([])

  /**
   * Current value of the textarea. Bound via v-model to ChatInput.
   * Reset to '' after a successful response. Retained on timeout or query error.
   */
  const userText = ref<string>('')

  /**
   * The last successful response text from Claude. Null until the first success.
   * Cleared when a new request begins (beginRequest).
   */
  const response = ref<string | null>(null)

  /**
   * Current lifecycle state of the chat panel.
   */
  const status = ref<ChatStatus>('idle')

  /**
   * When status === 'error', identifies the specific error type.
   * Null when status is 'idle' or 'loading'.
   */
  const errorType = ref<ChatErrorType | null>(null)

  /**
   * True if the last buildPrompt() call truncated content to stay within the cap.
   * Cleared by beginRequest(). Drives trim notice in ChatResponse.
   */
  const truncated = ref<boolean>(false)

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Appends a file to contextFiles. No-op if a file with the same path already
   * exists (REQ-CCS-009). Auto files should use setActiveFile instead.
   */
  function addContextFile(file: ContextFileEntry): void {
    if (contextFiles.value.some((f) => f.path === file.path)) return
    contextFiles.value.push(file)
  }

  /**
   * Removes the entry whose path matches. No-op if not found.
   */
  function removeContextFile(path: string): void {
    contextFiles.value = contextFiles.value.filter((f) => f.path !== path)
  }

  /**
   * Replaces the auto slot (REQ-CCS-005, REQ-CCS-006).
   * If file is non-null, forces isAuto=true, removes any existing auto entry,
   * then inserts it at index 0.
   * If file is null, removes any existing auto entry.
   * Does not affect manual entries.
   */
  function setActiveFile(file: ContextFileEntry | null): void {
    const manuals = contextFiles.value.filter((f) => !f.isAuto)
    if (file === null) {
      contextFiles.value = manuals
    } else {
      const entry: ContextFileEntry = { ...file, isAuto: true }
      contextFiles.value = [entry, ...manuals]
    }
  }

  /** Sets userText. */
  function setUserText(text: string): void {
    userText.value = text
  }

  /**
   * Sets status='loading', clears response, errorType, truncated.
   * Satisfies REQ-CCS-014.
   */
  function beginRequest(): void {
    status.value = 'loading'
    response.value = null
    errorType.value = null
    truncated.value = false
  }

  /**
   * Sets status='idle', stores text and truncated flag.
   * Satisfies REQ-CCS-013 success path.
   */
  function setResponse(text: string, wasTruncated: boolean): void {
    status.value = 'idle'
    response.value = text
    truncated.value = wasTruncated
  }

  /**
   * Sets status='error', stores errorType, clears response.
   * Satisfies REQ-CCS-016.
   */
  function setError(type: ChatErrorType): void {
    status.value = 'error'
    errorType.value = type
    response.value = null
  }

  /** Clears response and resets to idle. */
  function clearResponse(): void {
    response.value = null
    status.value = 'idle'
    errorType.value = null
    truncated.value = false
  }

  /** Resets state to initial value. */
  function reset(): void {
    contextFiles.value = []
    userText.value = ''
    response.value = null
    status.value = 'idle'
    errorType.value = null
    truncated.value = false
  }

  return {
    contextFiles,
    userText,
    response,
    status,
    errorType,
    truncated,
    addContextFile,
    removeContextFile,
    setActiveFile,
    setUserText,
    beginRequest,
    setResponse,
    setError,
    clearResponse,
    reset,
  }
})
