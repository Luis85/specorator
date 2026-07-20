import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { createHeadlessRuntimeHost, type RuntimeHost } from '@/core/runtime/RuntimeHost';
import { AcpStreamChunkQueue } from '@/providers/acp';
import * as acpBuild from '@/providers/acp/buildAcpUsageInfo';
import { CursorChatRuntime } from '@/providers/cursor/runtime/CursorChatRuntime';
import {
  resetCursorModelCatalog,
  seedCursorModelCatalogForTest,
} from '@/providers/cursor/runtime/cursorModelCatalog';
import { getHostnameKey } from '@/utils/env';

import {
  CURSOR_ADVERTISED_MODEL_VALUES,
  CURSOR_LOAD_SESSION_RESULT,
  CURSOR_NEW_SESSION_RESULT,
} from '../../../../fixtures/providers/cursor/realAcpCaptures';

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
    storage: { getAdapter: () => ({ exists: async () => false, read: async () => '', write: async () => {} }) },
    ...overrides,
  };
  const runtime = new CursorChatRuntime(plugin as never, host);
  const bag = runtime as unknown as Record<string, unknown>;
  const modelState = bag.sessionModel as Record<string, unknown>;
  Object.defineProperties(runtime, {
    advertisedModelValues: {
      get: () => modelState.values,
      set: (value: unknown) => { modelState.values = value; },
    },
    currentSessionModelId: {
      get: () => modelState.currentValue,
      set: (value: unknown) => { modelState.currentValue = value; },
    },
    modelConfigId: {
      get: () => modelState.configId,
      set: (value: unknown) => { modelState.configId = value; },
    },
  });
  return runtime;
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

  it('does not leak a cancelled prior turn planCompleted into the next turn', async () => {
    // The prior turn's finalizePlanTurnMetadata runs while the next turn is blocked
    // in awaitPriorTurnSettled, writing planCompleted into the shared turnMetadata.
    // Resetting metadata AFTER that wait (not at turn entry) must drop the stale flag.
    const runtime = makeRuntime();
    const bag = primeRuntime(runtime, {
      newSession: jest.fn(async () => { throw new Error('no session'); }),
      authenticate: jest.fn(async () => { throw new Error('no auth'); }),
    });
    bag.pendingPromptSettled = Promise.resolve().then(() => {
      (bag.turnMetadata as Record<string, unknown>).planCompleted = true;
    });

    const turn = { persistedContent: 'x', prompt: 'x', request: { images: [] } };
    // Drains to completion — the turn errors out at ensureSession, AFTER the reset.
    for await (const _chunk of runtime.query(turn as never, undefined, undefined)) {
      void _chunk;
    }

    expect(runtime.consumeTurnMetadata().planCompleted).toBeUndefined();
  });

  it('drops a Stop pressed during the prior-prompt wait, before session/prompt fires', async () => {
    // The turn is blocked in awaitPriorTurnSettled with no activeTurn/abort controller
    // yet, so cancel() there is only caught by ownershipCancelRequested — not turnSignal.
    stubProviderSnapshot();
    const runtime = makeRuntime();
    let releasePrior!: () => void;
    const priorSettled = new Promise<void>((resolve) => { releasePrior = resolve; });
    const prompt = jest.fn(async () => ({ stopReason: 'end_turn' }));
    const bag = primeRuntime(runtime, {
      cancel: jest.fn(),
      setMode: jest.fn(async () => ({})),
      prompt,
    });
    bag.sessionId = 's1';
    bag.loadedSessionId = 's1';
    bag.pendingPromptSettled = priorSettled;

    const turn = { persistedContent: 'x', prompt: 'x', request: { images: [] } };
    const gen = runtime.query(turn as never, undefined, undefined);
    const firstStep = gen.next(); // advances into awaitPriorTurnSettled
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
    }

    runtime.cancel();   // Stop pressed while blocked on the prior prompt
    releasePrior();     // let the wait complete

    let step = await firstStep;
    while (!step.done) {
      step = await gen.next();
    }

    expect(prompt).not.toHaveBeenCalled();
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

  it('single-flights concurrent ensureReady calls into one startup', async () => {
    const runtime = makeRuntime();
    let releaseStartup!: () => void;
    const startupGate = new Promise<void>((resolve) => { releaseStartup = resolve; });
    const startProcess = jest
      .spyOn(runtime as unknown as { startProcess: (c: string) => Promise<void> }, 'startProcess')
      .mockImplementation(async () => {
        await startupGate;
        primeRuntime(runtime, {});
      });

    const first = runtime.ensureReady();
    const second = runtime.ensureReady();
    releaseStartup();
    await Promise.all([first, second]);

    expect(startProcess).toHaveBeenCalledTimes(1);
  });
});

describe('CursorChatRuntime.ensureSession', () => {
  it('reuses the requested id when session/load returns no sessionId (real capture shape)', async () => {
    const runtime = makeRuntime();
    // Real Cursor session/load responses carry NO sessionId (see the captured
    // fixture) — the loaded session keeps the id we asked to load. Adopting the
    // response's absent id would abort the resumed turn and discard the session.
    const loadSession = jest.fn().mockResolvedValue(CURSOR_LOAD_SESSION_RESULT);
    const bag = primeRuntime(runtime, { loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    const result = await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBe('S1');
    expect(loadSession).toHaveBeenCalled();
    expect(bag.loadedSessionId).toBe('S1');
    expect(bag.sessionId).toBe('S1');
    expect(bag.sessionInvalidated).toBe(false);
  });

  it('invalidates and falls back to a new session on load rejection', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockRejectedValue(new Error('no such session'));
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S2' });
    const bag = primeRuntime(runtime, { loadSession, newSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    const result = await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBe('S2');
    expect(newSession).toHaveBeenCalled();
    // sessionInvalidated is what triggers the history re-injection on this turn.
    expect(bag.sessionInvalidated).toBe(true);
    expect(bag.sessionId).toBe('S2');
  });

  it('preserves the session id on transient session/load transport failures', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockRejectedValue(new Error('ACP transport closed unexpectedly'));
    const newSession = jest.fn();
    const bag = primeRuntime(runtime, { loadSession, newSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    const result = await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');

    expect(result).toBeNull();
    expect(bag.sessionId).toBe('S1');
    expect(bag.sessionInvalidated).toBe(false);
    expect(newSession).not.toHaveBeenCalled();
  });

  it('passes selected external roots as additionalDirectories on session/new', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S3' });
    const bag = primeRuntime(runtime, { newSession });

    const ensure = bag.ensureSession as (c: string, r?: string[]) => Promise<string | null>;
    await ensure.call(runtime, '/cwd', ['/ext/a', '/ext/b']);

    expect(newSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/cwd', additionalDirectories: ['/ext/a', '/ext/b'] }),
    );
    expect(bag.activeSessionRoots).toEqual(['/ext/a', '/ext/b']);
  });

  it('omits additionalDirectories when no external roots are selected', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S4' });
    const bag = primeRuntime(runtime, { newSession });

    await (bag.ensureSession as (c: string, r?: string[]) => Promise<string | null>).call(runtime, '/cwd', []);

    expect(newSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: undefined }),
    );
  });

  it('threads external roots as additionalDirectories on session/load', async () => {
    const runtime = makeRuntime();
    const loadSession = jest.fn().mockResolvedValue(CURSOR_LOAD_SESSION_RESULT);
    const bag = primeRuntime(runtime, { loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    await (bag.ensureSession as (c: string, r?: string[]) => Promise<string | null>)
      .call(runtime, '/tmp/specorator-test-vault', ['/ext/a']);

    expect(loadSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ['/ext/a'] }),
    );
    expect(bag.activeSessionRoots).toEqual(['/ext/a']);
  });

  it('mints a fresh session when the external-root selection changes on a live session', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S5' });
    const bag = primeRuntime(runtime, { newSession });
    // A live session already opened with root /ext/a.
    bag.sessionId = 'S-live';
    bag.loadedSessionId = 'S-live';
    bag.activeSessionRoots = ['/ext/a'];

    const result = await (bag.ensureSession as (c: string, r?: string[]) => Promise<string | null>)
      .call(runtime, '/cwd', ['/ext/a', '/ext/b']);

    // The root change forces a new session (additionalDirectories are immutable),
    // with sessionInvalidated set so the turn re-injects history.
    expect(result).toBe('S5');
    expect(newSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ['/ext/a', '/ext/b'] }),
    );
    expect(bag.sessionInvalidated).toBe(true);
    expect(bag.activeSessionRoots).toEqual(['/ext/a', '/ext/b']);
  });

  it('reuses the live session when the external-root selection is unchanged', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn();
    const loadSession = jest.fn();
    const bag = primeRuntime(runtime, { newSession, loadSession });
    bag.sessionId = 'S-live';
    bag.loadedSessionId = 'S-live';
    bag.activeSessionRoots = ['/ext/a'];

    const result = await (bag.ensureSession as (c: string, r?: string[]) => Promise<string | null>)
      .call(runtime, '/cwd', ['/ext/a']);

    expect(result).toBe('S-live');
    expect(newSession).not.toHaveBeenCalled();
    expect(loadSession).not.toHaveBeenCalled();
    expect(bag.sessionInvalidated).toBe(false);
  });
});

