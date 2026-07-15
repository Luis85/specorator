import type { AcpLoadSessionResponse } from '@/providers/acp';
import { CursorSessionModelState } from '@/providers/cursor/runtime/CursorSessionModelState';

const MEDIUM = 'gpt-5.4[reasoning=medium]';
const HIGH = 'gpt-5.4[reasoning=high]';

function modelConfig(
  currentValue: string,
  values: string[] = [MEDIUM, HIGH],
): Pick<AcpLoadSessionResponse, 'configOptions'> {
  return {
    configOptions: [{
      category: 'model',
      currentValue,
      id: 'selected_model',
      name: 'Model',
      options: values.map((value) => ({ name: value, value })),
      type: 'select',
    }],
  };
}

describe('CursorSessionModelState', () => {
  it('captures authoritative config identity, current value, and legal wire values', () => {
    const state = new CursorSessionModelState();

    const result = state.capture(modelConfig(MEDIUM));

    expect(result).toEqual({ hasAuthoritativeCurrent: true, shouldPersist: true });
    expect(state.snapshot()).toEqual({
      configId: 'selected_model',
      values: [MEDIUM, HIGH],
    });
    expect(state.currentValue).toBe(MEDIUM);
    expect(state.isAuthoritative).toBe(true);
  });

  it('clears stale values when an authoritative model selector advertises none', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));

    state.capture(modelConfig(MEDIUM, []));

    expect(state.values).toEqual([]);
  });

  it('preserves a known catalog when a legacy load response advertises no model state', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));

    const result = state.capture({});

    expect(result).toEqual({ hasAuthoritativeCurrent: false, shouldPersist: false });
    expect(state.values).toEqual([MEDIUM, HIGH]);
  });

  it('restores persisted identity without replacing live session current state', () => {
    const state = new CursorSessionModelState();
    state.currentValue = HIGH;

    state.restore({ configId: 'cached_model', values: [MEDIUM, HIGH] });

    expect(state.configId).toBe('cached_model');
    expect(state.currentValue).toBe(HIGH);
    expect(state.values).toEqual([MEDIUM, HIGH]);
  });

  it('does not treat a CLI-wide persisted current value as session-local state', () => {
    const state = new CursorSessionModelState();
    const legacyCache = { configId: 'cached_model', currentValue: MEDIUM, values: [MEDIUM] };

    state.restore(legacyCache);

    expect(state.currentValue).toBeNull();
  });

  it('does not restore persisted selectors after live state advances', () => {
    const state = new CursorSessionModelState();
    const revision = state.revision;
    state.capture(modelConfig(HIGH));

    expect(state.restoreAtRevision(
      { configId: 'cached_model', values: [MEDIUM] },
      revision,
    )).toBe(false);
    expect(state.configId).toBe('selected_model');
    expect(state.values).toEqual([MEDIUM, HIGH]);
  });

  it('does not apply an empty RPC response after a newer notification revision', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));
    const revision = state.revision;
    state.capture(modelConfig(HIGH));

    expect(state.confirmApplied(MEDIUM, revision)).toBe(false);
    expect(state.currentValue).toBe(HIGH);
  });

  it('ignores an authoritative RPC response after a newer notification revision', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));
    const revision = state.revision;
    state.capture(modelConfig(HIGH));

    expect(state.captureAtRevision(modelConfig(MEDIUM), revision)).toBeNull();
    expect(state.currentValue).toBe(HIGH);
  });

  it('forces one explicit application for a fresh session while retaining its selector', () => {
    const state = new CursorSessionModelState();

    state.capture(modelConfig(MEDIUM));
    state.forceReapply();

    expect(state.currentValue).toBeNull();
    expect(state.configId).toBe('selected_model');
    expect(state.values).toEqual([MEDIUM, HIGH]);
  });

  it('keeps the revision monotonic across session resets', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));
    const beforeReset = state.revision;

    state.reset();

    expect(state.revision).toBeGreaterThan(beforeReset);
  });

  it('matches only an advertised exact variant', () => {
    const state = new CursorSessionModelState();
    state.capture(modelConfig(MEDIUM));

    expect(state.match('gpt-5.4-medium')).toBe(MEDIUM);
    expect(state.match('gpt-5.4-high')).toBe(HIGH);
    expect(state.match('gpt-5.4-xhigh')).toBeNull();
  });
});
