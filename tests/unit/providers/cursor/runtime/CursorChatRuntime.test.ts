import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { createHeadlessRuntimeHost, type RuntimeHost } from '@/core/runtime/RuntimeHost';
import { AcpStreamChunkQueue } from '@/providers/acp';
import * as acpBuild from '@/providers/acp/buildAcpUsageInfo';
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

describe('CursorChatRuntime.ensureReady force restart', () => {
  it('reuses the live process when force is not requested', async () => {
    const runtime = makeRuntime();
    primeRuntime(runtime, {});
    const startProcess = jest
      .spyOn(runtime as unknown as { startProcess: (c: string) => Promise<void> }, 'startProcess')
      .mockResolvedValue();

    await expect(runtime.ensureReady()).resolves.toBe(true);
    expect(startProcess).not.toHaveBeenCalled();
  });

  it('shuts down and restarts on a forced ensureReady even when the process is alive', async () => {
    const runtime = makeRuntime();
    primeRuntime(runtime, {});
    const startProcess = jest
      .spyOn(runtime as unknown as { startProcess: (c: string) => Promise<void> }, 'startProcess')
      .mockResolvedValue();

    await expect(runtime.ensureReady({ force: true })).resolves.toBe(true);
    expect(startProcess).toHaveBeenCalledTimes(1);
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

  it('carries a stored authoritative context window into the final usage payload', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = { size: 222_000, used: 4_096 };
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, null, { model: 'gpt-5' });

    expect(push).toHaveBeenCalledTimes(1);
    const usage = push.mock.calls[0][0].usage;
    // The authoritative usage_update window survives — not the zero-window catalog fallback.
    expect(usage.contextWindow).toBe(222_000);
    expect(usage.contextWindowIsAuthoritative).toBe(true);
  });

  it('suppresses the catalog fallback when a context usage was seen but no ACP usage builds', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = { size: 222_000, used: 4_096 };
    const { activeTurn, push } = makeActiveTurn();
    jest.spyOn(acpBuild, 'buildAcpUsageInfo').mockReturnValue(null);

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, null, { model: 'gpt-5' });

    expect(push).not.toHaveBeenCalled();
  });

  it('still emits the catalog fallback when neither prompt usage nor context usage was seen', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = null;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown, q: unknown) => void)
      .call(runtime, activeTurn, null, { model: 'gpt-5' });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
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

describe('CursorChatRuntime terminal-push dedup', () => {
  it('emits exactly one error and one done when transport close races the rejected prompt', async () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    const activeTurn = { queue, sessionId: 'S', terminalPushed: false };
    const pushTermination = (runtime.pushTurnTermination as (t: unknown, c: unknown[]) => void).bind(runtime);

    // Transport onClose lands first, then the rejected prompt's .catch fires on
    // the same turn — the second push must be a no-op.
    pushTermination(activeTurn, [{ type: 'error', content: 'exited' }, { type: 'done' }]);
    pushTermination(activeTurn, [{ type: 'error', content: 'request failed' }, { type: 'done' }]);

    const chunks: Array<{ type: string }> = [];
    let chunk = await queue.next();
    while (chunk !== null) {
      chunks.push(chunk as { type: string });
      chunk = await queue.next();
    }

    expect(chunks.filter((c) => c.type === 'error')).toHaveLength(1);
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
  });
});

describe('CursorChatRuntime.applySelectedModel (advertised wire ids)', () => {
  afterEach(() => jest.restoreAllMocks());

  function primeModel(
    runtime: CursorChatRuntime,
    setConfigOption: jest.Mock,
    resolved: string | undefined,
    advertised: string[] | null,
  ): Record<string, unknown> {
    const bag = primeRuntime(runtime, { setConfigOption });
    bag.advertisedModelValues = advertised;
    jest.spyOn(runtime as unknown as { resolveCursorModelForSession: () => string | undefined }, 'resolveCursorModelForSession')
      .mockReturnValue(resolved);
    return bag;
  }

  async function applyModel(bag: Record<string, unknown>, runtime: CursorChatRuntime): Promise<void> {
    await (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(runtime, 'S1', undefined);
  }

  it('sends the advertised wire id when the resolved family prefix matches', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', [
      'gpt-5.4[reasoning=medium]',
      'gpt-5.4[reasoning=high]',
    ]);

    await applyModel(bag, runtime);

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: 'S1',
      type: 'select',
      value: 'gpt-5.4[reasoning=medium]',
    });
    expect(bag.currentSessionModelId).toBe('gpt-5.4[reasoning=medium]');
  });

  it('sends an exact advertised value untouched', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'auto', ['auto', 'gpt-5.4[reasoning=medium]']);

    await applyModel(bag, runtime);

    expect(setConfigOption.mock.calls[0][0].value).toBe('auto');
  });

  it('skips setConfigOption entirely when no advertised value matches the family', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['claude-4.6-opus[thinking]']);

    await applyModel(bag, runtime);

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });

  it('skips setConfigOption when the session advertised no models at all', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', null);

    await applyModel(bag, runtime);

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('returns early without a warn when nothing resolves', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, undefined, ['gpt-5.4[reasoning=medium]']);

    await applyModel(bag, runtime);

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('does not re-send when the matched wire id is already the current model', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['gpt-5.4[reasoning=medium]']);
    bag.currentSessionModelId = 'gpt-5.4[reasoning=medium]';

    await applyModel(bag, runtime);

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('swallows a setConfigOption rejection without advancing the cache', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockRejectedValue(new Error('unsupported'));
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['gpt-5.4[reasoning=medium]']);

    await applyModel(bag, runtime);

    expect(setConfigOption).toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });
});

