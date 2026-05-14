/**
 * T-CCS-014 — Tests for ClaudeCliAdapter — startup paths, query timeout/error mapping, shutdown.
 * Satisfies REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017, REQ-CCS-025.
 * Maps to: TEST-CCS-002, TEST-CCS-016, TEST-CCS-017, TEST-CCS-025.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

// We mock the SDK module so no real subprocess is spawned in unit tests.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Import after mocks are set up
const { ClaudeCliAdapter } = await import('@/infrastructure/obsidian/ClaudeCliAdapter')

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

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
  let getSettings: () => PluginSettings

  beforeEach(() => {
    bridge = new MockBridge()
    getSettings = () => makeSettings()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('startup()', () => {
    // (a) startup() with empty key: sets _available=false, returns without throwing
    it('with empty anthropicApiKey: _available=false, does not throw', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: '' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge)
      await expect(adapter.startup()).resolves.toBeUndefined()
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('with empty key: logs a warn and does not proceed', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: '' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge)
      await adapter.startup()
      const warnLogs = bridge.logEntries.filter((e) => e.level === 'warn')
      expect(warnLogs.length).toBeGreaterThan(0)
      expect(warnLogs[0].message).toContain('anthropicApiKey is empty')
    })

    // (b) startup() with key but resolver throws: _available=false, does not throw — TEST-CCS-025
    it('with key but resolver throws: _available=false, does not throw', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => {
        throw new Error('MODULE_NOT_FOUND')
      })
      await expect(adapter.startup()).resolves.toBeUndefined()
      expect(await adapter.isAvailable()).toBe(false)
      const warnLogs = bridge.logEntries.filter((e) => e.level === 'warn')
      expect(warnLogs.some((e) => e.message.includes('binary not found'))).toBe(true)
    })

    // (c) startup() success: _available=true
    it('with key and valid resolver: _available=true after startup', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
    })

    // TEST-CCS-002: env key set before SDK usage
    it('sets process.env.ANTHROPIC_API_KEY before binary resolution — TEST-CCS-002', async () => {
      const apiKey = 'sk-ant-env-test'
      getSettings = () => makeSettings({ anthropicApiKey: apiKey })
      let capturedEnv: string | undefined
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => {
        capturedEnv = process.env.ANTHROPIC_API_KEY
        return '/fake/claude'
      })
      await adapter.startup()
      expect(capturedEnv).toBe(apiKey)
    })
  })

  // (d) isAvailable() returns this._available
  describe('isAvailable()', () => {
    it('returns false before startup', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('returns true after successful startup', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
    })
  })

  // (e) query() when unavailable + empty key returns err(API_KEY_MISSING)
  describe('query() when not available', () => {
    it('with empty key returns err(API_KEY_MISSING)', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: '' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge)
      const result = await adapter.query('test prompt')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect(result.error.errorCode).toBe('API_KEY_MISSING')
    })

    // (f) query() when unavailable + non-empty key returns err(NOT_INSTALLED)
    it('with non-empty key but not started returns err(NOT_INSTALLED)', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge)
      const result = await adapter.query('test prompt')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBeInstanceOf(ClaudeCliError)
      expect(result.error.errorCode).toBe('NOT_INSTALLED')
    })
  })

  // (g) query() success path
  describe('query() success path', () => {
    it('returns ok(responseText) from SDK result message', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeSuccessGen('Hello from Claude') as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await adapter.query('test')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toBe('Hello from Claude')
    })
  })

  // (g) query() timeout race — TEST-CCS-016
  describe('query() timeout', () => {
    it('returns err(TIMEOUT) when query exceeds timeoutMs', async () => {
      vi.useFakeTimers()
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeHangingGen() as unknown as ReturnType<typeof sdkModule.query>,
      )

      const queryPromise = adapter.query('test', { timeoutMs: 1_000 })
      vi.advanceTimersByTime(1_001)
      const result = await queryPromise

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('TIMEOUT')
    })
  })

  // (h) query() SDK error mapped to QUERY_FAILED
  describe('query() SDK error mapping', () => {
    it('maps generic SDK error to QUERY_FAILED', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeErrorGen(new Error('Some SDK failure')) as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await adapter.query('test')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('QUERY_FAILED')
    })

    it('maps authentication error to API_KEY_MISSING', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()

      const sdkModule = await import('@anthropic-ai/claude-agent-sdk')
      vi.mocked(sdkModule.query).mockReturnValue(
        makeErrorGen(
          new Error('401 authentication failed: invalid api key'),
        ) as unknown as ReturnType<typeof sdkModule.query>,
      )

      const result = await adapter.query('test')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.errorCode).toBe('API_KEY_MISSING')
    })
  })

  // (i) shutdown() — TEST-CCS-017
  describe('shutdown()', () => {
    it('sets _available=false after shutdown', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()
      expect(await adapter.isAvailable()).toBe(true)
      adapter.shutdown()
      expect(await adapter.isAvailable()).toBe(false)
    })

    it('does not throw when called before startup', () => {
      const adapter = new ClaudeCliAdapter(getSettings, bridge)
      expect(() => { adapter.shutdown() }).not.toThrow()
    })

    it('logs at debug level when adapter was active', async () => {
      getSettings = () => makeSettings({ anthropicApiKey: 'sk-ant-test' })
      const adapter = new ClaudeCliAdapter(getSettings, bridge, () => '/fake/claude')
      await adapter.startup()
      bridge.logEntries.length = 0
      adapter.shutdown()
      const debugLogs = bridge.logEntries.filter((e) => e.level === 'debug')
      expect(debugLogs.length).toBeGreaterThan(0)
    })
  })
})
