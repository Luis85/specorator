import { createHeadlessRuntimeHost } from '@/core/runtime/RuntimeHost';
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';

function makeRuntime(overrides: Record<string, unknown> = {}): CursorChatRuntime {
  const plugin = {
    getResolvedProviderCliPath: () => '/bin/cursor-agent',
    getResolvedEnvironmentVariables: () => ({}),
    settings: { permissionMode: 'normal' },
    logger: { scope: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) },
    app: {},
    manifest: { version: '1.0.0' },
    ...overrides,
  };
  return new CursorChatRuntime(plugin as never, createHeadlessRuntimeHost());
}

describe('CursorChatRuntime (ACP)', () => {
  it('reports persistent-runtime capabilities', () => {
    expect(makeRuntime().getCapabilities().supportsPersistentRuntime).toBe(true);
  });

  it('is not ready without a resolved CLI path', async () => {
    const runtime = makeRuntime({ getResolvedProviderCliPath: () => null });
    await expect(runtime.ensureReady()).resolves.toBe(false);
  });

  it('builds session updates carrying chatSessionId provider state', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.sessionId = 'abc123';
    const result = (runtime.buildSessionUpdates as (p: unknown) => { updates: { sessionId: string | null } })
      .call(runtime, { conversation: null, sessionInvalidated: false });
    expect(result.updates.sessionId).toBe('abc123');
  });

  it('formats runtime errors with the stderr snapshot appended', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.process = { getStderrSnapshot: () => 'acp: unknown subcommand' };
    const msg = (runtime.formatRuntimeError as (e: unknown) => string).call(runtime, new Error('exited'));
    expect(msg).toContain('exited');
    expect(msg).toContain('unknown subcommand');
  });

  it('maps a pre-initialize process death to the update-your-CLI error', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const msg = (runtime.describeStartupFailure as (e: unknown) => string)
      .call(runtime, new Error('transport closed'));
    expect(msg).toMatch(/update.*cursor-agent|Cursor CLI/i);
  });
});
