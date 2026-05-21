/**
 * T-MPS-043 — CursorApiAdapter never logs the key, request body, or
 * `Authorization` header.
 *
 * Satisfies NFR-MPS-001, NFR-MPS-002, TST-MPS-09 (adapter half).
 */
import { describe, it, expect } from 'vitest'
import { CursorApiAdapter } from '@/infrastructure/cursor/CursorApiAdapter'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { StreamDelta } from '@/domain/ports/ChatTransportPort'

const SECRET_VALUE = 'sk-cursor-very-secret-do-not-log-12345'
const PROMPT_VALUE = 'private prompt body must not appear in logs'

interface LogCall {
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly args: unknown[]
}

function recordingLogger() {
  const calls: LogCall[] = []
  return {
    calls,
    logger: {
      debug: (...args: unknown[]) => calls.push({ level: 'debug', args }),
      info: (...args: unknown[]) => calls.push({ level: 'info', args }),
      warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
      error: (...args: unknown[]) => calls.push({ level: 'error', args }),
    },
  }
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

async function collect(iter: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of iter) out.push(d)
  return out
}

describe('CursorApiAdapter logging discipline (T-MPS-043)', () => {
  it('never includes the API key, prompt body, or Authorization header in any log call', async () => {
    const store = new MockSecretStore({ available: true })
    await store.setSecret(SECRET_ID_CURSOR, SECRET_VALUE)
    const { calls, logger } = recordingLogger()

    // eslint-disable-next-line obsidianmd/prefer-active-doc -- `typeof globalThis.fetch` is the canonical fetch-signature shape; the rule false-positives on type positions.
    const fakeFetch: typeof globalThis.fetch = async (): Promise<Response> =>
      new Response(
        bodyFor(
          'event: message_delta\ndata: {"text":"ok"}\n\n' + 'event: done\ndata: \n\n',
        ),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )

    const adapter = new CursorApiAdapter({
      secretStore: store,
      logger,
      fetch: fakeFetch,
      baseUrl: 'https://api.cursor.sh/v1',
      getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
    })

    await collect(adapter.queryStream(PROMPT_VALUE))

    const serialised = JSON.stringify(calls)
    expect(serialised).not.toContain(SECRET_VALUE)
    expect(serialised).not.toContain(PROMPT_VALUE)
    expect(serialised).not.toContain('Authorization')
    expect(serialised).not.toContain('Bearer ')
  })

  it('does not log the key on the unavailable path (no key stored)', async () => {
    const store = new MockSecretStore({ available: true })
    // intentionally no setSecret — adapter should short-circuit
    const { calls, logger } = recordingLogger()
    const adapter = new CursorApiAdapter({
      secretStore: store,
      logger,
      fetch: async () => {
        throw new Error('must not fetch')
      },
      baseUrl: 'https://api.cursor.sh/v1',
      getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
    })
    const deltas = await collect(adapter.queryStream('whatever'))
    expect(deltas[0]).toMatchObject({ type: 'error' })
    const serialised = JSON.stringify(calls)
    expect(serialised).not.toContain('Bearer ')
  })
})
