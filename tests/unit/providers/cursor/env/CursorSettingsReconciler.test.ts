import { computeEnvHash } from '@/core/providers/EnvHashReconciler';
import { setProviderEnvironmentVariables } from '@/core/providers/providerEnvironment';
import { cursorSettingsReconciler } from '@/providers/cursor/env/CursorSettingsReconciler';
import {
  getCursorProviderSettings,
  updateCursorProviderSettings,
} from '@/providers/cursor/settings';

const TEST_HOST = 'host-a';

jest.mock('@/utils/env', () => ({
  ...jest.requireActual('@/utils/env'),
  getHostnameKey: () => TEST_HOST,
}));

function settings(envText: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerConfigs: {
      cursor: {
        environmentVariables: envText,
        // Curated subset for the current host; getModelOptions validates against it.
        enabledModelsByHost: { [TEST_HOST]: ['composer-2', 'gpt-5.5'] },
      },
    },
    ...extra,
  };
}

describe('cursorSettingsReconciler.reconcileModelWithEnvironment', () => {
  it('stores the namespaced value when CURSOR_MODEL is set', () => {
    const s = settings('CURSOR_API_KEY=k\nCURSOR_MODEL=gpt-5.5');
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    expect(s.model).toBe('cursor:gpt-5.5');
  });

  it('preserves an explicit CURSOR_MODEL variant for exact ACP matching', () => {
    const s = settings('CURSOR_API_KEY=k\nCURSOR_MODEL=sonnet-4-thinking');
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    expect(s.model).toBe('cursor:sonnet-4-thinking');
  });

  it('preserves a still-valid (namespaced) selection when CURSOR_MODEL is absent', () => {
    const s = settings('CURSOR_API_KEY=k', { model: 'cursor:composer-2' });
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    expect(s.model).toBe('cursor:composer-2');
  });

  it('leaves an explicit selection untouched when CURSOR_MODEL is absent', () => {
    const s = settings('CURSOR_API_KEY=k', { model: 'cursor:no-longer-here' });
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    expect(s.model).toBe('cursor:no-longer-here');
  });

  it('leaves legacy raw state untouched instead of normalizing during env reconciliation', () => {
    const s = settings('CURSOR_API_KEY=k', { model: 'composer-2' });
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    expect(s.model).toBe('composer-2');
  });

  function boundCursorConversation() {
    return {
      id: 'c1',
      providerId: 'cursor',
      sessionId: 'sess-1',
      providerState: { chatSessionId: 'sess-1' },
    } as never;
  }

  it('invalidates the bound session when only CURSOR_SESSION_TOKEN changes', () => {
    const s = settings('CURSOR_API_KEY=k\nCURSOR_SESSION_TOKEN=t1');
    // Seed the saved hash for the current (t1) credential.
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);

    // Rotate ONLY the session token — the API key and base URL are unchanged.
    (s.providerConfigs as { cursor: { environmentVariables: string } }).cursor.environmentVariables =
      'CURSOR_API_KEY=k\nCURSOR_SESSION_TOKEN=t2';
    const conv = boundCursorConversation();
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, [conv]);

    // Session dropped so the new credential can't load the prior one's artifacts.
    expect((conv as { sessionId: string | null }).sessionId).toBeNull();
    expect((conv as { providerState: unknown }).providerState).toBeUndefined();
  });

  it('leaves the bound session intact when the token is unchanged', () => {
    const s = settings('CURSOR_API_KEY=k\nCURSOR_SESSION_TOKEN=t1');
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, []);
    const conv = boundCursorConversation();
    cursorSettingsReconciler.reconcileModelWithEnvironment(s, [conv]);
    expect((conv as { sessionId: string | null }).sessionId).toBe('sess-1');
  });
});