// Error classification (isCursorAuthenticationFailure /
// isCursorSessionLoadTransportFailure / formatCursorRuntimeError) moved to
// cursorRuntimeErrors.ts and is covered directly by cursorRuntimeErrors.test.ts.

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

  it('resolves the RPC cancelled when cancel() aborts a pending approval', async () => {
    // approval never settles on its own — the real card is destroyed by
    // dismissApproval without resolving, so only the cancel abort can end it.
    const approval = jest.fn(() => new Promise<never>(() => {}));
    const dismissApproval = jest.fn();
    const host = { ...createHeadlessRuntimeHost(), approval, dismissApproval };
    const runtime = makeRuntime({}, host);
    const bag = primeRuntime(runtime, { cancel: jest.fn() });
    bag.sessionId = 'S1';
    bag.askQuestionAbortController = new AbortController();
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const pending = (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);
    // Cancel while the approval is still pending; this aborts the turn signal.
    runtime.cancel();
    const response = await pending;

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
    expect(dismissApproval).toHaveBeenCalled();
  });

  it('resolves the RPC cancelled when the transport closes during a pending approval', async () => {
    const approval = jest.fn(() => new Promise<never>(() => {}));
    const host = { ...createHeadlessRuntimeHost(), approval };
    const runtime = makeRuntime({}, host);
    const bag = primeRuntime(runtime, {});
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', usageModel: null };
    bag.askQuestionAbortController = new AbortController();
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const pending = (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);
    (bag.handleTransportClosed as (t: unknown) => void).call(runtime, bag.transport);
    const response = await pending;

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('keeps the signal aborted after cancel so a late permission request resolves cancelled at once', async () => {
    // An agent that ignored session/cancel stays alive until the 5s escalation
    // and can fire a late session/request_permission. cancel() only aborts the
    // per-turn signal (it does NOT mint a fresh one), so that late request sees
    // the still-aborted signal and its approval card never reopens.
    const approval = jest.fn(() => new Promise<never>(() => {}));
    const dismissApproval = jest.fn();
    const host = { ...createHeadlessRuntimeHost(), approval, dismissApproval };
    const runtime = makeRuntime({}, host);
    const bag = primeRuntime(runtime, { cancel: jest.fn() });
    bag.sessionId = 'S1';
    const controller = new AbortController();
    bag.askQuestionAbortController = controller;

    runtime.cancel();

    // Aborted in place — same controller instance, not replaced.
    expect(controller.signal.aborted).toBe(true);
    expect(bag.askQuestionAbortController).toBe(controller);

    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);
    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    // approval never settles on its own; only the still-aborted signal ends it.
    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('resolves cancelled under yolo mode when the turn signal is already aborted, without auto-approving', async () => {
    // A cancelled turn must beat yolo auto-approval: a late request_permission
    // arriving after cancel must NOT auto-select an allow option (which would
    // run the tool post-cancel) — the aborted signal wins first.
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.autoApprovePermissions = true;
    const controller = new AbortController();
    controller.abort();
    bag.askQuestionAbortController = controller;
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
    expect(response.outcome.optionId).toBeUndefined();
  });

  it('resolves cancelled immediately when the turn signal is already aborted', async () => {
    const approval = jest.fn(() => new Promise<never>(() => {}));
    const host = { ...createHeadlessRuntimeHost(), approval };
    const runtime = makeRuntime({}, host);
    const bag = runtime as unknown as Record<string, unknown>;
    const controller = new AbortController();
    controller.abort();
    bag.askQuestionAbortController = controller;
    const request = makeRequest([{ kind: 'allow_once', optionId: 'ok', name: 'Allow' }]);

    const response = await (bag.handlePermissionRequest as (r: unknown) => Promise<{ outcome: Record<string, unknown> }>)
      .call(runtime, request);

    expect(response.outcome).toEqual({ outcome: 'cancelled' });
  });
});

describe('CursorChatRuntime.emitFinalUsage', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  // The model is resolved once at turn start onto ActiveTurn.usageModel; null
  // suppresses every usage emission (usage contract: never emit without a model).
  function makeActiveTurn(usageModel: string | null = 'gpt-5', usageContextWindow = 0) {
    const push = jest.fn();
    return {
      activeTurn: { queue: { push }, sessionId: 'S', usageContextWindow, usageModel },
      push,
    };
  }

  it('emits the ACP usage payload when prompt usage is present', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, { inputTokens: 10, outputTokens: 5 });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
  });

  it('falls back to the catalog usage when no ACP usage but a model resolves', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, null);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
  });

  it('emits nothing when no model resolves', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const { activeTurn, push } = makeActiveTurn(null);

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, null);

    expect(push).not.toHaveBeenCalled();
  });

  it('carries a stored authoritative context window into the final usage payload', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = { size: 222_000, used: 4_096 };
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, null);

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

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, null);

    expect(push).not.toHaveBeenCalled();
  });

  it('still emits the catalog fallback when neither prompt usage nor context usage was seen', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = null;
    const { activeTurn, push } = makeActiveTurn();

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, null);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].type).toBe('usage');
  });

  it('strips the cursor: prefix before the catalog window fallback', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = null;
    // A picker/settings model is namespaced; the window catalog is keyed by raw
    // ids, so without stripping the prefix gpt-5 collapses to contextWindow: 0.
    const { activeTurn, push } = makeActiveTurn('cursor:gpt-5');

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, { inputTokens: 100, outputTokens: 20 });

    expect(push).toHaveBeenCalledTimes(1);
    const usage = push.mock.calls[0][0].usage;
    expect(usage.contextWindow).toBe(400_000);
  });

  it('uses the effective ACP model context window for new model families', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    runtime.contextUsage = null;
    const { activeTurn, push } = makeActiveTurn('cursor:gpt-5.6-luna', 272_000);

    (runtime.emitFinalUsage as (t: unknown, u: unknown) => void)
      .call(runtime, activeTurn, { inputTokens: 100, outputTokens: 20 });

    expect(push.mock.calls[0][0].usage.contextWindow).toBe(272_000);
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

  it('mints a fresh unaborted signal for the next query after a cancel', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const loadSession = jest.fn().mockResolvedValue(CURSOR_LOAD_SESSION_RESULT);
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, loadSession, setMode, cancel: jest.fn() });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;
    const controllerBeforeCancel = new AbortController();
    bag.askQuestionAbortController = controllerBeforeCancel;

    runtime.cancel();
    // cancel() leaves the aborted controller in place (item 1); the next query
    // must be the one to abort-then-recreate it into a working signal.
    expect(controllerBeforeCancel.signal.aborted).toBe(true);
    expect(bag.askQuestionAbortController).toBe(controllerBeforeCancel);

    await drain(runtime.query(turn as never));

    const controllerAfterQuery = bag.askQuestionAbortController as AbortController;
    expect(controllerAfterQuery).not.toBe(controllerBeforeCancel);
    expect(controllerAfterQuery.signal.aborted).toBe(false);
  });

  it('does not re-inject history when an existing session loads cleanly', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    // Capture-shaped session/load (no sessionId): the loaded session is reused,
    // so the turn prompts on it without re-injecting prior history.
    const loadSession = jest.fn().mockResolvedValue(CURSOR_LOAD_SESSION_RESULT);
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, loadSession, setMode });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;

    await drain(runtime.query(turn as never, history as never));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(promptTextFrom(prompt)).not.toContain('PRIOR_MARKER');
  });
});

