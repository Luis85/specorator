/**
 * T-MHP-004 — `McpClientIdentifier` capture + fallback test.
 *
 * Satisfies: REQ-MHP-034, REQ-MHP-035; SPEC-MHP-036.
 * Covers: EC-MHP-009, EC-MHP-010, EC-MHP-011; TEST-MHP-035, TEST-MHP-036.
 *
 * TDD: this test MUST fail before
 * `src/infrastructure/mcp/McpClientIdentifier.ts` lands.
 */
import { describe, it, expect, vi } from 'vitest'
import { McpClientIdentifier } from '@/infrastructure/mcp/McpClientIdentifier'

/**
 * Minimal McpServer shape the identifier needs: a way to register an
 * `initialize`-handshake hook. We capture the registered callback so the
 * tests can invoke it with crafted clientInfo payloads.
 */
interface FakeInitializeHandler {
  (params: {
    connectionId: string
    clientInfo?: unknown
    transport?: 'loopback' | 'in-process'
    address?: string
  }): void
}

function makeFakeServer() {
  let handler: FakeInitializeHandler | null = null
  return {
    onInitialize: vi.fn((cb: FakeInitializeHandler) => {
      handler = cb
    }),
    fireInitialize(params: Parameters<FakeInitializeHandler>[0]) {
      if (!handler) throw new Error('attachInitializeHook was not called')
      handler(params)
    },
  }
}

describe('McpClientIdentifier (SPEC-MHP-036 / REQ-MHP-034 / REQ-MHP-035)', () => {
  it('TEST-MHP-035: captures clientInfo.name from initialize handshake', () => {
    const server = makeFakeServer()
    const ident = new McpClientIdentifier()
    ident.attachInitializeHook(server as never)

    server.fireInitialize({
      connectionId: 'conn-1',
      clientInfo: { name: 'cursor', version: '0.42.0' },
      transport: 'loopback',
      address: '127.0.0.1:51344',
    })

    const id = ident.identityFor('conn-1')
    expect(id).toEqual({
      id: 'cursor',
      transport: 'loopback',
      address: '127.0.0.1:51344',
    })
  })

  it('TEST-MHP-036 / EC-MHP-009: missing clientInfo.name falls back to "unknown"', () => {
    const server = makeFakeServer()
    const ident = new McpClientIdentifier()
    ident.attachInitializeHook(server as never)

    server.fireInitialize({
      connectionId: 'conn-2',
      clientInfo: {},
      transport: 'loopback',
      address: '127.0.0.1:51345',
    })

    expect(ident.identityFor('conn-2').id).toBe('unknown')
  })

  it('EC-MHP-010: empty / whitespace-only clientInfo.name normalises to "unknown"', () => {
    const server = makeFakeServer()
    const ident = new McpClientIdentifier()
    ident.attachInitializeHook(server as never)

    server.fireInitialize({
      connectionId: 'c-empty',
      clientInfo: { name: '' },
      transport: 'loopback',
      address: '',
    })
    server.fireInitialize({
      connectionId: 'c-ws',
      clientInfo: { name: '   \t\n  ' },
      transport: 'loopback',
      address: '',
    })

    expect(ident.identityFor('c-empty').id).toBe('unknown')
    expect(ident.identityFor('c-ws').id).toBe('unknown')
  })

  it('EC-MHP-010: non-string clientInfo.name normalises to "unknown"', () => {
    const server = makeFakeServer()
    const ident = new McpClientIdentifier()
    ident.attachInitializeHook(server as never)

    server.fireInitialize({
      connectionId: 'c-num',
      clientInfo: { name: 42 as unknown },
      transport: 'loopback',
      address: '',
    })
    server.fireInitialize({
      connectionId: 'c-obj',
      clientInfo: { name: { not: 'a string' } as unknown },
      transport: 'loopback',
      address: '',
    })

    expect(ident.identityFor('c-num').id).toBe('unknown')
    expect(ident.identityFor('c-obj').id).toBe('unknown')
  })

  it('EC-MHP-011: clientInfo.name is trimmed AND truncated to 128 chars', () => {
    const server = makeFakeServer()
    const ident = new McpClientIdentifier()
    ident.attachInitializeHook(server as never)

    const longName = 'x'.repeat(500)
    server.fireInitialize({
      connectionId: 'c-long',
      clientInfo: { name: `   ${longName}   ` },
      transport: 'loopback',
      address: '',
    })

    const id = ident.identityFor('c-long').id
    expect(id.length).toBe(128)
    expect(id).toBe('x'.repeat(128))
  })

  it('identityFor on unknown connectionId returns fallback unknown loopback identity', () => {
    const ident = new McpClientIdentifier()
    const server = makeFakeServer()
    ident.attachInitializeHook(server as never)

    expect(ident.identityFor('never-seen')).toEqual({
      id: 'unknown',
      transport: 'loopback',
      address: '',
    })
  })
})
