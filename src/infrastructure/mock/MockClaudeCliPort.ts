import type { ClaudeCliPort, ClaudeCliQueryOptions } from '@/domain/ports/ClaudeCliPort'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import type { Result } from '@/domain/shared/Result'
import { ok, err } from '@/domain/shared/Result'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Stub implementation of ClaudeCliPort for use in dev mode and unit tests.
 * Satisfies REQ-CCS-022, NFR-CCS-004, SPEC-CCS-001 §6.
 *
 * `available` defaults to false so the standalone browser UI (npm run dev)
 * renders the degraded state without a real subprocess.
 */
export class MockClaudeCliPort implements ClaudeCliPort {
  /**
   * Controls the return value of isAvailable() and the no-op branch of query().
   * Default: false — the standalone browser UI and unit tests start unavailable.
   */
  available = false

  /**
   * Text returned from query() when available === true and queryError === null.
   */
  cannedResponse = 'Mock response from MockClaudeCliPort.'

  /**
   * If non-null, query() returns this error instead of cannedResponse.
   */
  queryError: ClaudeCliError | null = null

  /**
   * Artificial delay for query(). Unit: milliseconds. Default: 0.
   */
  delayMs = 0

  /**
   * Append-only log of every prompt string passed to query().
   */
  readonly queryLog: string[] = []

  async startup(): Promise<void> {
    // No-op. Never throws.
  }

  shutdown(): void {
    // No-op. Never throws.
  }

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  async query(
    prompt: string,
    _options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>> {
    this.queryLog.push(prompt)

    if (!this.available) {
      return err(new ClaudeCliError('NOT_INSTALLED', 'MockClaudeCliPort: not available'))
    }

    if (this.delayMs > 0) await sleep(this.delayMs)

    if (this.queryError !== null) {
      return err(this.queryError)
    }

    return ok(this.cannedResponse)
  }
}
