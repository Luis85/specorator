/**
 * T-MPS-064 — Field-driven mock for the Cursor CLI transport. Mirrors
 * `MockClaudeSubprocessAdapter` shape so the standalone browser UI and
 * any `fakeModulePorts()` consumer can swap a Cursor port in without
 * spawning a real `cursor-agent` binary.
 *
 * Satisfies: NFR-MPS-014 (test/mock parity).
 */
import type {
  ChatTransportPort,
  ChatTransportStreamOptions,
  StreamDelta,
} from '@/domain/ports/ChatTransportPort'
import { ChatTransportError } from '@/domain/ports/ChatTransportPort'
import type { TransportLifecyclePort } from '@/domain/ports/TransportLifecyclePort'
import type { SessionId } from '@/domain/chat/SessionId'

export class MockCursorCliAdapter implements ChatTransportPort, TransportLifecyclePort {
  public readonly kind = 'subscription' as const

  available = false
  cannedResponse = ''
  cannedSessionId: SessionId | null = null
  queryError: ChatTransportError | null = null
  delayMs = 0

  readonly queryLog: string[] = []

  /**
   * Optional scripted deltas. When set via `setNextDelta`, the adapter emits
   * these verbatim on the next `queryStream` call instead of the canned
   * response path; consumed once per call (NFR-MPS-014 parity with
   * `MockCursorApiAdapter` and `MockClaudeCliPort`).
   */
  private _nextDeltas: ReadonlyArray<StreamDelta> | null = null

  /** Fluent helper — NFR-MPS-014 parity with the other mock adapters. */
  setAvailability(value: boolean): this {
    this.available = value
    return this
  }

  /** Force the next `queryStream` call to terminate with a single error. */
  setError(error: ChatTransportError | null): this {
    this.queryError = error
    return this
  }

  /** Script the next `queryStream` call's `StreamDelta` sequence. */
  setNextDelta(deltas: ReadonlyArray<StreamDelta>): this {
    this._nextDeltas = deltas
    return this
  }

  async startup(): Promise<void> {
    // No-op.
  }

  shutdown(): void {
    // No-op.
  }

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  isAvailableSync(): boolean {
    return this.available
  }

  async *queryStream(
    prompt: string,
    options?: ChatTransportStreamOptions,
  ): AsyncIterable<StreamDelta> {
    this.queryLog.push(prompt)
    const signal = options?.signal
    if (signal?.aborted === true) {
      yield MockCursorCliAdapter._abortDelta()
      return
    }
    if (this._nextDeltas !== null) {
      const scripted = this._nextDeltas
      this._nextDeltas = null
      for (const d of scripted) yield d
      return
    }
    yield* this._yieldSessionIdIfConfigured(options)
    if (this.delayMs > 0) {
      const aborted = await this._waitOrAbort(signal)
      if (aborted) {
        yield MockCursorCliAdapter._abortDelta()
        return
      }
    }
    if (this.queryError !== null) {
      yield { type: 'error', error: this.queryError }
      return
    }
    if (this.cannedResponse.length > 0) {
      yield { type: 'text', text: this.cannedResponse }
    }
    yield { type: 'done' }
  }

  private static _abortDelta(): StreamDelta {
    return {
      type: 'error',
      error: new ChatTransportError('QUERY_FAILED', 'Request was aborted'),
    }
  }

  private async *_yieldSessionIdIfConfigured(
    options: ChatTransportStreamOptions | undefined,
  ): AsyncIterable<StreamDelta> {
    if (this.cannedSessionId === null) return
    yield { type: 'session-id', sessionId: this.cannedSessionId }
    if (options?.onSessionId !== undefined) {
      try {
        options.onSessionId(this.cannedSessionId)
      } catch {
        // Mirror real adapter — swallow callback errors.
      }
    }
  }

  private _waitOrAbort(signal: AbortSignal | undefined): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const t = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve(false)
      }, this.delayMs)
      const onAbort = (): void => {
        clearTimeout(t)
        resolve(true)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
