import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { createHeadlessRuntimeHost, type RuntimeHost } from '@/core/runtime/RuntimeHost';
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';

function makeRuntime(
  overrides: Record<string, unknown> = {},
  host: RuntimeHost = createHeadlessRuntimeHost(),
): CursorChatRuntime {
  const plugin = {
    getResolvedProviderCliPath: () => '/bin/cursor-agent',
    getResolvedEnvironmentVariables: () => ({}),
    settings: { permissionMode: 'normal' },
    logger: { scope: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) },
    app: { vault: { adapter: { basePath: '/tmp/specorator-test-vault' } } },
    manifest: { version: '1.0.0' },
    ...overrides,
  };
  return new CursorChatRuntime(plugin as never, host);
}

// The cursor provider isn't registered in the unit lane, so the settings-snapshot
// projection (which resolves chat UI config) would throw. Stub it to echo the raw
// settings bag — model resolution then falls through to queryOptions/settings.model.
function stubProviderSnapshot(): void {
  jest.spyOn(ProviderSettingsCoordinator, 'getProviderSettingsSnapshot')
    .mockImplementation((settings) => settings);
}

type FakeConnection = Record<string, jest.Mock>;

// Wires a fake AcpClientConnection plus live-runtime flags so query()/ensureReady()
// skip the real subprocess/transport path and exercise pure session logic.
function primeRuntime(
  runtime: CursorChatRuntime,
  connection: Partial<FakeConnection>,
): Record<string, unknown> {
  const bag = runtime as unknown as Record<string, unknown>;
  bag.connection = connection;
  bag.process = { isAlive: () => true, getStderrSnapshot: () => '' };
  bag.transport = { isClosed: false };
  bag.staleMcpCleaned = true;
  return bag;
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

describe('CursorChatRuntime.ensureSession', () => {
  it('adopts the loaded id when session/load succeeds', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockResolvedValue({ sessionId: 'S1' });
    const bag = primeRuntime(runtime, { loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    const result = await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBe('S1');
    expect(loadSession).toHaveBeenCalled();
    expect(bag.loadedSessionId).toBe('S1');
    expect(bag.sessionInvalidated).toBe(false);
  });

  it('invalidates + flags bootstrap and falls back to a new session on load rejection', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockRejectedValue(new Error('no such session'));
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S2' });
    const bag = primeRuntime(runtime, { loadSession, newSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    const result = await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBe('S2');
    expect(newSession).toHaveBeenCalled();
    expect(bag.sessionInvalidated).toBe(true);
    expect(bag.sessionBootstrapNeeded).toBe(true);
    expect(bag.sessionId).toBe('S2');
  });
});

describe('CursorChatRuntime.createSession (auth retry)', () => {
  it('authenticates and retries when the first newSession rejects', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn()
      .mockRejectedValueOnce(new Error('unauthenticated'))
      .mockResolvedValueOnce({ sessionId: 'S3' });
    const authenticate = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { newSession, authenticate });

    const result = await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBe('S3');
    expect(authenticate).toHaveBeenCalledWith({ methodId: 'cursor_login' });
    expect(newSession).toHaveBeenCalledTimes(2);
    expect(bag.sessionId).toBe('S3');
  });

  it('surfaces the login message when authentication rejects', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockRejectedValue(new Error('unauthenticated'));
    const authenticate = jest.fn().mockRejectedValue(new Error('login required'));
    const bag = primeRuntime(runtime, { newSession, authenticate });

    const result = await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBeNull();
    expect(String(bag.lastStartupErrorMessage)).toMatch(/login/i);
  });
});