describe('CursorChatRuntime.captureAdvertisedModelValues', () => {
  it('captures wire ids from a session response config option', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    (runtime.captureAdvertisedModelValues as (r: unknown) => void).call(runtime, {
      sessionId: 'S1',
      configOptions: [{
        id: 'model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: 'gpt-5.4[reasoning=medium]',
        options: [
          { name: 'GPT-5.4 Medium', value: 'gpt-5.4[reasoning=medium]' },
          { name: 'GPT-5.4 High', value: 'gpt-5.4[reasoning=high]' },
        ],
      }],
    });
    expect(runtime.advertisedModelValues).toEqual([
      'gpt-5.4[reasoning=medium]',
      'gpt-5.4[reasoning=high]',
    ]);
  });

  it('falls back to the legacy models state when no config option is advertised', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    (runtime.captureAdvertisedModelValues as (r: unknown) => void).call(runtime, {
      sessionId: 'S1',
      models: { availableModels: [{ id: 'auto', name: 'Auto' }], currentModelId: 'auto' },
    });
    expect(runtime.advertisedModelValues).toEqual(['auto']);
  });

  it('is populated by a fresh createSession and cleared by resetSession', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue({
      sessionId: 'S3',
      models: { availableModels: [{ id: 'auto', name: 'Auto' }], currentModelId: 'auto' },
    });
    const bag = primeRuntime(runtime, { newSession });

    await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');
    expect(bag.advertisedModelValues).toEqual(['auto']);

    runtime.resetSession();
    expect(bag.advertisedModelValues).toBeNull();
  });

  it('is populated by a successful session/load', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockResolvedValue({
      sessionId: 'S1',
      models: { availableModels: [{ id: 'gpt-5.4[reasoning=high]', name: 'High' }], currentModelId: 'gpt-5.4[reasoning=high]' },
    });
    const bag = primeRuntime(runtime, { loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(bag.advertisedModelValues).toEqual(['gpt-5.4[reasoning=high]']);
  });
});

describe('CursorChatRuntime.handleSessionNotification plan-content gate', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  function makeNotification(text: string) {
    return {
      sessionId: 'S1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text }, messageId: 'm1' },
    };
  }

  async function feed(runtime: CursorChatRuntime, notification: unknown): Promise<Record<string, unknown>> {
    const bag = runtime as unknown as Record<string, unknown>;
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', terminalPushed: false };
    bag.currentTurnIsPlan = true;
    bag.currentTurnSawAssistantContent = false;
    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, notification);
    return bag;
  }

  it('does not mark a plan turn complete for a boundary-only (empty) assistant chunk', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const bag = await feed(runtime, makeNotification(''));

    (bag.finalizePlanTurnMetadata as () => void).call(runtime);

    expect(bag.currentTurnSawAssistantContent).toBe(false);
    expect((bag.turnMetadata as { planCompleted?: boolean }).planCompleted).toBeUndefined();
  });

  it('marks a plan turn complete once the assistant chunk carries real text', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const bag = await feed(runtime, makeNotification('Here is the plan'));

    (bag.finalizePlanTurnMetadata as () => void).call(runtime);

    expect(bag.currentTurnSawAssistantContent).toBe(true);
    expect((bag.turnMetadata as { planCompleted?: boolean }).planCompleted).toBe(true);
  });

  it('ignores notifications for a session other than the active turn', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S1', terminalPushed: false };
    bag.currentTurnIsPlan = true;

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'OTHER',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'x' }, messageId: 'm1' },
    });

    expect(bag.currentTurnSawAssistantContent).toBe(false);
  });

  it('drops normalized updates that are not stream-forwardable (e.g. current_mode)', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', terminalPushed: false };

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'plan' },
    });

    // Nothing forwarded and no assistant content recorded.
    expect(bag.currentTurnSawAssistantContent).toBe(false);
  });

  it('records the context window carried by a usage_update', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', terminalPushed: false };

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'usage_update', size: 222_000, used: 4_096 },
    });

    expect(bag.contextUsage).toMatchObject({ size: 222_000, used: 4_096 });
  });
});