describe('CursorChatRuntime.query cancel during startup', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  const turn = { persistedContent: 'hi', prompt: 'go', request: { images: [] } };

  async function collect(gen: AsyncGenerator<unknown>): Promise<Array<{ type: string }>> {
    const out: Array<{ type: string }> = [];
    for await (const chunk of gen) out.push(chunk as { type: string });
    return out;
  }

  it('does not send the prompt when cancel fires during session setup, ending with done', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    // Stop is pressed while newSession is in flight — the per-turn signal aborts
    // before any activeTurn exists, so cancel() has nothing to interrupt. The
    // post-setup abort gate is the only thing that keeps the prompt from firing.
    const newSession = jest.fn().mockImplementation(async () => {
      runtime.cancel();
      return { sessionId: 'S-new' };
    });
    const bag = primeRuntime(runtime, { prompt, setMode, newSession, cancel: jest.fn() });
    bag.sessionId = null;

    const chunks = await collect(runtime.query(turn as never));

    expect(prompt).not.toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('sends the prompt normally when no cancel occurs during setup', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S-new' });
    const bag = primeRuntime(runtime, { prompt, setMode, newSession });
    bag.sessionId = null;

    await collect(runtime.query(turn as never));

    expect(prompt).toHaveBeenCalledTimes(1);
  });
});

describe('CursorChatRuntime.query turn serialization', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const turn = { persistedContent: 'hi', prompt: 'ask now', request: { images: [] } };
  // Mirrors the runtime's private CURSOR_TURN_SERIALIZE_CEILING_MS (escalation 5s
  // + 1s hard ceiling); advancing past it releases a turn whose predecessor never
  // settled.
  const CURSOR_SERIALIZE_CEILING_MS = 6_000;

  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  }

  // Flush queued microtasks (promise continuations) without touching fake timers,
  // so an in-flight query() runs up to its next real suspension point.
  async function flush(): Promise<void> {
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
    }
  }

  async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
    const iterator = gen[Symbol.asyncIterator]();
    while (!(await iterator.next()).done) { /* consume every chunk */ }
  }

  // Turn A resolves its session cleanly (loaded id already cached) and its prompt
  // is a controllable deferred left in flight — the shape a cancelled-but-unsettled
  // turn A has when turn B arrives.
  function primeSerializedTurns(runtime: CursorChatRuntime): {
    bag: Record<string, unknown>;
    aPrompt: ReturnType<typeof deferred<{ usage: null }>>;
    prompt: jest.Mock;
    order: string[];
  } {
    const order: string[] = [];
    const aPrompt = deferred<{ usage: null }>();
    const prompt = jest.fn()
      .mockImplementationOnce(() => { order.push('A'); return aPrompt.promise; })
      .mockImplementationOnce(() => { order.push('B'); return Promise.resolve({ usage: null }); });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, setMode, cancel: jest.fn() });
    bag.sessionId = 'S1';
    bag.loadedSessionId = 'S1';
    return { bag, aPrompt, prompt, order };
  }

  it("holds turn B's prompt until turn A's cancelled prompt settles, preserving order", async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { aPrompt, prompt, order } = primeSerializedTurns(runtime);

    // Turn A: drive it until its prompt is in flight, then cancel and abandon it.
    void drain(runtime.query(turn as never));
    await flush();
    expect(order).toEqual(['A']);
    runtime.cancel();

    // Turn B serializes behind A's still-unsettled prompt: its prompt is withheld.
    const bDone = drain(runtime.query(turn as never));
    await flush();
    expect(order).toEqual(['A']);
    expect(prompt).toHaveBeenCalledTimes(1);

    // Settle A → B is released and sends its prompt, strictly after A's.
    aPrompt.resolve({ usage: null });
    await flush();
    await bDone;
    expect(order).toEqual(['A', 'B']);
  });

  it('atomically assigns turn ownership before simultaneous query starts can both prompt', async () => {
    const runtime = makeRuntime();
    const { aPrompt, prompt, order } = primeSerializedTurns(runtime);
    const ready = deferred<boolean>();
    jest.spyOn(runtime, 'ensureReady').mockImplementation(() => ready.promise);

    const aDone = drain(runtime.query(turn as never));
    const bDone = drain(runtime.query(turn as never));
    await flush();
    ready.resolve(true);
    await flush();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['A']);

    aPrompt.resolve({ usage: null });
    await Promise.all([aDone, bDone]);
    expect(order).toEqual(['A', 'B']);
  });

  it('rejects turn B with a busy error after the bounded ceiling when turn A never settles', async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { aPrompt, prompt } = primeSerializedTurns(runtime);
    const shutdownProcess = jest
      .spyOn(runtime as unknown as { shutdownProcess: () => Promise<void> }, 'shutdownProcess')
      .mockResolvedValue(undefined);

    void drain(runtime.query(turn as never));
    await flush();
    runtime.cancel();

    const chunks: unknown[] = [];
    const bDone = (async () => {
      for await (const chunk of runtime.query(turn as never)) {
        chunks.push(chunk);
      }
    })();
    await flush();
    expect(prompt).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(CURSOR_SERIALIZE_CEILING_MS);
    await flush();
    await bDone;

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(shutdownProcess).toHaveBeenCalled();
    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error' }),
      expect.objectContaining({ type: 'done' }),
    ]));

    aPrompt.resolve({ usage: null });
    await flush();
  });

  it("keeps turn A's aborted signal current during turn B's wait, then rotates once released", async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { bag, aPrompt } = primeSerializedTurns(runtime);

    void drain(runtime.query(turn as never));
    await flush();
    runtime.cancel();
    // cancel() aborts the per-turn signal in place. A late create_plan reads this
    // same controller's (aborted) signal via getAskSignal → resolveCreatePlanOutcome
    // returns cancelled instead of opening A's plan into B.
    const cancelledController = bag.askQuestionAbortController as AbortController;
    expect(cancelledController.signal.aborted).toBe(true);

    const bDone = drain(runtime.query(turn as never));
    await flush();
    // Parked at the serialize wait: B has NOT rotated the abort controller yet, so
    // A's aborted signal is still the current one a late request would observe.
    expect(bag.askQuestionAbortController).toBe(cancelledController);
    expect((bag.askQuestionAbortController as AbortController).signal.aborted).toBe(true);

    aPrompt.resolve({ usage: null });
    await flush();
    await bDone;
    // Released: B minted a fresh, unaborted signal for its own turn.
    expect(bag.askQuestionAbortController).not.toBe(cancelledController);
    expect((bag.askQuestionAbortController as AbortController).signal.aborted).toBe(false);
  });

  it('adds no wait for normal back-to-back turns once the prior prompt settled', async () => {
    // No timer advance happens in this test: if turn B parked on the ceiling under
    // fake timers it would hang and time the test out, so completion proves the
    // settled prior prompt short-circuits the wait.
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, setMode });
    bag.sessionId = 'S1';
    bag.loadedSessionId = 'S1';

    await drain(runtime.query(turn as never));
    await drain(runtime.query(turn as never));

    expect(prompt).toHaveBeenCalledTimes(2);
  });
});

