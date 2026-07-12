import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import {
  loadCursorAdvertisedModels,
  saveCursorAdvertisedModels,
} from '@/providers/cursor/runtime/cursorAdvertisedModelStore';

const PATH = '.specorator/cursor-advertised-models.json';

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
  it('round-trips a saved catalog', async () => {
    const adapter = makeAdapter();
    const values = ['default[]', 'claude-opus-4-8[thinking=true]', 'gpt-5.4[reasoning=medium]'];
    await saveCursorAdvertisedModels(adapter, values);
    expect(await loadCursorAdvertisedModels(adapter)).toEqual(values);
  });

  it('returns null when the file does not exist', async () => {
    expect(await loadCursorAdvertisedModels(makeAdapter())).toBeNull();
  });

  it('does not write an empty catalog', async () => {
    const adapter = makeAdapter();
    await saveCursorAdvertisedModels(adapter, []);
    expect(await adapter.exists(PATH)).toBe(false);
  });

  it('returns null for malformed JSON', async () => {
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: 'not json' }))).toBeNull();
  });

  it('returns null on a schema-version mismatch', async () => {
    const stale = JSON.stringify({ v: 99, values: ['default[]'] });
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: stale }))).toBeNull();
  });

  it('drops non-string entries and returns null when nothing usable remains', async () => {
    const dirty = JSON.stringify({ v: 1, values: [123, '', null] });
    expect(await loadCursorAdvertisedModels(makeAdapter({ [PATH]: dirty }))).toBeNull();
  });
});
