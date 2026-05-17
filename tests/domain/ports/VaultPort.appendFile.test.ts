/**
 * WP-5 — `VaultPort.appendFile` contract test.
 *
 * Pins the cross-adapter behaviour of the tail-append surface added in WP-5
 * (ADR-008 port extension). The three runtime adapters
 * (`ObsidianBridge` / `MockBridge` / `LocalStorageBridge`) must agree on:
 *
 *   1. Appending to an existing file concatenates `content` to the existing
 *      bytes; a subsequent `readFile` returns the full sequence.
 *   2. Appending to a missing path creates the file with `content`
 *      (POSIX-style append-on-open).
 *   3. The empty-string append is a no-op for visible content but is not a
 *      hard error.
 *
 * `ObsidianBridge` is exercised through type-level assertions only — its
 * implementation lives behind the Obsidian runtime and is covered by the
 * MockBridge contract via `VaultPort`. The two browser-side adapters
 * (`MockBridge` for unit tests + `LocalStorageBridge` for GitHub Pages) are
 * exercised against the runnable contract here.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import type { VaultPort } from '@/domain/ports'

describe('VaultPort.appendFile contract — MockBridge', () => {
  let vault: VaultPort
  let bridge: MockBridge

  beforeEach(() => {
    bridge = new MockBridge()
    vault = bridge
  })

  it('appends to an existing file: readFile returns previous + appended bytes', async () => {
    await vault.writeFile('a.md', 'hello')
    await vault.appendFile('a.md', ' world')

    expect(await vault.readFile('a.md')).toBe('hello world')
  })

  it('creates the file when it does not exist (POSIX append-on-open)', async () => {
    await vault.appendFile('fresh.md', 'first chunk')

    expect(await vault.fileExists('fresh.md')).toBe(true)
    expect(await vault.readFile('fresh.md')).toBe('first chunk')
  })

  it('records each appendFile call against the MockBridge.calls recorder', async () => {
    await vault.appendFile('log.md', 'one')
    await vault.appendFile('log.md', 'two')

    expect(bridge.calls.appendFile).toEqual([
      { path: 'log.md', content: 'one' },
      { path: 'log.md', content: 'two' },
    ])
  })

  it('an empty append leaves the file content unchanged', async () => {
    await vault.writeFile('a.md', 'seed')
    await vault.appendFile('a.md', '')

    expect(await vault.readFile('a.md')).toBe('seed')
  })
})

describe('VaultPort.appendFile contract — LocalStorageBridge (GH Pages demo)', () => {
  let vault: VaultPort

  beforeEach(() => {
    // jsdom-backed `localStorage` is reset between tests by the vitest
    // environment, but call clear() defensively in case a previous suite
    // leaked state.
    localStorage.clear()
    vault = new LocalStorageBridge()
  })

  it('appends to an existing file: readFile returns previous + appended bytes', async () => {
    await vault.writeFile('a.md', 'alpha')
    await vault.appendFile('a.md', '/beta')

    expect(await vault.readFile('a.md')).toBe('alpha/beta')
  })

  it('creates the file when it does not exist', async () => {
    await vault.appendFile('fresh.md', 'first')

    expect(await vault.fileExists('fresh.md')).toBe(true)
    expect(await vault.readFile('fresh.md')).toBe('first')
  })

  it('yields the same final byte stream as native append (MockBridge parity)', async () => {
    const mock = new MockBridge()
    await mock.writeFile('p.md', 'start')
    await mock.appendFile('p.md', '-mid')
    await mock.appendFile('p.md', '-end')

    await vault.writeFile('p.md', 'start')
    await vault.appendFile('p.md', '-mid')
    await vault.appendFile('p.md', '-end')

    expect(await vault.readFile('p.md')).toBe(await mock.readFile('p.md'))
  })
})