describe('CursorChatRuntime.query prompt ownership exception safety', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const turn = { persistedContent: 'hi', prompt: 'ask now', request: { images: [] } };

  async function flush(): Promise<void> {
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
    }
  }

  function primePromptable(runtime: CursorChatRuntime): jest.Mock {
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, setMode });
    bag.sessionId = 'S1';
    bag.loadedSessionId = 'S1';
    return prompt;
  }

  it('releases ownership when the consumer closes the generator after user_message_start', async () => {
    const runtime = makeRuntime();
    const prompt = primePromptable(runtime);
    jest.spyOn(runtime, 'ensureReady').mockImplementation(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      return true;
    });

    const gen = runtime.query(turn as never);
    const first = await gen.next();
    expect(first.value).toEqual(expect.objectContaining({ type: 'user_message_start' }));
    await gen.return(undefined);
    await flush();

    await (async () => {
      for await (const _chunk of runtime.query(turn as never)) {
        void _chunk;
      }
    })();
    await flush();

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('releases ownership when the consumer closes the generator after assistant_message_start', async () => {
    const runtime = makeRuntime();
    const prompt = primePromptable(runtime);
    jest.spyOn(runtime, 'ensureReady').mockImplementation(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      return true;
    });

    const gen = runtime.query(turn as never);
    await gen.next();
    const second = await gen.next();
    expect(second.value).toEqual(expect.objectContaining({ type: 'assistant_message_start' }));
    await gen.return(undefined);
    await flush();

    await (async () => {
      for await (const _chunk of runtime.query(turn as never)) {
        void _chunk;
      }
    })();
    await flush();

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('releases ownership when ensureReady fails so the next query can prompt', async () => {
    const runtime = makeRuntime();
    const prompt = primePromptable(runtime);
    jest.spyOn(runtime, 'ensureReady')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);

    for await (const _chunk of runtime.query(turn as never)) {
      void _chunk;
    }
    await flush();

    for await (const _chunk of runtime.query(turn as never)) {
      void _chunk;
    }
    await flush();

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('does not let a later queued query clear a Stop that arrived during the serialize wait', async () => {
    const runtime = makeRuntime();
    const priorPrompt = (() => {
      let resolve!: (value: { usage: null }) => void;
      const promise = new Promise<{ usage: null }>((res) => { resolve = res; });
      return { promise, resolve };
    })();
    const prompt = jest.fn()
      .mockImplementationOnce(() => priorPrompt.promise)
      .mockImplementationOnce(() => Promise.resolve({ usage: null }));
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, setMode, cancel: jest.fn() });
    bag.sessionId = 'S1';
    bag.loadedSessionId = 'S1';

    void (async () => {
      for await (const _chunk of runtime.query(turn as never)) {
        void _chunk;
      }
    })();
    await flush();

    const blocked = (async () => {
      for await (const _chunk of runtime.query(turn as never)) {
        void _chunk;
      }
    })();
    await flush();
    runtime.cancel();

    priorPrompt.resolve({ usage: null });
    await flush();
    await blocked;
    await flush();

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('prompts exactly once across A then B then C when each prior turn settles normally', async () => {
    const runtime = makeRuntime();
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { prompt, setMode });
    bag.sessionId = 'S1';
    bag.loadedSessionId = 'S1';

    for (const label of ['A', 'B', 'C']) {
      await (async () => {
        for await (const _chunk of runtime.query({ ...turn, persistedContent: label } as never)) {
          void _chunk;
        }
      })();
      await flush();
    }

    expect(prompt).toHaveBeenCalledTimes(3);
  });
});

