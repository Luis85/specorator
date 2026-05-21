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
      yield {
        type: 'error',
        error: new ChatTransportError('QUERY_FAILED', 'Request was aborted'),
      }
      return
    }
    if (this.cannedSessionId !== null) {
      yield { type: 'session-id', sessionId: this.cannedSessionId }
      if (options?.onSessionId !== undefined) {
        try {
          options.onSessionId(this.cannedSessionId)
        } catch {
          // Mirror real adapter — swallow callback errors.
        }
      }
    }
    if (this.delayMs > 0) {
      const aborted = await new Promise<boolean>((resolve) => {
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
      if (aborted) {
        yield {
          type: 'error',
          error: new ChatTransportError('QUERY_FAILED', 'Request was aborted'),
        }
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
}