describe('CursorChatRuntime lifecycle + accessor methods', () => {
  afterEach(() => jest.restoreAllMocks());

  it('encodes a turn through the sectioned prompt encoder', () => {
    const prepared = makeRuntime().prepareTurn({ text: 'hello', images: [] } as never);
    expect(prepared.prompt).toContain('hello');
  });

  it('consumes and clears turn metadata', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.turnMetadata = { planCompleted: true };
    expect(runtime.consumeTurnMetadata()).toEqual({ planCompleted: true });
    expect(runtime.consumeTurnMetadata()).toEqual({});
  });

  it('notifies then detaches ready-state listeners', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const seen: boolean[] = [];
    const off = runtime.onReadyStateChange((ready) => seen.push(ready));

    (bag.setReady as (r: boolean) => void).call(runtime, true);
    off();
    (bag.setReady as (r: boolean) => void).call(runtime, false);

    expect(seen).toEqual([true]);
  });

  it('does not re-notify ready listeners when the value is unchanged', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const seen: boolean[] = [];
    runtime.onReadyStateChange((ready) => seen.push(ready));

    (bag.setReady as (r: boolean) => void).call(runtime, false);
    expect(seen).toEqual([]);
  });

  it('setResumeCheckpoint and reloadMcpServers are inert no-ops', async () => {
    const runtime = makeRuntime();
    expect(() => runtime.setResumeCheckpoint('cp')).not.toThrow();
    await expect(runtime.reloadMcpServers()).resolves.toBeUndefined();
    await expect(runtime.getSupportedCommands()).resolves.toEqual([]);
    expect(runtime.resolveSessionIdForFork(null)).toBeNull();
  });

  it('adopts a conversation session id and clears caches on a session switch', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.currentModeId = 'plan';
    bag.currentSessionModelId = 'gpt-5.4[reasoning=medium]';
    bag.advertisedModelValues = ['gpt-5.4[reasoning=medium]'];

    runtime.syncConversationState({ sessionId: 'NEW', providerState: { chatSessionId: 'NEW' } } as never);

    expect(runtime.getSessionId()).toBe('NEW');
    expect(bag.currentModeId).toBeNull();
    expect(bag.currentSessionModelId).toBeNull();
    expect(bag.advertisedModelValues).toBeNull();
  });

  it('keeps caches when syncConversationState resolves the same session id', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'SAME';
    bag.currentModeId = 'plan';

    runtime.syncConversationState({ sessionId: 'SAME', providerState: undefined } as never);

    expect(bag.currentModeId).toBe('plan');
  });

  it('cancel() cancels the connection, aborts ask, and dismisses approval', () => {
    const dismissApproval = jest.fn();
    const host = { ...createHeadlessRuntimeHost(), dismissApproval };
    const runtime = makeRuntime({}, host);
    const cancel = jest.fn();
    const bag = primeRuntime(runtime, { cancel });
    bag.sessionId = 'S1';

    runtime.cancel();

    expect(cancel).toHaveBeenCalledWith({ sessionId: 'S1' });
    expect(dismissApproval).toHaveBeenCalled();
  });

  it('resetSession clears every session-scoped field', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    Object.assign(bag, {
      sessionId: 'S1',
      loadedSessionId: 'S1',
      sessionInvalidated: true,
      sessionBootstrapNeeded: true,
      currentModeId: 'plan',
      currentSessionModelId: 'm',
      advertisedModelValues: ['m'],
    });

    runtime.resetSession();

    expect(runtime.getSessionId()).toBeNull();
    expect(bag.loadedSessionId).toBeNull();
    expect(bag.advertisedModelValues).toBeNull();
  });

  it('consumeSessionInvalidation reports then clears the flag', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionInvalidated = true;
    expect(runtime.consumeSessionInvalidation()).toBe(true);
    expect(runtime.consumeSessionInvalidation()).toBe(false);
  });

  it('isReady reflects the internal ready flag', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    expect(runtime.isReady()).toBe(false);
    (bag.setReady as (r: boolean) => void).call(runtime, true);
    expect(runtime.isReady()).toBe(true);
  });

  it('cleanup tears down the connection, transport, and process', async () => {
    const runtime = makeRuntime();
    const dispose = jest.fn();
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const bag = runtime as unknown as Record<string, unknown>;
    bag.connection = { dispose };
    bag.transport = { dispose };
    bag.process = { isAlive: () => true, shutdown };
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', terminalPushed: false };

    await runtime.cleanup();

    expect(dispose).toHaveBeenCalledTimes(2);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(bag.connection).toBeNull();
    expect(bag.process).toBeNull();
  });
});

