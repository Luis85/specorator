/**
 * T-MPS-051 — E2E Cursor key leakage test.
 *
 * Satisfies NFR-MPS-001, TST-MPS-09. The cursor key value must NEVER appear
 * in the persisted `data.json` blob (which rides Obsidian Sync). This test
 * exercises the live `CursorSettingsSection` save path with a real
 * `MockSecretStore` and a tracked settings object, then asserts that after
 * the save:
 *
 *   1. The MockSecretStore holds the key under `SECRET_ID_CURSOR`.
 *   2. The simulated `data.json` blob (specorator settings + every other
 *      sub-key the plugin persists) contains zero matches for the key value.
 *
 * Belt-and-braces: `DEFAULT_SETTINGS` is also inspected so a future
 * regression that re-introduces a `cursorApiKey` field would fail here.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
} from '@/domain/settings/PluginSettings'

/**
 * Lightweight stand-in for Obsidian's `Setting` chain. The
 * `CursorSettingsSection` API surface is small enough that this minimal
 * fake captures every interaction the section uses and lets the test
 * trigger the registered onChange handlers directly.
 */
class FakeSetting {
  private _handler: ((v: unknown) => void | Promise<void>) | null = null
  setName(_: string): this { return this }
  setDesc(_: string): this { return this }
  setHeading(): this { return this }
  addText(fn: (text: FakeText) => void): this {
    const t = new FakeText()
    fn(t)
    this._handler = t.onChangeHandler as ((v: unknown) => void | Promise<void>) | null
    return this
  }
  addToggle(fn: (toggle: FakeToggle) => void): this {
    const t = new FakeToggle()
    fn(t)
    this._handler = t.onChangeHandler as ((v: unknown) => void | Promise<void>) | null
    return this
  }
  addDropdown(fn: (dd: FakeDropdown) => void): this {
    const dd = new FakeDropdown()
    fn(dd)
    this._handler = dd.onChangeHandler as ((v: unknown) => void | Promise<void>) | null
    return this
  }
  async fire(value: unknown): Promise<void> {
    if (this._handler !== null) await this._handler(value)
  }
}

class FakeText {
  inputEl = {
    type: 'text',
    autocomplete: '',
    disabled: false,
    setAttribute: vi.fn(),
  } as unknown as HTMLInputElement & { setAttribute: ReturnType<typeof vi.fn> }
  onChangeHandler: ((v: string) => void | Promise<void>) | null = null
  setPlaceholder(_: string): this { return this }
  setValue(_: string): this { return this }
  onChange(h: (v: string) => void | Promise<void>): this {
    this.onChangeHandler = h
    return this
  }
}
class FakeToggle {
  toggleEl = { setAttribute: vi.fn() }
  onChangeHandler: ((v: boolean) => void | Promise<void>) | null = null
  setValue(_: boolean): this { return this }
  onChange(h: (v: boolean) => void | Promise<void>): this {
    this.onChangeHandler = h
    return this
  }
}
class FakeDropdown {
  selectEl = { setAttribute: vi.fn() }
  onChangeHandler: ((v: string) => void | Promise<void>) | null = null
  addOption(_value: string, _label: string): this { return this }
  setValue(_: string): this { return this }
  onChange(h: (v: string) => void | Promise<void>): this {
    this.onChangeHandler = h
    return this
  }
}

// Capture every Setting instance the section under test constructs so the
// test can fire their handlers individually.
const constructedSettings: FakeSetting[] = []

// Mock the `obsidian` module so importing `CursorSettingsSection` resolves.
vi.mock('obsidian', () => ({
  Setting: function (_el: unknown) {
    const s = new FakeSetting()
    constructedSettings.push(s)
    return s
  },
}))

describe('Cursor key leakage (T-MPS-051, NFR-MPS-001)', () => {
  it('DEFAULT_SETTINGS contains no cursor key field', () => {
    expect(
      (DEFAULT_SETTINGS as unknown as Record<string, unknown>).cursorApiKey,
    ).toBeUndefined()
    expect(
      (DEFAULT_SETTINGS as unknown as Record<string, unknown>).cursorKey,
    ).toBeUndefined()
  })

  it('save path writes the key to SecretStore only — never to data.json', async () => {
    const KEY_VALUE = 'sk-cursor-leakage-canary-9F8K2QzVxYpL'
    const { renderCursorSettingsSection } = await import(
      '@/plugin/settings/CursorSettingsSection'
    )

    // (1) Set up a tracked settings object that mimics what `data.json` holds.
    let currentSettings: PluginSettings = { ...DEFAULT_SETTINGS }
    const dataJson: Record<string, unknown> = {
      specorator: { ...currentSettings },
      _moduleVersions: {},
    }
    const updateSettings = vi.fn(async (patch: Partial<PluginSettings>) => {
      currentSettings = { ...currentSettings, ...patch }
      dataJson.specorator = { ...currentSettings }
    })

    const secretStore = new MockSecretStore({ available: true })
    const refreshCache = vi.fn(async () => {})
    const bumpViews = vi.fn(() => {})

    // (2) Render the section; the mocked `Setting` constructor (above)
    // pushes each instance into `constructedSettings` in creation order.
    const containerEl = {
      createDiv: vi.fn(),
      createEl: vi.fn(),
    } as unknown as HTMLElement
    constructedSettings.length = 0

    renderCursorSettingsSection({
      containerEl,
      secretStore,
      settings: currentSettings,
      cursorKeyCache: '',
      updateSettings,
      refreshCursorKeyCache: refreshCache,
      bumpAllViews: bumpViews,
    })

    // (3) Fire the Cursor-key text handler with the canary value. Section
    // order is: heading, key-field, preview-toggle, prefer-dropdown.
    const keyFieldSetting = constructedSettings[1]
    expect(keyFieldSetting).toBeDefined()
    await keyFieldSetting.fire(KEY_VALUE)

    // (4) Verify the key landed in the secret store…
    expect(await secretStore.getSecret(SECRET_ID_CURSOR)).toBe(KEY_VALUE)
    expect(refreshCache).toHaveBeenCalled()

    // …and is absent from the simulated data.json blob.
    expect(updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cursorApiKey: expect.anything() }),
    )
    const serialised = JSON.stringify(dataJson)
    expect(serialised).not.toContain(KEY_VALUE)
  })

  it('CursorSettingsSection source never references writing the key into PluginSettings', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/plugin/settings/CursorSettingsSection.ts'),
      'utf8',
    )
    // The only place SECRET_ID_CURSOR appears must be the `setSecret` call.
    expect(src).toContain('setSecret(SECRET_ID_CURSOR')
    expect(src).not.toMatch(/updateSettings\([^)]*cursorApiKey/)
    expect(src).not.toMatch(/updateSettings\([^)]*cursorKey\b/)
  })
})
