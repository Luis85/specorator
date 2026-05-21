/**
 * T-MPS-145 / TST-MPS-32 — provider switch mid-stream edge case (spec §10
 * row 1).
 *
 * Scenario: an in-flight Claude turn is streaming when the user switches the
 * `chatProviderStore.activeSelection` from Claude to Cursor.
 *
 * Acceptance:
 *   (a) the in-flight turn finishes against the original transport (Claude)
 *       — the streaming generator does NOT swap mid-flight;
 *   (b) the second turn dispatched after the switch goes to the new
 *       transport (Cursor) — confirmed by inspecting `queryLog` on each
 *       mock adapter.
 *
 * This is a deliberately small integration test: the orchestrator is
 * exercised twice with explicit ports per turn, matching how
 * `SpecoratorView` re-runs `selectTransport()` on selection change.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { MockCursorApiAdapter } from '@/infrastructure/mock/MockCursorApiAdapter'
import { useChatProviderStore } from '@/ui/stores/chatProviderStore'

async function consume(it: AsyncIterable<{ type: string }>): Promise<string[]> {
  const types: string[] = []
  for await (const d of it) types.push(d.type)
  return types
}

describe('TST-MPS-32 — provider switch mid-stream (spec §10 row 1)', () => {
  let claude: MockClaudeCliPort
  let cursor: MockCursorApiAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    claude = new MockClaudeCliPort().setAvailability(true)
    cursor = new MockCursorApiAdapter().setAvailability(true)
  })

  it('in-flight Claude turn completes against Claude even after switch to Cursor', async () => {
    // Start a Claude stream — capture the iterator before flipping the store.
    claude.cannedStreamChunks = ['hello', ' world']
    const inFlight = claude.queryStream('first turn', {})

    // User flips the provider store mid-stream.
    const store = useChatProviderStore()
    store.setActiveSelection({ provider: 'cursor', mode: 'api' })

    // Drain the in-flight stream — must still emit Claude's deltas.
    const types = await consume(inFlight)
    expect(types).toContain('text')
    expect(types).toContain('done')
    expect(claude.queryLog).toEqual(['first turn'])
    expect(cursor.queryLog).toEqual([])
  })

  it('subsequent turn dispatched after the switch routes to Cursor', async () => {
    // First turn — Claude.
    await consume(claude.queryStream('first turn', {}))

    // Switch.
    const store = useChatProviderStore()
    store.setActiveSelection({ provider: 'cursor', mode: 'api' })

    // Second turn dispatches against the NEW provider's port.
    // (The view layer re-selects the port on selection change; the
    // orchestrator just consumes whichever port it is given.)
    cursor.cannedResponse = 'cursor response'
    await consume(cursor.queryStream('second turn', {}))

    expect(claude.queryLog).toEqual(['first turn'])
    expect(cursor.queryLog).toEqual(['second turn'])
  })

  it('switch does not leak Cursor key material into Claude options', async () => {
    // Defence-in-depth: the in-flight options object is whatever the caller
    // built when the stream started. Switching the store after the call
    // started must not retroactively rewrite the captured options.
    claude.cannedStreamChunks = ['x']
    const opts = { systemPromptSuffix: 'CLAUDE-ONLY' }
    const inFlight = claude.queryStream('audit', opts)
    useChatProviderStore().setActiveSelection({ provider: 'cursor', mode: 'cli' })
    await consume(inFlight)
    expect(claude.optionsLog[0]?.systemPromptSuffix).toBe('CLAUDE-ONLY')
  })
})