describe('CursorChatRuntime.query plan arming', () => {
  beforeEach(stubProviderSnapshot);
  afterEach(() => jest.restoreAllMocks());

  const turn = { persistedContent: 'plan it', prompt: 'plan it', request: { images: [] } };

  async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
    const iterator = gen[Symbol.asyncIterator]();
    while (!(await iterator.next()).done) { /* consume every chunk */ }
  }

  function feedPlanText(runtime: CursorChatRuntime): Promise<void> {
    const bag = runtime as unknown as Record<string, unknown>;
    return (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is the plan' }, messageId: 'm1' },
    });
  }

  it('does not arm the plan flag when set_mode is rejected, so assistant text never completes the plan', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const setMode = jest.fn().mockRejectedValue(new Error('rejected'));
    const prompt = jest.fn().mockImplementation(async () => {
      await feedPlanText(runtime);
      return { usage: null };
    });
    const loadSession = jest.fn().mockResolvedValue({ sessionId: 'S1' });
    const bag = primeRuntime(runtime, { setMode, prompt, loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;
    bag.currentModeId = null;

    await drain(runtime.query(turn as never));

    // set_mode was attempted but rejected, so the tracked mode never advanced to
    // 'plan' — the turn runs non-plan and its assistant text stays out of the gate.
    expect(setMode).toHaveBeenCalled();
    expect(bag.currentModeId).toBeNull();
    expect(bag.currentTurnIsPlan).toBe(false);
    expect((bag.turnMetadata as { planCompleted?: boolean }).planCompleted).toBeUndefined();
  });

  it('arms the plan flag and completes the plan once set_mode succeeds and the agent produces content', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const setMode = jest.fn().mockResolvedValue({});
    const prompt = jest.fn().mockImplementation(async () => {
      await feedPlanText(runtime);
      return { usage: null };
    });
    const loadSession = jest.fn().mockResolvedValue({ sessionId: 'S1' });
    const bag = primeRuntime(runtime, { setMode, prompt, loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;
    bag.currentModeId = null;

    await drain(runtime.query(turn as never));

    expect(setMode).toHaveBeenCalledWith({ modeId: 'plan', sessionId: 'S1' });
    expect(bag.currentTurnIsPlan).toBe(true);
    expect((bag.turnMetadata as { planCompleted?: boolean }).planCompleted).toBe(true);
  });

  it('arms the plan flag without re-issuing set_mode when the session is already in plan mode', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const setMode = jest.fn().mockResolvedValue({});
    const prompt = jest.fn().mockResolvedValue({ usage: null });
    const loadSession = jest.fn().mockResolvedValue({ sessionId: 'S1' });
    const bag = primeRuntime(runtime, { setMode, prompt, loadSession });
    bag.sessionId = 'S1';
    bag.loadedSessionId = null;
    bag.currentModeId = 'plan';

    await drain(runtime.query(turn as never));

    expect(setMode).not.toHaveBeenCalled();
    expect(bag.currentTurnIsPlan).toBe(true);
  });
});

describe('CursorChatRuntime terminal-push dedup', () => {
  it('emits exactly one error and one done when transport close races the rejected prompt', async () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    const activeTurn = { queue, sessionId: 'S', usageModel: null };
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

describe('CursorChatRuntime.cancel escalation', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function primeCancellableTurn(runtime: CursorChatRuntime): {
    bag: Record<string, unknown>;
    queue: AcpStreamChunkQueue;
    turn: { queue: AcpStreamChunkQueue; sessionId: string; usageModel: null; promptSettled: boolean };
    shutdownProcess: jest.Mock;
  } {
    const cancel = jest.fn();
    const bag = primeRuntime(runtime, { cancel });
    bag.sessionId = 'S1';
    const queue = new AcpStreamChunkQueue();
    const turn = { queue, sessionId: 'S1', usageModel: null, promptSettled: false };
    bag.activeTurn = turn;
    const shutdownProcess = jest.fn().mockResolvedValue(undefined);
    bag.shutdownProcess = shutdownProcess;
    return { bag, queue, turn, shutdownProcess };
  }

  it('terminates the turn and recycles the process when the agent ignores cancel', async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { queue, shutdownProcess } = primeCancellableTurn(runtime);

    runtime.cancel();
    jest.advanceTimersByTime(5_000);

    const first = await queue.next() as { type: string };
    const second = await queue.next() as { type: string };
    expect(first.type).toBe('error');
    expect(second.type).toBe('done');
    expect(queue.isClosed).toBe(true);
    expect(shutdownProcess).toHaveBeenCalledTimes(1);
  });

  it('stays armed after the consumer bails out of the generator with the prompt still in flight', async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { bag, queue, turn, shutdownProcess } = primeCancellableTurn(runtime);

    runtime.cancel();
    // Consumer bail-out: the chat controller breaks out of query() as soon as a
    // late chunk wakes it, and query()'s finally nulls this.activeTurn. The
    // fake prompt never settles (agent still running), so promptSettled stays
    // false — escalation MUST NOT be disarmed by the nulled activeTurn.
    bag.activeTurn = null;
    expect(turn.promptSettled).toBe(false);

    jest.advanceTimersByTime(5_000);

    const first = await queue.next() as { type: string };
    const second = await queue.next() as { type: string };
    expect(first.type).toBe('error');
    expect(second.type).toBe('done');
    expect(queue.isClosed).toBe(true);
    expect(shutdownProcess).toHaveBeenCalledTimes(1);
  });

  it('does not escalate when the prompt settles within the grace period', async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { bag, queue, turn, shutdownProcess } = primeCancellableTurn(runtime);

    runtime.cancel();
    // The agent honors session/cancel: the prompt settles (its .finally sets
    // promptSettled and nulls activeTurn) and the turn closes.
    (bag.pushTurnTermination as (t: unknown, c: unknown[]) => void)
      .call(runtime, turn, [{ type: 'done' }]);
    turn.promptSettled = true;
    bag.activeTurn = null;
    jest.advanceTimersByTime(5_000);

    expect(shutdownProcess).not.toHaveBeenCalled();
    expect(queue.isClosed).toBe(true);
  });

  it('does not let a stale escalation timer recycle a replacement process generation', async () => {
    jest.useFakeTimers();
    const runtime = makeRuntime();
    const { bag, shutdownProcess } = primeCancellableTurn(runtime);
    bag.processGeneration = 7;

    runtime.cancel();
    bag.processGeneration = 8;
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();

    expect(shutdownProcess).not.toHaveBeenCalled();
  });

  it('rechecks generation inside the lifecycle lock before a queued escalation recycles', async () => {
    const runtime = makeRuntime();
    const { bag, shutdownProcess } = primeCancellableTurn(runtime);
    bag.processGeneration = 8;

    await (bag.recycleProcess as (expectedGeneration?: number) => Promise<void>).call(runtime, 7);

    expect(shutdownProcess).not.toHaveBeenCalled();
    expect(bag.processGeneration).toBe(8);
  });
});

describe('CursorChatRuntime.handleTransportClosed', () => {
  it('aborts a pending ask_question and dismisses the approval card on process death', () => {
    const dismissApproval = jest.fn();
    const host = { ...createHeadlessRuntimeHost(), dismissApproval };
    const runtime = makeRuntime({}, host);
    const bag = primeRuntime(runtime, {});
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S1', usageModel: null };
    const controller = new AbortController();
    bag.askQuestionAbortController = controller;

    (bag.handleTransportClosed as (t: unknown) => void).call(runtime, bag.transport);

    // The blocking ask promise resolves via the abort, the approval card drops,
    // and the turn terminates — no stranded question card over a hidden composer.
    expect(controller.signal.aborted).toBe(true);
    expect(bag.askQuestionAbortController).toBeNull();
    expect(dismissApproval).toHaveBeenCalled();
    expect(queue.isClosed).toBe(true);
  });

  it('ignores close events from a superseded transport', () => {
    const dismissApproval = jest.fn();
    const host = { ...createHeadlessRuntimeHost(), dismissApproval };
    const runtime = makeRuntime({}, host);
    const bag = primeRuntime(runtime, {});
    const controller = new AbortController();
    bag.askQuestionAbortController = controller;

    (bag.handleTransportClosed as (t: unknown) => void).call(runtime, { isClosed: true });

    expect(controller.signal.aborted).toBe(false);
    expect(dismissApproval).not.toHaveBeenCalled();
  });
});

