import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import {
  loadCursorAdvertisedModels,
  saveCursorAdvertisedModels,
} from '@/providers/cursor/runtime/cursorAdvertisedModelStore';

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

describe('cursorAdvertisedModelStore', () => {
  it('round-trips a saved catalog for the matching CLI key', async () => {
    const adapter = makeAdapter();
    const values = ['default[]', 'claude-opus-4-8[thinking=true]', 'gpt-5.4[reasoning=medium]'];
    await saveCursorAdvertisedModels(adapter, CLI_KEY, values);
    expect(await loadCursorAdvertisedModels(adapter, CLI_KEY)).toEqual(values);
  });

  it('returns null when the CLI key does not match', async () => {
    const adapter = makeAdapter();
    const values = ['default[]'];
    await saveCursorAdvertisedModels(adapter, CLI_KEY, values);
    expect(await loadCursorAdvertisedModels(adapter, 'other-cli|noauth')).toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    expect(await loadCursorAdvertisedModels(makeAdapter(), CLI_KEY)).toBeNull();
  });

  it('does not write an empty catalog', async () => {
    const adapter = makeAdapter();
    await saveCursorAdvertisedModels(adapter, CLI_KEY, []);
    expect(await adapter.exists(PATH)).toBe(false);
  });

  it('returns null for malformed JSON', async () => {
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: 'not json' }), CLI_KEY)).toBeNull();
  });

  it('returns null on a schema-version mismatch', async () => {
    const stale = JSON.stringify({ v: 99, cliKey: CLI_KEY, fetchedAt: 0, values: ['default[]'] });
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: stale }), CLI_KEY)).toBeNull();
  });

  it('returns null for legacy v1 payloads', async () => {
    const legacy = JSON.stringify({ v: 1, values: ['default[]'] });
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: legacy }), CLI_KEY)).toBeNull();
  });

  it('drops non-string entries and returns null when nothing usable remains', async () => {
    const dirty = JSON.stringify({ v: 2, cliKey: CLI_KEY, fetchedAt: 0, values: [123, '', null] });
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: dirty }), CLI_KEY)).toBeNull();
  });
});