describe('CursorChatRuntime.handlePermissionRequest', () => {
  function makeRequest(options: Array<{ kind: string; optionId: string; name: string }>) {
    return {
      options,
      sessionId: 's',
      toolCall: { toolCallId: 't1', title: 'Bash', rawInput: { cmd: 'ls' } },
    };
  }

  it('auto-approves via a selected allow option under yolo mode', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = true;
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(response.outcome.outcome).toBe('selected');
    expect(response.outcome.optionId).toBe('ok');
  });

  it('prefers the one-turn allow_once grant over allow_always under yolo mode', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = true;
    const request = makeRequest([
      { kind: 'allow_always', optionId: 'always', name: 'Always allow' },
      { kind: 'allow_once', optionId: 'once', name: 'Allow once' },
    ]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(response.outcome.outcome).toBe('selected');
    expect(response.outcome.optionId).toBe('once');
  });

  it('falls back to allow_always when it is the only allow option under yolo mode', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = true;
    const request = makeRequest([{ kind: 'allow_always', optionId: 'always', name: 'Always allow' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(response.outcome.outcome).toBe('selected');
    expect(response.outcome.optionId).toBe('always');
  });

  it('falls through to host.approval under yolo mode when no allow option exists', async () => {
    const approval = jest.fn().mockResolvedValue('deny');
    const host = { ...createHeadlessRuntimeHost(), approval };
    const runtime = makeRuntime({}, host);
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = true;
    const request = makeRequest([{ kind: 'reject_once', optionId: 'no', name: 'Reject' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(approval).toHaveBeenCalled();
    expect(response.outcome.optionId).toBe('no');
  });

  it('maps the host decision on the manual path', async () => {
    const approval = jest.fn().mockResolvedValue({ type: 'select-option', value: 'custom' });
    const host = { ...createHeadlessRuntimeHost(), approval };
    const runtime = makeRuntime({}, host);
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = false;
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(approval).toHaveBeenCalled();
    expect(response.outcome.optionId).toBe('custom');
  });
});

describe('CursorChatRuntime.emitFinalUsage', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  function makeActiveTurn() {
    const push = jest.fn();
    return { activeTurn: { queue: { push }, sessionId: 'S' }, push };
  }

  it('emits the ACP usage payload when prompt usage is present', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, { inputTokens: 10, outputTokens: 5 }, { model: 'gpt-5' });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
  });

  it('falls back to the catalog usage when no ACP usage but a model resolves', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, null, { model: 'gpt-5' });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
  });

  it('emits nothing when no model resolves', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, null, undefined);

    expect(push).not.toHaveBeenCalled();
  });
});

describe('CursorChatRuntime.query history bootstrap', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  const turn = { persistedContent: 'hi', prompt: 'ask now', request: { images: [] } };
  const history = [
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'PRIOR_MARKER' },
  ];

  function promptTextFrom(promptFn: jest.Mock): string {
    const blocks = promptFn.mock.calls[0][0].prompt as Array<{ type: string; text?: string }>;
    return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  }

  async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
    const iterator = gen[Symbol.asyncIterator]();
    while (!(await iterator.next()).done) { /* consume every chunk */ }
  }

  it('injects history into the prompt when the turn starts without a session id', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'NEW' });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, newSession, setMode });
    bag.sessionId = null;

    await drain(runtime.query(turn as never, history as never));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(promptTextFrom(prompt)).toContain('PRIOR_MARKER');
  });

  it('does not re-inject history when an existing session loads cleanly', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const loadSession = jest.fn().mockResolvedValue({ sessionId: 'S1' });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, loadSession, setMode });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    await drain(runtime.query(turn as never, history as never));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(promptTextFrom(prompt)).not.toContain('PRIOR_MARKER');
  });
});

describe('CursorChatRuntime mode cache across session switch', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  const turn = { persistedContent: 'hi', prompt: 'ask now', request: { images: [] } };

  async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
    const iterator = gen[Symbol.asyncIterator]();
    while (!(await iterator.next()).done) { /* consume every chunk */ }
  }

  it('re-applies plan mode to the new session after switching conversations', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    const loadSession = jest.fn().mockImplementation(({ sessionId }) => Promise.resolve({ sessionId }));
    const bag = primeRuntime(runtime, { prompt, setMode, loadSession });

    // Session A: the first plan-mode turn applies plan mode to session A.
    bag.sessionId = 'A';
    bag.loadedSessionId = 'A';
    await drain(runtime.query(turn as never));
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode.mock.calls[0][0]).toEqual({ modeId: 'plan', sessionId: 'A' });

    // Switch conversation → session B. Without the currentModeId reset the
    // cached 'plan' would make applyMode early-return and B would never receive
    // session/set_mode — the UI would say plan while B ran in the agent's default.
    runtime.syncConversationState({ sessionId: 'B', providerState: undefined } as never);
    await drain(runtime.query(turn as never));

    expect(setMode).toHaveBeenCalledTimes(2);
    expect(setMode.mock.calls[1][0]).toEqual({ modeId: 'plan', sessionId: 'B' });
  });
});
