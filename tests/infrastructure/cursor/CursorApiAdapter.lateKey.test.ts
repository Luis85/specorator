/**
 * T-MPS-041 — CursorApiAdapter reads the key at query time, not construction.
 *
 * Satisfies REQ-MPS-013, TST-MPS-08. Adapter is instantiated with an empty
 * secret store; key is added later via SecretStorePort.setSecret; subsequent
 * queryStream() must succeed without rebuilding the adapter.
 */
import { describe, it, expect } from 'vitest'
import { CursorApiAdapter } from '@/infrastructure/cursor/CursorApiAdapter'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { StreamDelta } from '@/domain/ports/ChatTransportPort'

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
}

/** Minimal SSE body that emits one text delta and a terminal `done`. */
function makeSseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = [
    'event: message_delta\ndata: {"text":"hi"}\n\n',
    'event: done\ndata: \n\n',
  ]
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

async function collect(iter: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of iter) out.push(d)
  return out
}

describe('CursorApiAdapter late key read (T-MPS-041)', () => {
  it('reads the key at every queryStream call (REQ-MPS-013)', async () => {
    const store = new MockSecretStore({ available: true })
    let fetchCalls = 0
    let observedAuth: string | undefined
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      fetchCalls += 1
      const headers = init?.headers as Record<string, string>
      observedAuth = headers['Authorization']
      return new Response(makeSseStream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }) as unknown as typeof globalThis.fetch

    const adapter = new CursorApiAdapter({
      secretStore: store,
      logger: silentLogger(),
      fetch: fakeFetch,
      baseUrl: 'https://api.cursor.sh/v1',
      getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
    })

    // First call: no key stored → API_KEY_MISSING + done. No network.
    const first = await collect(adapter.queryStream('hello'))
    expect(fetchCalls).toBe(0)
    expect(first[0]).toMatchObject({ type: 'error' })
    if (first[0].type === 'error') {
      expect(first[0].error.errorCode).toBe('API_KEY_MISSING')
    }
    expect(first[first.length - 1]).toEqual({ type: 'done' })

    // Set the key after construction, then call again.
    await store.setSecret(SECRET_ID_CURSOR, 'late-key-value')
    const second = await collect(adapter.queryStream('hello again'))
    expect(fetchCalls).toBe(1)
    expect(observedAuth).toBe('Bearer late-key-value')
    expect(second).toContainEqual({ type: 'text', text: 'hi' })
    expect(second[second.length - 1]).toEqual({ type: 'done' })
  })
})
