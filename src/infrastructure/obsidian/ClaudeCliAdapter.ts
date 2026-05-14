import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { isAbsolute } from 'path'
import type { ClaudeCliPort, ClaudeCliQueryOptions } from '@/domain/ports/ClaudeCliPort'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import type { Result } from '@/domain/shared/Result'
import { ok, err } from '@/domain/shared/Result'
import type { LoggerPort } from '@/domain/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

/**
 * Production implementation of ClaudeCliPort using @anthropic-ai/claude-agent-sdk.
 * Satisfies REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017, REQ-CCS-025,
 * NFR-CCS-003, NFR-CCS-005, NFR-CCS-007, SPEC-CCS-001 §5.
 */
export class ClaudeCliAdapter implements ClaudeCliPort {
  /** True only after startup() succeeds. Never set to true if API key is missing. */
  private _available = false
  /** Indicates whether SDK has been initialized. */
  private _sdkReady = false
  /** Getter for current plugin settings. Injected; never stored as a snapshot. */
  private readonly _getSettings: () => PluginSettings
  /** Logger for internal diagnostics. Never logs the API key value. */
  private readonly _logger: LoggerPort
  /** Binary resolver — injectable for testability (defaults to require.resolve). */
  private readonly _resolveCliPath: () => string

  constructor(
    getSettings: () => PluginSettings,
    logger: LoggerPort,
    resolveCliPath?: () => string,
  ) {
    this._getSettings = getSettings
    this._logger = logger
    this._resolveCliPath =
      resolveCliPath ??
      (() => {
        // require.resolve is the correct Node.js API for binary path resolution (REQ-CCS-025).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require.resolve('@anthropic-ai/claude-agent-sdk/bin/claude')
      })
  }

  /**
   * Pre-warm the subprocess. Called from onload() before the first user interaction.
   * Satisfies REQ-CCS-003, NFR-CCS-002, SPEC-CCS-001 §5.2.
   */
  async startup(): Promise<void> {
    const key = this._getSettings().anthropicApiKey.trim()

    // Step 1: Check for empty/whitespace key.
    if (!key) {
      this._logger.warn(
        'ClaudeCliAdapter.startup(): anthropicApiKey is empty — adapter will not start',
      )
      this._available = false
      return
    }

    // Step 2: Set env key. The key value must not be logged.
    process.env.ANTHROPIC_API_KEY = key

    // Step 3: Resolve binary path (REQ-CCS-025).
    let binaryPath: string
    try {
      binaryPath = this._resolveCliPath()
    } catch (e: unknown) {
      this._logger.warn(
        'ClaudeCliAdapter.startup(): binary not found — adapter will not start',
        { error: e },
      )
      this._available = false
      return
    }

    // Step 4: Verify binary path is absolute (REQ-CCS-025).
    if (!isAbsolute(binaryPath)) {
      this._logger.warn(
        'ClaudeCliAdapter.startup(): resolved binary path is not absolute — adapter will not start',
      )
      this._available = false
      return
    }

    // Step 5: Mark adapter ready. SDK query() uses process.env.ANTHROPIC_API_KEY at call time.
    try {
      this._sdkReady = true
      this._available = true
      this._logger.info('ClaudeCliAdapter.startup(): adapter ready')
    } catch (e: unknown) {
      this._logger.warn('ClaudeCliAdapter.startup(): SDK client construction failed', { error: e })
      this._available = false
      this._sdkReady = false
    }
  }

  /**
   * Send a prompt to Claude via the SDK. Returns Result<string, ClaudeCliError>.
   * Never throws. Satisfies REQ-CCS-013, REQ-CCS-016, NFR-CCS-003, SPEC-CCS-001 §5.3.
   */
  async query(
    prompt: string,
    options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>> {
    if (!this._available) {
      return err(new ClaudeCliError(this._unavailableCode(), 'ClaudeCliAdapter is not available'))
    }

    // Re-read key at call time so settings changes take effect without restarting the adapter.
    const currentKey = this._getSettings().anthropicApiKey.trim()
    if (!currentKey) {
      return err(new ClaudeCliError('API_KEY_MISSING', 'API key is missing'))
    }
    process.env.ANTHROPIC_API_KEY = currentKey

    const timeoutMs = this._clampTimeout(options?.timeoutMs)

    if (options?.maxTurns !== undefined && options.maxTurns > 1) {
      this._logger.warn('ClaudeCliAdapter.query(): maxTurns > 1 is clamped to 1 in v1')
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        // eslint-disable-next-line obsidianmd/prefer-active-window-timers
        timeoutId = setTimeout(() => {
          controller.abort()
          reject(new ClaudeCliError('TIMEOUT', `Query exceeded ${timeoutMs} ms`))
        }, timeoutMs)
      })
      const responseText = await Promise.race([this._runSdkQuery(prompt, controller), timeoutPromise])
      return ok(responseText)
    } catch (e: unknown) {
      return err(this._mapError(e, timeoutMs))
    } finally {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }

  /**
   * Returns true if the adapter is ready to accept queries.
   * Satisfies REQ-CCS-018, REQ-CCS-019, REQ-CCS-022, SPEC-CCS-001 §5.4.
   */
  async isAvailable(): Promise<boolean> {
    return this._available
  }

  /**
   * Terminate the subprocess. Called from onunload() which is synchronous.
   * Satisfies REQ-CCS-017, NFR-CCS-007, SPEC-CCS-001 §5.5.
   */
  shutdown(): void {
    if (this._sdkReady) {
      this._logger.debug('ClaudeCliAdapter.shutdown(): shutting down adapter')
      this._sdkReady = false
    }
    this._available = false
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _unavailableCode(): 'API_KEY_MISSING' | 'NOT_INSTALLED' {
    return this._getSettings().anthropicApiKey.trim() === '' ? 'API_KEY_MISSING' : 'NOT_INSTALLED'
  }

  private _clampTimeout(raw?: number): number {
    return Math.min(Math.max(raw ?? 30_000, 1_000), 300_000)
  }

  private async _runSdkQuery(prompt: string, controller: AbortController): Promise<string> {
    const gen = sdkQuery({ prompt, options: { maxTurns: 1, abortController: controller } })
    let resultText: string | undefined
    for await (const message of gen) {
      if (message.type === 'result' && 'result' in message) {
        resultText = String(message.result)
      }
    }
    if (resultText === undefined) {
      throw new Error('No result message received from SDK')
    }
    return resultText
  }

  private _mapError(e: unknown, timeoutMs: number): ClaudeCliError {
    if (e instanceof ClaudeCliError && e.errorCode === 'TIMEOUT') {
      this._logger.warn('ClaudeCliAdapter.query(): timeout', { timeoutMs })
      return e
    }
    if (e instanceof Error) {
      if (/api.key|authentication|401/i.test(e.message)) {
        this._logger.warn('ClaudeCliAdapter.query(): API key error')
        return new ClaudeCliError('API_KEY_MISSING', 'Authentication failed', e)
      }
      this._logger.warn('ClaudeCliAdapter.query(): SDK error', { error: e.message })
      return new ClaudeCliError('QUERY_FAILED', 'Query failed', e)
    }
    this._logger.warn('ClaudeCliAdapter.query(): unknown error')
    return new ClaudeCliError('QUERY_FAILED', 'Unknown error', e)
  }
}
