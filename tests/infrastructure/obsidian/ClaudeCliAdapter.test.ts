/**
 * T-CCS-014 — Tests for ClaudeCliAdapter — startup paths, query timeout/error mapping, shutdown.
 * Satisfies REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017, REQ-CCS-025.
 * Maps to: TEST-CCS-002, TEST-CCS-016, TEST-CCS-017, TEST-CCS-025.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import { collectStream } from '@/application/chat/collectStream'

// We mock the SDK module so no real subprocess is spawned in unit tests.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Import after mocks are set up
const { ClaudeCliAdapter } = await import('@/infrastructure/obsidian/ClaudeCliAdapter')

/** Returns an async generator that yields one SDKResultSuccess message. */
async function* makeSuccessGen(resultText: string) {
  yield { type: 'result' as const, subtype: 'success' as const, result: resultText, is_error: false }
}

/** Returns an async generator that throws synchronously. */
async function* makeErrorGen(error: Error) {
  throw error
  // unreachable, but satisfies require-yield:
  yield undefined
}

/** Returns an async generator that waits forever (for timeout tests). */
async function* makeHangingGen() {
  await new Promise<void>(() => {})
  yield undefined
}

describe('REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017: ClaudeCliAdapter', () => {
  let bridge: MockBridge
  let getApiKey: () => string

  beforeEach(() => {
    bridge = new MockBridge()
    getApiKey = () => ''
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('startup()', () => {
    it('with empty key: _available=false, does not throw', async () => {
      getApiKey = () => ''
      const adapter = new ClaudeCliAdapter(getApiKey, bridge)
      await expect(adapter.startup()).resolves.toBeUndefined()
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('with empty key: logs a warn and does not proceed', async () => {
      getApiKey = () => ''
      const adapter = new ClaudeCliAdapter(getApiKey, bridge)
      await adapter.startup()
      const warnLogs = bridge.logEntries.filter((e) => e.level === 'warn')
      expect(warnLogs.length).toBeGreaterThan(0)
      expect(warnLogs[0].message).toContain('Anthropic API key is empty')
    })

    // (b) startup() with key but resolver throws: _available=false, does not throw — TEST-CCS-025
    it('with key but resolver throws: _available=false, does not throw', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => {
        throw new Error('MODULE_NOT_FOUND')
      })
      await expect(adapter.startup()).resolves.toBeUndefined()
      expect(await adapter.isAvailable()).toBe(false)
      const warnLogs = bridge.logEntries.filter((e) => e.level === 'warn')
      expect(warnLogs.some((e) => e.message.includes('binary not found'))).toBe(true)
    })

    it('with key and valid resolver: _available=true after startup', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
    })

    // TEST-CCS-002: env key set before SDK usage
    it('sets process.env.ANTHROPIC_API_KEY before binary resolution — TEST-CCS-002', async () => {
      const apiKey = 'sk-ant-env-test'
      getApiKey = () => apiKey
      let capturedEnv: string | undefined
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => {
        capturedEnv = process.env.ANTHROPIC_API_KEY
        return '/fake/claude'
      })
      await adapter.startup()
      expect(capturedEnv).toBe(apiKey)
    })
  })

  describe('isAvailable()', () => {
    it('returns false before startup', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('returns true after successful startup', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
    })
  })

  describe('queryStream() when not available (collected via collectStream)', () => {
    it('with empty key returns err(API_KEY_MISSING)', async () => {
      getApiKey = () => ''
      const adapter = new ClaudeCliAdapter(getApiKey, bridge)
      const result = await collectStream(adapter.queryStream('test prompt'))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect(result.error.errorCode).toBe('API_KEY_MISSING')
    })

    it('with non-empty key but not started returns err(NOT_INSTALLED)', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge)
      const result = await collectStream(adapter.queryStream('test prompt'))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect(result.error.errorCode).toBe('NOT_INSTALLED')
    })
  })

  describe('queryStream() success path (collected via collectStream)', () => {
    it('returns ok(responseText) from SDK result message', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeSuccessGen('Hello from Claude') as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await collectStream(adapter.queryStream('test'))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toBe('Hello from Claude')
    })
  })

  describe('queryStream() timeout (collected via collectStream)', () => {
    it('returns err(TIMEOUT) when query exceeds timeoutMs', async () => {
      vi.useFakeTimers()
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeHangingGen() as unknown as ReturnType<typeof sdkModule.query>,
      )

      const queryPromise = collectStream(adapter.queryStream('test', { timeoutMs: 1_000 }))
      vi.advanceTimersByTime(1_001)
      const result = await queryPromise

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('TIMEOUT')
    })
  })

  describe('queryStream() SDK error mapping (collected via collectStream)', () => {
    it('maps generic SDK error to QUERY_FAILED', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeErrorGen(new Error('Some SDK failure')) as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await collectStream(adapter.queryStream('test'))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('QUERY_FAILED')
    })

    it('maps authentication error to API_KEY_MISSING', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeErrorGen(
          new Error('401 authentication failed: invalid api key'),
        ) as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await collectStream(adapter.queryStream('test'))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('API_KEY_MISSING')
    })
  })

  describe('shutdown()', () => {
    it('sets _available=false after shutdown', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
      adapter.shutdown()
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('does not throw when called before startup', () => {
      const adapter = new ClaudeCliAdapter(getApiKey, bridge)
      expect(() => { adapter.shutdown() }).not.toThrow()
    })

    it('logs at debug level when adapter was active', async () => {
      getApiKey = () => 'sk-ant-test'
      const adapter = new ClaudeCliAdapter(getApiKey, bridge, () => '/fake/claude')
      await adapter.startup()
      bridge.logEntries.length = 0
      adapter.shutdown()
      const debugLogs = bridge.logEntries.filter((e) => e.level === 'debug')
      expect(debugLogs.length).toBeGreaterThan(0)
    })
  })
})
