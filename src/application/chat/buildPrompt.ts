/**
 * Assembles a single prompt string from the user's message and context file contents.
 * Pure function: no side effects, no I/O.
 * Satisfies REQ-CCS-005, REQ-CCS-012, NFR-CCS-008.
 */

/**
 * One context file with its content. Used only within the application layer
 * during prompt assembly. Never stored in Pinia.
 */
export interface ContextFile {
  /** Vault-relative path. */
  readonly path: string
  /** Display label (filename). */
  readonly label: string
  /**
   * True if this is the automatically included active file.
   * The active file has a floor of MIN_ACTIVE_FILE_CHARS characters
   * and is dropped/truncated last.
   */
  readonly isAuto: boolean
  /** Full raw content read from VaultPort.readFile(). May be empty string. */
  readonly content: string
}

export interface BuildPromptResult {
  /** Fully assembled prompt string to pass directly to ClaudeCliPort.query(). */
  readonly prompt: string
  /**
   * True if any content was removed or shortened to stay within the token cap.
   * The UI must show the trim notice when this is true (REQ-CCS-012).
   */
  readonly truncated: boolean
}

const DEFAULT_TOKEN_CAP = 50_000
const CHARS_PER_TOKEN = 4
const MIN_ACTIVE_FILE_CHARS = 500

function assemblePrompt(userText: string, files: ReadonlyArray<ContextFile>): string {
  if (files.length === 0) {
    return userText
  }
  const preamble = 'The following files are provided for context:\n\n'
  const fileSections = files
    .map((f) => `---\nFile: ${f.path}\n---\n${f.content}\n\n`)
    .join('')
  const separator = '---\n\n'
  return preamble + fileSections + separator + userText
}

/**
 * Assembles a single prompt string from the user's message and context file contents.
 *
 * @param userText - The user's raw message text (may be empty; callers must guard).
 * @param contextFiles - Ordered array of context files. Active file (isAuto: true)
 *                       must appear first if present; callers must enforce ordering.
 * @param options.tokenCap - Maximum allowed tokens. Default: 50 000.
 *                           Character budget = tokenCap × 4 (4 chars/token approximation).
 */
export function buildPrompt(
  userText: string,
  contextFiles: ReadonlyArray<ContextFile>,
  options?: { readonly tokenCap?: number },
): BuildPromptResult {
  const charBudget = (options?.tokenCap ?? DEFAULT_TOKEN_CAP) * CHARS_PER_TOKEN

  // Step 1: Build the full prompt string.
  const fullPrompt = assemblePrompt(userText, contextFiles)

  // Step 2: If within budget, return as-is.
  if (fullPrompt.length <= charBudget) {
    return { prompt: fullPrompt, truncated: false }
  }

  // Step 3: Separate auto and manual files.
  const autoFiles = contextFiles.filter((f) => f.isAuto)
  const manualFiles = [...contextFiles.filter((f) => !f.isAuto)]

  // Step 4: Remove manual files LIFO until under budget or exhausted.
  let assembled = assemblePrompt(userText, [...autoFiles, ...manualFiles])

  while (assembled.length > charBudget && manualFiles.length > 0) {
    manualFiles.pop()
    assembled = assemblePrompt(userText, [...autoFiles, ...manualFiles])
  }

  // Step 5: If now within budget, return truncated.
  if (assembled.length <= charBudget) {
    return { prompt: assembled, truncated: true }
  }

  // Step 6: If auto file exists and still over budget, trim from the end.
  if (autoFiles.length > 0) {
    const autoFile = autoFiles[0]
    const surplus = assembled.length - charBudget

    const trimmedContent =
      autoFile.content.length - surplus >= MIN_ACTIVE_FILE_CHARS
        ? autoFile.content.slice(0, autoFile.content.length - surplus)
        : autoFile.content.slice(0, MIN_ACTIVE_FILE_CHARS)

    const trimmedAutoFile: ContextFile = { ...autoFile, content: trimmedContent }
    assembled = assemblePrompt(userText, [trimmedAutoFile, ...manualFiles])
  }

  // Step 7: Hard-truncate if still over budget (e.g. userText alone exceeds budget).
  if (assembled.length > charBudget) {
    assembled = assembled.slice(0, charBudget)
  }

  // Step 8: Return truncated.
  return { prompt: assembled, truncated: true }
}
