/**
 * T-MPS-030 — `buildProviderRegistry` returns the two providers with
 * metadata only.
 *
 * Satisfies REQ-MPS-006, NFR-MPS-003.
 *
 * Asserts:
 *   - `listProviders()` returns exactly two entries, ids `['claude', 'cursor']`.
 *   - Each entry exposes `label`, `capabilities`, and a `slashCommands()` array.
 *   - The registry does not leak any `ChatTransportPort` / adapter references
 *     (NFR-MPS-003 — no secret-bearing or adapter material).
 *   - `getProvider(id)` / `getCapabilities(id)` work for known ids and return
 *     `undefined` for unknown ones.
 */
import { describe, it, expect } from 'vitest'

import { buildProviderRegistry } from '@/plugin/transport/buildProviderRegistry'

describe('buildProviderRegistry() — REQ-MPS-006, NFR-MPS-003', () => {
  it("returns exactly the two v1 providers in id order ['claude', 'cursor']", () => {
    const registry = buildProviderRegistry()
    const entries = registry.listProviders()
    expect(entries.map((e) => e.id)).toEqual(['claude', 'cursor'])
  })

  it('exposes a human-readable label and capability record for each provider', () => {
    const registry = buildProviderRegistry()
    for (const entry of registry.listProviders()) {
      expect(entry.label).toBeTypeOf('string')
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.capabilities).toBeDefined()
      expect(Array.isArray(entry.capabilities.modes)).toBe(true)
      expect(entry.capabilities.modes.length).toBeGreaterThan(0)
    }
  })

  it('returns an array (possibly empty) from each entry.slashCommands()', () => {
    const registry = buildProviderRegistry()
    for (const entry of registry.listProviders()) {
      const commands = entry.slashCommands()
      expect(Array.isArray(commands)).toBe(true)
    }
  })

  it('never leaks a `port` / adapter reference on a `ProviderEntry` (NFR-MPS-003)', () => {
    const registry = buildProviderRegistry()
    for (const entry of registry.listProviders()) {
      // Inspect the public surface of `ProviderEntry`; `port` / `adapter` /
      // any function returning a `ChatTransportPort` would violate NFR-MPS-003.
      const keys = Object.keys(entry)
      expect(keys).not.toContain('port')
      expect(keys).not.toContain('adapter')
      expect(keys).not.toContain('transport')
    }
  })

  it('getProvider(id) returns the registered entry; undefined for unknown ids', () => {
    const registry = buildProviderRegistry()
    expect(registry.getProvider('claude')?.id).toBe('claude')
    expect(registry.getProvider('cursor')?.id).toBe('cursor')
    // @ts-expect-error — exercising the runtime guard for unknown ids
    expect(registry.getProvider('unknown')).toBeUndefined()
  })

  it('getCapabilities(id) returns the entry capabilities; undefined for unknown ids', () => {
    const registry = buildProviderRegistry()
    expect(registry.getCapabilities('claude')).toBe(
      registry.getProvider('claude')?.capabilities,
    )
    expect(registry.getCapabilities('cursor')).toBe(
      registry.getProvider('cursor')?.capabilities,
    )
    // @ts-expect-error — exercising the runtime guard for unknown ids
    expect(registry.getCapabilities('unknown')).toBeUndefined()
  })
})