describe('CursorChatRuntime.applySelectedModel (advertised wire ids)', () => {
  beforeEach(stubProviderSnapshot);

  afterEach(() => {
    jest.restoreAllMocks();
    resetCursorModelCatalog();
  });

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
    const persist = jest.spyOn(
      runtime as unknown as { persistAdvertisedModelState: () => Promise<void> },
      'persistAdvertisedModelState',
    ).mockResolvedValue();
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
    expect(persist).toHaveBeenCalled();
  });

  it('matches the requested variant, not the first family sibling', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    // `high` listed before `medium`: a family-prefix-only match would pin high.
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', [
      'gpt-5.4[reasoning=high]',
      'gpt-5.4[reasoning=medium]',
    ]);

    await applyModel(bag, runtime);

    expect(setConfigOption.mock.calls[0][0].value).toBe('gpt-5.4[reasoning=medium]');
  });

  it('rejects setConfigOption when the family matches but no advertised variant does', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    // Silently sending high for a medium selection would misreport the effort.
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', [
      'gpt-5.4[reasoning=high]',
    ]);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });

  it('applies gpt-5.6-sol when global effort is high but only medium is advertised', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-sol-medium']);
    const hostnameKey = getHostnameKey();
    const runtime = makeRuntime({
      settings: {
        permissionMode: 'normal',
        effortLevel: 'high',
        model: 'cursor:gpt-5.6-sol',
        providers: {
          cursor: {
            enabledModelsByHost: { [hostnameKey]: ['gpt-5.6-sol-medium'] },
          },
        },
      },
    });
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeRuntime(runtime, { setConfigOption });
    bag.advertisedModelValues = ['gpt-5.6-sol[context=272k,reasoning=medium,fast=false]'];

    await (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
      runtime,
      'S1',
      { model: 'cursor:gpt-5.6-sol' },
    );

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: 'S1',
      type: 'select',
      value: 'gpt-5.6-sol[context=272k,reasoning=medium,fast=false]',
    });
    resetCursorModelCatalog();
  });

  it('treats CLI effort preferences as non-authoritative for an ACP session', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-luna-high', 'gpt-5.6-luna-medium']);
    const runtime = makeRuntime({
      settings: {
        permissionMode: 'normal',
        effortLevel: 'high',
        model: 'cursor:gpt-5.6-luna',
      },
    });
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeRuntime(runtime, { setConfigOption });
    bag.advertisedModelValues = ['gpt-5.6-luna[context=272k,reasoning=medium,fast=false]'];

    await (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
      runtime,
      'S1',
      { model: 'cursor:gpt-5.6-luna' },
    );

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: 'S1',
      type: 'select',
      value: 'gpt-5.6-luna[context=272k,reasoning=medium,fast=false]',
    });
  });

  it('preserves an explicit query variant so unsupported effort fails visibly', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-luna-high', 'gpt-5.6-luna-medium']);
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeRuntime(runtime, { setConfigOption });
    bag.advertisedModelValues = ['gpt-5.6-luna[context=272k,reasoning=medium,fast=false]'];

    await expect(
      (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
        runtime,
        'S1',
        { model: 'cursor:gpt-5.6-luna-high' },
      ),
    ).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('rejects gpt-5.6-luna-high when only medium is on the wire', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-luna-high', 'gpt-5.6-luna-medium']);
    const runtime = makeRuntime({
      settings: {
        permissionMode: 'normal',
        effortLevel: 'high',
        model: 'cursor:gpt-5.6-luna',
      },
    });
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.6-luna-high', [
      'gpt-5.6-luna[context=272k,reasoning=medium,fast=false]',
    ]);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
    resetCursorModelCatalog();
  });

  it('rejects gpt-5.6-luna-none when the wire omits an explicit reasoning axis', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-luna-none']);
    const runtime = makeRuntime({
      settings: {
        permissionMode: 'normal',
        effortLevel: 'none',
        model: 'cursor:gpt-5.6-luna',
      },
    });
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.6-luna-none', [
      'gpt-5.6-luna[context=272k,fast=false]',
    ]);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
    resetCursorModelCatalog();
  });

  it('prefers the bare family wire id when no variant was requested', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4', [
      'gpt-5.4[reasoning=high]',
      'gpt-5.4',
    ]);

    await applyModel(bag, runtime);

    expect(setConfigOption.mock.calls[0][0].value).toBe('gpt-5.4');
  });

  it('matches a bare-token bracket variant (e.g. thinking)', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'claude-4.6-opus-thinking', [
      'claude-4.6-opus',
      'claude-4.6-opus[thinking]',
    ]);

    await applyModel(bag, runtime);

    expect(setConfigOption.mock.calls[0][0].value).toBe('claude-4.6-opus[thinking]');
  });

  it('sends an exact advertised value untouched', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'auto', ['auto', 'gpt-5.4[reasoning=medium]']);

    await applyModel(bag, runtime);

    expect(setConfigOption.mock.calls[0][0].value).toBe('auto');
  });

  it('maps an Auto selection to the advertised default[] sentinel against the real catalog', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    // Real Cursor never advertises the literal `auto` id (see
    // CURSOR_ADVERTISED_MODEL_VALUES) — only `default[]`, named "Auto".
    const bag = primeModel(runtime, setConfigOption, 'auto', CURSOR_ADVERTISED_MODEL_VALUES);
    bag.currentSessionModelId = 'gpt-5.4[context=272k,reasoning=medium,fast=false]';

    await applyModel(bag, runtime);

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: 'S1',
      type: 'select',
      value: 'default[]',
    });
    expect(bag.currentSessionModelId).toBe('default[]');
  });

  it('skips re-sending when Auto is selected twice in a row', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'auto', CURSOR_ADVERTISED_MODEL_VALUES);
    bag.currentSessionModelId = 'default[]';

    await applyModel(bag, runtime);

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('rejects Auto when the catalog advertises no default entry', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'auto', ['gpt-5.4[reasoning=medium]']);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });

  it('rejects setConfigOption when no advertised value matches the family', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['claude-4.6-opus[thinking]']);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });

  it('rejects setConfigOption when the session advertised no models at all', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', null);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

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

  it('uses the model config id advertised by the session', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['gpt-5.4[reasoning=medium]']);
    bag.modelConfigId = 'selected_model';

    await applyModel(bag, runtime);

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'selected_model',
      sessionId: 'S1',
      type: 'select',
      value: 'gpt-5.4[reasoning=medium]',
    });
  });

  it('rejects an agent-normalized model that differs from the requested value', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({
      configOptions: [{
        id: 'model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: 'gpt-5.4[reasoning=high]',
        options: [
          { name: 'GPT-5.4 Medium', value: 'gpt-5.4[reasoning=medium]' },
          { name: 'GPT-5.4 High', value: 'gpt-5.4[reasoning=high]' },
        ],
      }],
    });
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', [
      'gpt-5.4[reasoning=medium]',
      'gpt-5.4[reasoning=high]',
    ]);

    await expect(applyModel(bag, runtime)).rejects.toThrow();

    expect(bag.currentSessionModelId).toBe('gpt-5.4[reasoning=high]');
    expect(bag.advertisedModelValues).toEqual([
      'gpt-5.4[reasoning=medium]',
      'gpt-5.4[reasoning=high]',
    ]);
  });

  it('does not overwrite an authoritative config update with an empty RPC response', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const setConfigOption = jest.fn(async () => {
      await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
        sessionId: 'S1',
        update: {
          sessionUpdate: 'config_option_update',
          configOptions: [{
            id: 'model',
            name: 'Model',
            type: 'select',
            category: 'model',
            currentValue: 'gpt-5.4[reasoning=high]',
            options: [
              { name: 'GPT-5.4 Medium', value: 'gpt-5.4[reasoning=medium]' },
              { name: 'GPT-5.4 High', value: 'gpt-5.4[reasoning=high]' },
            ],
          }],
        },
      });
      return { configOptions: [] };
    });
    primeRuntime(runtime, { setConfigOption });
    bag.sessionId = 'S1';
    bag.advertisedModelValues = [
      'gpt-5.4[reasoning=medium]',
      'gpt-5.4[reasoning=high]',
    ];
    jest.spyOn(
      runtime as unknown as { resolveCursorModelForSession: () => string | undefined },
      'resolveCursorModelForSession',
    ).mockReturnValue('gpt-5.4-medium');

    await expect(
      (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>)
        .call(runtime, 'S1', undefined),
    ).rejects.toThrow();

    expect(bag.currentSessionModelId).toBe('gpt-5.4[reasoning=high]');
  });

  it('propagates a setConfigOption rejection without advancing the cache', async () => {
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockRejectedValue(new Error('unsupported'));
    const bag = primeModel(runtime, setConfigOption, 'gpt-5.4-medium', ['gpt-5.4[reasoning=medium]']);

    await expect(applyModel(bag, runtime)).rejects.toThrow('unsupported');

    expect(setConfigOption).toHaveBeenCalled();
    expect(bag.currentSessionModelId).toBeNull();
  });
});

