/**
 * T-MPS-042 — CursorApiAdapter SSE event mapping.
 *
 * Satisfies REQ-MPS-017, REQ-MPS-013. Verifies the design §C8 event mapping
 * for `message_delta`, `tool_use`, `usage`, `done`, and `error`; also
 * verifies the "stream closed without done" recovery (SPEC-MPS-001 §10).
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

function bodyFor(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

function fetchReturning(body: ReadableStream<Uint8Array>): typeof globalThis.fetch {
  return (async () =>
    new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof globalThis.fetch
}

async function adapterWithBody(body: ReadableStream<Uint8Array>) {
  const store = new MockSecretStore({ available: true })
  await store.setSecret(SECRET_ID_CURSOR, 'k')
  return new CursorApiAdapter({
    secretStore: store,
    logger: silentLogger(),
    fetch: fetchReturning(body),
    baseUrl: 'https://api.cursor.sh/v1',
    getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
  })
}

async function collect(iter: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of iter) out.push(d)
  return out
}

describe('CursorApiAdapter SSE mapping (T-MPS-042, REQ-MPS-017)', () => {
  it('maps message_delta to { type: "text" }', async () => {
    const body = bodyFor(
      'event: message_delta\ndata: {"text":"Hello "}\n\n' +
        'event: message_delta\ndata: {"text":"world"}\n\n' +
        'event: done\ndata: \n\n',
    )
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    const texts = deltas.filter((d): d is { type: 'text'; text: string } => d.type === 'text')
    expect(texts.map((t) => t.text).join('')).toBe('Hello world')
    expect(deltas[deltas.length - 1]).toEqual({ type: 'done' })
  })

  it('maps usage to { type: "usage" } with input/output token fields', async () => {
    const body = bodyFor(
      'event: usage\ndata: {"input_tokens":42,"output_tokens":17}\n\n' +
        'event: done\ndata: \n\n',
    )
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    expect(deltas).toContainEqual({ type: 'usage', inputTokens: 42, outputTokens: 17 })
  })

  it('maps tool_use to { type: "tool-use-start" }', async () => {
    const body = bodyFor(
      'event: tool_use\ndata: {"block_id":"b1","name":"bash","input_json":"{\\"cmd\\":\\"ls\\"}"}\n\n' +
        'event: done\ndata: \n\n',
    )
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    expect(deltas).toContainEqual({
      type: 'tool-use-start',
      blockId: 'b1',
      toolName: 'bash',
      inputJson: '{"cmd":"ls"}',
    })
  })

  it('maps error to { type: "error", error: ChatTransportError{QUERY_FAILED} }', async () => {
    const body = bodyFor('event: error\ndata: {"message":"upstream broke"}\n\n')
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    expect(deltas[0]).toMatchObject({ type: 'error' })
    if (deltas[0].type === 'error') {
      expect(deltas[0].error.errorCode).toBe('QUERY_FAILED')
      expect(deltas[0].error.message).toContain('upstream broke')
    }
  })

  it('handles a stream that closes without `done` (SPEC §10 row)', async () => {
    const body = bodyFor('event: message_delta\ndata: {"text":"partial"}\n\n')
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    // First a `text`, then a synthetic `error` for the missing terminator,
    // then `done`.
    expect(deltas[0]).toEqual({ type: 'text', text: 'partial' })
    const error = deltas[deltas.length - 2]
    expect(error.type).toBe('error')
    if (error.type === 'error') {
      expect(error.error.errorCode).toBe('QUERY_FAILED')
      expect(error.error.message).toMatch(/closed unexpectedly/i)
    }
    expect(deltas[deltas.length - 1]).toEqual({ type: 'done' })
  })

  it('treats unknown event names as no-ops (forward-compatible)', async () => {
    const body = bodyFor(
      'event: future_event\ndata: {"some":"thing"}\n\n' +
        'event: message_delta\ndata: {"text":"ok"}\n\n' +
        'event: done\ndata: \n\n',
    )
    const adapter = await adapterWithBody(body)
    const deltas = await collect(adapter.queryStream('hi'))
    // Only the known events translate.
    const types = deltas.map((d) => d.type)
    expect(types).toEqual(['text', 'done'])
  })
})