describe('normalizeModelVariantSettings migration', () => {
  it('preserves a persisted full-variant model for exact ACP matching', () => {
    const bag: Record<string, unknown> = { model: 'cursor:sonnet-4-thinking' };
    const changed = cursorSettingsReconciler.normalizeModelVariantSettings(bag);
    expect(changed).toBe(false);
    expect(bag.model).toBe('cursor:sonnet-4-thinking');
    expect(bag.effortLevel).toBeUndefined();
    expect(getCursorProviderSettings(bag).preferredModeByFamily).toEqual({});
  });

  it('leaves a bare family model unchanged', () => {
    const bag: Record<string, unknown> = { model: 'cursor:composer-2' };
    expect(cursorSettingsReconciler.normalizeModelVariantSettings(bag)).toBe(false);
    expect(bag.model).toBe('cursor:composer-2');
  });

  describe('setEnabled', () => {
    it('writes enabled=true into providerConfigs.cursor', () => {
      const settings: Record<string, unknown> = { providerConfigs: { cursor: { enabled: false } } };
      cursorSettingsReconciler.setEnabled?.(settings, true);
      expect(getCursorProviderSettings(settings).enabled).toBe(true);
    });

    it('writes enabled=false into providerConfigs.cursor', () => {
      const settings: Record<string, unknown> = { providerConfigs: { cursor: { enabled: true } } };
      cursorSettingsReconciler.setEnabled?.(settings, false);
      expect(getCursorProviderSettings(settings).enabled).toBe(false);
    });
  });
});

// Regression guard for the bug introduced by commit 3cc5fbd ("stop shadowing
// environmentVariables") and fixed by revert 8bd097c. The bug: dropping
// `environmentVariables` from `updateCursorProviderSettings` -> `setProviderConfig`
// caused the just-entered Cursor env to be wiped by the saveHash that runs
// inside `reconcileModelWithEnvironment` (because `setProviderConfig` REPLACES
// the provider entry, it does not merge). These tests pin the end-to-end
// contract so the regression cannot return silently.
describe('cursor env survives reconcileModelWithEnvironment → saveHash', () => {
  it('preserves environmentVariables when updateCursorProviderSettings writes only environmentHash', () => {
    const bag: Record<string, unknown> = {};
    setProviderEnvironmentVariables(bag, 'cursor', 'CURSOR_API_KEY=foo\nCURSOR_BASE_URL=https://example');

    updateCursorProviderSettings(bag, { environmentHash: 'CURSOR_API_KEY=foo' });

    expect(getCursorProviderSettings(bag).environmentVariables)
      .toBe('CURSOR_API_KEY=foo\nCURSOR_BASE_URL=https://example');
    expect(getCursorProviderSettings(bag).environmentHash).toBe('CURSOR_API_KEY=foo');
  });

  it('round-trips Cursor env through the full reconciler call (env in, env out + hash set)', () => {
    const bag: Record<string, unknown> = {};
    setProviderEnvironmentVariables(bag, 'cursor', 'CURSOR_API_KEY=foo\nCURSOR_BASE_URL=https://example');

    const { changed } = cursorSettingsReconciler.reconcileModelWithEnvironment(bag, []);

    expect(changed).toBe(true);
    const after = getCursorProviderSettings(bag);
    expect(after.environmentVariables)
      .toBe('CURSOR_API_KEY=foo\nCURSOR_BASE_URL=https://example');
    // Hash is a digest of both watched keys (sorted) — never the raw secret values.
    expect(after.environmentHash)
      .toBe(computeEnvHash('CURSOR_API_KEY=foo\nCURSOR_BASE_URL=https://example', ['CURSOR_API_KEY', 'CURSOR_BASE_URL']));
    expect(after.environmentHash).not.toContain('foo');
  });

  it('does not wipe an existing env when the hash is already up to date', () => {
    const bag: Record<string, unknown> = {};
    setProviderEnvironmentVariables(bag, 'cursor', 'CURSOR_API_KEY=foo');
    // Prime the hash (digest) so the reconciler takes the no-op branch.
    updateCursorProviderSettings(bag, { environmentHash: computeEnvHash('CURSOR_API_KEY=foo', ['CURSOR_API_KEY']) });

    const { changed } = cursorSettingsReconciler.reconcileModelWithEnvironment(bag, []);

    expect(changed).toBe(false);
    expect(getCursorProviderSettings(bag).environmentVariables).toBe('CURSOR_API_KEY=foo');
  });
});