describe('CursorChatRuntime.captureAdvertisedModelValues', () => {
  beforeEach(stubProviderSnapshot);

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
    expect(runtime.modelConfigId).toBe('model');
    expect(runtime.currentSessionModelId).toBe('gpt-5.4[reasoning=medium]');
  });

  it('captures the opaque model config id instead of assuming model', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    (runtime.captureAdvertisedModelValues as (r: unknown) => void).call(runtime, {
      sessionId: 'S1',
      configOptions: [{
        id: 'selected_model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: 'gpt-5.4[reasoning=high]',
        options: [
          { name: 'GPT-5.4 High', value: 'gpt-5.4[reasoning=high]' },
        ],
      }],
    });

    expect(runtime.modelConfigId).toBe('selected_model');
    expect(runtime.currentSessionModelId).toBe('gpt-5.4[reasoning=high]');
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
    expect(bag.currentSessionModelId).toBeNull();

    runtime.resetSession();
    expect(bag.advertisedModelValues).toBeNull();
  });

  it('reapplies the selected model once after session/new even when currentValue already matches', async () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-terra']);
    const wireValue = 'gpt-5.6-terra[context=272k,reasoning=medium,fast=false]';
    const newSessionResponse = {
      sessionId: 'S3',
      models: {
        currentModelId: wireValue,
        availableModels: [{ modelId: wireValue, name: 'gpt-5.6-terra' }],
      },
      configOptions: [{
        id: 'model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: wireValue,
        options: [{ name: 'gpt-5.6-terra', value: wireValue }],
      }],
    };
    const runtime = makeRuntime();
    const setConfigOption = jest.fn().mockResolvedValue({
      configOptions: newSessionResponse.configOptions,
    });
    const bag = primeRuntime(runtime, {
      newSession: jest.fn().mockResolvedValue(newSessionResponse),
      setConfigOption,
    });

    await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');
    await (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
      runtime,
      newSessionResponse.sessionId,
      { model: 'cursor:gpt-5.6-terra' },
    );

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: newSessionResponse.sessionId,
      type: 'select',
      value: wireValue,
    });
  });

  it('persists a fresh session model as unconfirmed until explicit application succeeds', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const persistedCurrentValues: unknown[] = [];
    jest.spyOn(
      runtime as unknown as { persistAdvertisedModelState: () => Promise<void> },
      'persistAdvertisedModelState',
    ).mockImplementation(async () => {
      persistedCurrentValues.push(bag.currentSessionModelId);
    });
    const wireValue = 'gpt-5.6-terra[context=272k,reasoning=medium,fast=false]';

    await (bag.adoptFreshSession as (r: unknown) => Promise<string>).call(runtime, {
      sessionId: 'S3',
      models: {
        currentModelId: wireValue,
        availableModels: [{ modelId: wireValue, name: 'gpt-5.6-terra' }],
      },
      configOptions: [{
        id: 'model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: wireValue,
        options: [{ name: 'gpt-5.6-terra', value: wireValue }],
      }],
    });

    expect(persistedCurrentValues).toEqual([null]);
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

  // Real session/load responses advertise no models/configOptions at all
  // (CURSOR_LOAD_SESSION_RESULT, tests/fixtures/providers/cursor/realAcpCaptures.ts:84-90).
  // Capturing that empty payload over a real session/new catalog used to wipe
  // the wire-id list a resumed session still needs, so a post-resume model
  // selection could never match.
  it('keeps the session/new catalog when a real session/load response advertises none', () => {
    const runtime = makeRuntime() as unknown as Record<string, unknown>;
    (runtime.captureAdvertisedModelValues as (r: unknown) => void).call(runtime, CURSOR_NEW_SESSION_RESULT);
    expect(runtime.advertisedModelValues).toEqual(CURSOR_ADVERTISED_MODEL_VALUES);

    (runtime.captureAdvertisedModelValues as (r: unknown) => void).call(runtime, CURSOR_LOAD_SESSION_RESULT);
    expect(runtime.advertisedModelValues).toEqual(CURSOR_ADVERTISED_MODEL_VALUES);
  });

  it('retains the catalog across ensureSession session/new then session/load, and applySelectedModel still matches a bracket-variant selection', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue(CURSOR_NEW_SESSION_RESULT);
    const loadSession = jest.fn().mockResolvedValue(CURSOR_LOAD_SESSION_RESULT);
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeRuntime(runtime, { newSession, loadSession, setConfigOption });

    await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');
    expect(bag.advertisedModelValues).toEqual(CURSOR_ADVERTISED_MODEL_VALUES);

    // Force the session/load branch on the next ensureSession call, mirroring a
    // resumed conversation whose session id is already known.
    bag.loadedSessionId = null;
    await (bag.ensureSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');
    expect(bag.advertisedModelValues).toEqual(CURSOR_ADVERTISED_MODEL_VALUES);

    jest.spyOn(runtime as unknown as { resolveCursorModelForSession: () => string | undefined }, 'resolveCursorModelForSession')
      .mockReturnValue('claude-opus-4-5[thinking=true]');
    await (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
      runtime,
      bag.sessionId as string,
      undefined,
    );

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: bag.sessionId,
      type: 'select',
      value: 'claude-opus-4-5[thinking=true]',
    });
  });

  it('stores an empty catalog when the FIRST response advertises none, and applySelectedModel rejects', async () => {
    const runtime = makeRuntime();
    const newSession = jest.fn().mockResolvedValue({ sessionId: 'S1', models: { availableModels: [] }, configOptions: [] });
    const setConfigOption = jest.fn().mockResolvedValue({ configOptions: [] });
    const bag = primeRuntime(runtime, { newSession, setConfigOption });

    await (bag.createSession as (c: string) => Promise<string | null>).call(runtime, '/cwd');
    expect(bag.advertisedModelValues).toEqual([]);

    jest.spyOn(runtime as unknown as { resolveCursorModelForSession: () => string | undefined }, 'resolveCursorModelForSession')
      .mockReturnValue('gpt-5.4-medium');
    await expect(
      (bag.applySelectedModel as (s: string, q?: unknown) => Promise<void>).call(
        runtime,
        bag.sessionId as string,
        undefined,
      ),
    ).rejects.toThrow();

    expect(setConfigOption).not.toHaveBeenCalled();
  });
});

