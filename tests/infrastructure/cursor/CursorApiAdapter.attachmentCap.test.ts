/**
 * T-MPS-044 — CursorApiAdapter attachment-size cap.
 *
 * Satisfies REQ-MPS-044, TST-MPS-29 (adapter half). A 6 MB attachment yields
 * `{ type: 'error', errorCode: 'ATTACHMENT_TOO_LARGE' }` then `done` and
 * the adapter never POSTs.
 */
import { describe, it, expect } from 'vitest'
import { CursorApiAdapter, type CursorQueryOptions } from '@/infrastructure/cursor/CursorApiAdapter'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { StreamDelta } from '@/domain/ports/ChatTransportPort'

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
}

async function collect(iter: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of iter) out.push(d)
  return out
}

function buildAdapter(): {
  adapter: CursorApiAdapter
  fetchCalls: () => number
} {
  const store = new MockSecretStore({ available: true })
  void store.setSecret(SECRET_ID_CURSOR, 'k')
  let calls = 0
  const fakeFetch = async (): Promise<Response> => {
    calls += 1
    throw new Error('fetch should not be called when cap is exceeded')
  }
  const adapter = new CursorApiAdapter({
    secretStore: store,
    logger: silentLogger(),
    fetch: fakeFetch,
    baseUrl: 'https://api.cursor.sh/v1',
    getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
  })
  return { adapter, fetchCalls: () => calls }
}

describe('CursorApiAdapter attachment cap (T-MPS-044, REQ-MPS-044)', () => {
  it('rejects a single attachment over the 5 MB cap without POSTing', async () => {
    const { adapter, fetchCalls } = buildAdapter()
    const options: CursorQueryOptions = {
      attachments: [{ byteLength: 6 * 1024 * 1024 }],
    }
    const deltas = await collect(adapter.queryStream('hi', options))
    expect(fetchCalls()).toBe(0)
    expect(deltas[0]).toMatchObject({ type: 'error' })
    if (deltas[0].type === 'error') {
      expect(deltas[0].error.errorCode).toBe('ATTACHMENT_TOO_LARGE')
    }
    expect(deltas[deltas.length - 1]).toEqual({ type: 'done' })
  })

  it('rejects the aggregate when sum exceeds 5 MB even if each is under', async () => {
    const { adapter, fetchCalls } = buildAdapter()
    const options: CursorQueryOptions = {
      attachments: [
        { byteLength: 3 * 1024 * 1024 },
        { byteLength: 3 * 1024 * 1024 },
      ],
    }
    const deltas = await collect(adapter.queryStream('hi', options))
    expect(fetchCalls()).toBe(0)
    expect(deltas[0]).toMatchObject({ type: 'error' })
    if (deltas[0].type === 'error') {
      expect(deltas[0].error.errorCode).toBe('ATTACHMENT_TOO_LARGE')
    }
  })

  it('excludes vault-sourced attachments from the cap (resolved on adapter side later)', async () => {
    const { adapter } = buildAdapter()
    // Vault attachment ~ 10 MB is excluded from the non-vault total; the
    // remaining non-vault entry is under the cap, so the cap check passes
    // and the adapter proceeds to fetch (which throws in this fixture).
    const options: CursorQueryOptions = {
      attachments: [
        { byteLength: 10 * 1024 * 1024, source: 'vault' },
        { byteLength: 1 * 1024 * 1024 },
      ],
    }
    const deltas = await collect(adapter.queryStream('hi', options))
    // No ATTACHMENT_TOO_LARGE error — the fetch fixture throws, yielding
    // QUERY_FAILED, but the cap path was bypassed correctly.
    const first = deltas[0]
    if (first.type === 'error') {
      expect(first.error.errorCode).not.toBe('ATTACHMENT_TOO_LARGE')
    }
  })
})
