import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { CURSOR_MODEL_CATALOG_TTL_MS } from '@/providers/cursor/runtime/cursorModelCatalog';
import {
  loadCursorSessionModelState,
  saveCursorSessionModelState,
} from '@/providers/cursor/runtime/cursorSessionModelStore';

const PATH = '.specorator/cursor-advertised-models.json';
const CLI_KEY = 'c:/cursor/agent.exe|noauth';

function makeAdapter(initial: Record<string, string> = {}): VaultFileAdapter {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    files,
    exists: jest.fn(async (p: string) => files.has(p)),
    read: jest.fn(async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    }),
    write: jest.fn(async (p: string, c: string) => {
      files.set(p, c);
    }),
  } as unknown as VaultFileAdapter & { files: Map<string, string> };
}

describe('cursorSessionModelStore', () => {
  it('round-trips a saved catalog for the matching CLI key', async () => {
    const adapter = makeAdapter();
    const values = ['default[]', 'claude-opus-4-8[thinking=true]', 'gpt-5.4[reasoning=medium]'];
    const state = { configId: 'selected_model', values };
    await saveCursorSessionModelState(adapter, CLI_KEY, state);
    expect(await loadCursorSessionModelState(adapter, CLI_KEY)).toEqual(state);
  });

  it('returns null when the CLI key does not match', async () => {
    const adapter = makeAdapter();
    const values = ['default[]'];
    await saveCursorSessionModelState(adapter, CLI_KEY, {
      configId: 'model',
      values,
    });
    expect(await loadCursorSessionModelState(adapter, 'other-cli|noauth')).toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    expect(await loadCursorSessionModelState(makeAdapter(), CLI_KEY)).toBeNull();
  });

  it('persists an authoritative empty catalog so stale values stay revoked', async () => {
    const adapter = makeAdapter();
    const state = {
      configId: 'model',
      values: [],
    };
    await saveCursorSessionModelState(adapter, CLI_KEY, state);
    expect(await loadCursorSessionModelState(adapter, CLI_KEY)).toEqual(state);
  });

  it('returns null for malformed JSON', async () => {
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: 'not json' }), CLI_KEY)).toBeNull();
  });

  it('returns null on a schema-version mismatch', async () => {
    const stale = JSON.stringify({ v: 99, cliKey: CLI_KEY, fetchedAt: 0, values: ['default[]'] });
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: stale }), CLI_KEY)).toBeNull();
  });

  it('expires persisted selector state with the model catalog TTL', async () => {
    const stale = JSON.stringify({
      v: 3,
      cliKey: CLI_KEY,
      configId: 'model',
      fetchedAt: Date.now() - CURSOR_MODEL_CATALOG_TTL_MS - 1,
      values: ['default[]'],
    });
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: stale }), CLI_KEY)).toBeNull();
  });

  it('returns null for legacy v1 payloads', async () => {
    const legacy = JSON.stringify({ v: 1, values: ['default[]'] });
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: legacy }), CLI_KEY)).toBeNull();
  });

  it('returns null for v2 payloads that lack opaque config state', async () => {
    const legacy = JSON.stringify({ v: 2, cliKey: CLI_KEY, fetchedAt: 0, values: ['default[]'] });
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: legacy }), CLI_KEY)).toBeNull();
  });

  it('drops non-string entries while preserving an authoritative empty state', async () => {
    const dirty = JSON.stringify({
      v: 3,
      cliKey: CLI_KEY,
      configId: 'model',
      currentValue: null,
      fetchedAt: Date.now(),
      values: [123, '', null],
    });
    expect(await loadCursorSessionModelState(makeAdapter({ [PATH]: dirty }), CLI_KEY)).toEqual({
      configId: 'model',
      values: [],
    });
  });

  it('serializes writes so a slower stale save cannot overwrite a newer catalog', async () => {
    const adapter = makeAdapter();
    const files = (adapter as unknown as { files: Map<string, string> }).files;
    let releaseFirst!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let writeCount = 0;
    (adapter.write as jest.Mock).mockImplementation(async (path: string, content: string) => {
      writeCount += 1;
      if (writeCount === 1) {
        await firstWriteGate;
      }
      files.set(path, content);
    });

    const staleSave = saveCursorSessionModelState(adapter, CLI_KEY, {
      configId: 'old_model',
      values: ['old[]'],
    });
    await Promise.resolve();
    const freshSave = saveCursorSessionModelState(adapter, CLI_KEY, {
      configId: 'new_model',
      values: ['new[]'],
    });
    await Promise.resolve();
    releaseFirst();
    await Promise.all([staleSave, freshSave]);

    expect(await loadCursorSessionModelState(adapter, CLI_KEY)).toEqual({
      configId: 'new_model',
      values: ['new[]'],
    });
  });
});