// Capture-directory naming (distinct session dir per writer) moved to the
// CursorAcpCaptureSink and is covered by CursorAcpCaptureSink.test.ts.

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
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', usageModel: null };
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

  it('suppresses planCompleted when create_plan already settled the decision in-turn', async () => {
    const runtime = makeRuntime({ settings: { permissionMode: 'plan' } });
    const bag = await feed(runtime, makeNotification('Here is the plan'));
    // create_plan blocked on host.exitPlanMode this turn, so the decision is
    // already made — the post-turn approval card must not double-prompt.
    bag.currentTurnPlanDecidedInline = true;

    (bag.finalizePlanTurnMetadata as () => void).call(runtime);

    expect((bag.turnMetadata as { planCompleted?: boolean }).planCompleted).toBeUndefined();
  });

  it('ignores notifications for a session other than the active turn', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S1', usageModel: null };
    bag.currentTurnIsPlan = true;

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'OTHER',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'x' }, messageId: 'm1' },
    });

    expect(bag.currentTurnSawAssistantContent).toBe(false);
  });

  it('tracks agent-initiated current_mode updates instead of forwarding them', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'S1';
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', usageModel: null };
    bag.currentModeId = 'plan';

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'agent' },
    });

    // The cache follows the agent's switch (so the next applyMode re-issues
    // set_mode), and nothing is forwarded to the stream.
    expect(bag.currentModeId).toBe('agent');
    expect(bag.currentTurnSawAssistantContent).toBe(false);
  });

  it('applies a current_mode update between turns and re-issues setMode next turn', async () => {
    const runtime = makeRuntime();
    const setMode = jest.fn().mockResolvedValue({});
    const bag = primeRuntime(runtime, { setMode });
    bag.sessionId = 'S1';
    bag.activeTurn = null;
    bag.currentModeId = 'plan';

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'agent' },
    });
    await (bag.applyMode as (s: string, m: string) => Promise<void>).call(runtime, 'S1', 'plan');

    expect(setMode).toHaveBeenCalledWith({ modeId: 'plan', sessionId: 'S1' });
  });

  it('ignores current_mode updates for a different session', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'S1';
    bag.currentModeId = 'plan';

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'OTHER',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'agent' },
    });

    expect(bag.currentModeId).toBe('plan');
  });

  it('tracks model config updates between turns', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'S1';
    bag.activeTurn = null;

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: {
        sessionUpdate: 'config_option_update',
        configOptions: [{
          id: 'selected_model',
          name: 'Model',
          type: 'select',
          category: 'model',
          currentValue: 'gpt-5.4[reasoning=high]',
          options: [
            { name: 'GPT-5.4 High', value: 'gpt-5.4[reasoning=high]' },
          ],
        }],
      },
    });

    expect(bag.modelConfigId).toBe('selected_model');
    expect(bag.currentSessionModelId).toBe('gpt-5.4[reasoning=high]');
    expect(bag.advertisedModelValues).toEqual(['gpt-5.4[reasoning=high]']);
  });

  it('clears stale legal values when a model config update advertises none', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.sessionId = 'S1';
    bag.currentSessionModelId = 'gpt-5.4[reasoning=high]';
    bag.advertisedModelValues = ['gpt-5.4[reasoning=high]'];

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: {
        sessionUpdate: 'config_option_update',
        configOptions: [{
          id: 'selected_model',
          name: 'Model',
          type: 'select',
          category: 'model',
          currentValue: 'gpt-5.4[reasoning=high]',
          options: [],
        }],
      },
    });

    expect(bag.modelConfigId).toBe('selected_model');
    expect(bag.advertisedModelValues).toEqual([]);
  });

  it('records the context window carried by a usage_update', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', usageModel: null };

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'usage_update', size: 222_000, used: 4_096 },
    });

    expect(bag.contextUsage).toMatchObject({ size: 222_000, used: 4_096 });
  });

  it('suppresses the mid-turn usage chunk when no model is resolved for the turn', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S1', usageModel: null };

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'usage_update', size: 222_000, used: 4_096 },
    });

    // usage contract: never emit without a model — but the authoritative
    // context window is still recorded for the final usage chunk.
    queue.close();
    expect(await queue.next()).toBeNull();
    expect(bag.contextUsage).toMatchObject({ size: 222_000 });
  });

  it('emits the mid-turn usage chunk with the model resolved at turn start', async () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const queue = new AcpStreamChunkQueue();
    bag.activeTurn = { queue, sessionId: 'S1', usageModel: 'gpt-5.4-medium' };

    await (bag.handleSessionNotification as (n: unknown) => Promise<void>).call(runtime, {
      sessionId: 'S1',
      update: { sessionUpdate: 'usage_update', size: 222_000, used: 4_096 },
    });

    const chunk = await queue.next() as { type: string; usage?: { model?: string } };
    expect(chunk.type).toBe('usage');
    expect(chunk.usage?.model).toBe('gpt-5.4-medium');
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

    (bag.readyState as { set: (r: boolean) => void }).set(true);
    off();
    (bag.readyState as { set: (r: boolean) => void }).set(false);

    expect(seen).toEqual([true]);
  });

  it('does not re-notify ready listeners when the value is unchanged', () => {
    const runtime = makeRuntime();
    const bag = runtime as unknown as Record<string, unknown>;
    const seen: boolean[] = [];
    runtime.onReadyStateChange((ready) => seen.push(ready));

    (bag.readyState as { set: (r: boolean) => void }).set(false);
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
    (bag.readyState as { set: (r: boolean) => void }).set(true);
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
    bag.activeTurn = { queue: new AcpStreamChunkQueue(), sessionId: 'S1', usageModel: null };

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