describe('CursorChatRuntime.buildSessionUpdates branches', () => {
  it('nulls the session when invalidated with a conversation and no live session id', () => {
    const runtime = makeRuntime();
    const result = runtime.buildSessionUpdates({
      conversation: { providerState: { chatSessionId: 'gone' } } as never,
      sessionInvalidated: true,
    });
    expect(result.updates).toEqual({ sessionId: null, providerState: undefined });
  });

  it('merges the live session id onto the existing provider state', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'LIVE';
    const result = runtime.buildSessionUpdates({
      conversation: { providerState: { chatSessionId: 'OLD' } } as never,
      sessionInvalidated: false,
    });
    expect(result.updates.sessionId).toBe('LIVE');
    expect((result.updates.providerState as { chatSessionId: string }).chatSessionId).toBe('LIVE');
  });

  it('omits provider state entirely when there is no session id', () => {
    const runtime = makeRuntime();
    const result = runtime.buildSessionUpdates({ conversation: null, sessionInvalidated: false });
    expect(result.updates.sessionId).toBeNull();
    expect(result.updates.providerState).toBeUndefined();
  });
});

describe('CursorChatRuntime.applyMode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('short-circuits when the requested mode is already applied', async () => {
    const runtime = makeRuntime();
    const setMode = jest.fn();
    const bag = primeRuntime(runtime, { setMode });
    bag.currentModeId = 'plan';

    await (bag.applyMode as (s: string, m: string) => Promise<void>).call(runtime, 'S1', 'plan');

    expect(setMode).not.toHaveBeenCalled();
  });

  it('swallows a setMode rejection and leaves the mode cache unadvanced', async () => {
    const runtime = makeRuntime();
    const setMode = jest.fn().mockRejectedValue(new Error('rejected'));
    const bag = primeRuntime(runtime, { setMode });
    bag.currentModeId = null;

    await (bag.applyMode as (s: string, m: string) => Promise<void>).call(runtime, 'S1', 'plan');

    expect(setMode).toHaveBeenCalled();
    expect(bag.currentModeId).toBeNull();
  });
});

describe('CursorChatRuntime.query early exits', () => {
  afterEach(() => jest.restoreAllMocks());

  const turn = { persistedContent: 'hi', prompt: 'ask', request: { images: [] } };

  async function collect(gen: AsyncGenerator<unknown>): Promise<Array<{ type: string; content?: string }>> {
    const out: Array<{ type: string; content?: string }> = [];
    for await (const chunk of gen) {
      out.push(chunk as { type: string; content?: string });
    }
    return out;
  }

  it('errors out when no CLI path resolves', async () => {
    const runtime = makeRuntime({ getResolvedProviderCliPath: () => null });
    const chunks = await collect(runtime.query(turn as never));
    expect(chunks.some((c) => c.type === 'error' && /not found/i.test(c.content ?? ''))).toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('surfaces the recorded startup error when ensureReady fails', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.staleMcpCleaned = true;
    bag.lastStartupErrorMessage = 'CLI too old';
    jest.spyOn(runtime, 'ensureReady').mockResolvedValue(false);

    const chunks = await collect(runtime.query(turn as never));

    expect(chunks.some((c) => c.type === 'error' && c.content === 'CLI too old')).toBe(true);
  });

  it('errors when the session cannot be opened', async () => {
    const runtime = makeRuntime();
    const bag = primeRuntime(runtime, {});
    bag.staleMcpCleaned = true;
    jest.spyOn(runtime, 'ensureReady').mockResolvedValue(true);
    jest.spyOn(runtime as unknown as { ensureSession: () => Promise<string | null> }, 'ensureSession')
      .mockResolvedValue(null);

    const chunks = await collect(runtime.query(turn as never));

    expect(chunks.some((c) => c.type === 'error' && /open a Cursor session/i.test(c.content ?? ''))).toBe(true);
  });
});

describe('CursorChatRuntime.describeStartupFailure', () => {
  it('appends the captured stderr snapshot to the update-CLI guidance', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.process = { getStderrSnapshot: () => 'acp: unknown subcommand' };
    const msg = (runtime.describeStartupFailure as (e: unknown) => string).call(runtime, new Error('x'));
    expect(msg).toContain('unknown subcommand');
    expect(msg).toMatch(/cursor-agent/);
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
