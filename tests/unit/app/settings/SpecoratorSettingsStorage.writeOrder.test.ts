import { SpecoratorSettingsStorage } from '@/app/settings/SpecoratorSettingsStorage';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { SpecoratorSettings } from '@/core/types/settings';

/**
 * Every settings control persists the moment it is touched (the onboarding
 * provider cards and the settings tabs alike), so two saves can be in flight at
 * once. The writes must not race: an earlier snapshot landing last would leave
 * the file holding a value the user already changed, with memory disagreeing
 * until the next restart.
 */
function deferredWriteAdapter() {
  const pending: Array<{ content: string; resolve: () => void }> = [];
  const written: string[] = [];
  const adapter = {
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn(),
    delete: jest.fn(),
    write: jest.fn((_path: string, content: string) => new Promise<void>((resolve) => {
      pending.push({
        content,
        resolve: () => {
          written.push(content);
          resolve();
        },
      });
    })),
  } as unknown as jest.Mocked<VaultFileAdapter>;
  return { adapter, pending, written };
}

function settingsWith(model: string): SpecoratorSettings {
  return { model } as unknown as SpecoratorSettings;
}

describe('SpecoratorSettingsStorage.save concurrency', () => {
  it('does not start a second write while the first is still in flight', async () => {
    const { adapter, pending } = deferredWriteAdapter();
    const storage = new SpecoratorSettingsStorage(adapter);

    const first = storage.save(settingsWith('first'));
    const second = storage.save(settingsWith('second'));
    await Promise.resolve();

    expect(pending).toHaveLength(1);

    pending[0].resolve();
    await first;
    await Promise.resolve();
    expect(pending).toHaveLength(2);

    pending[1].resolve();
    await second;
  });

  it('leaves the file holding the LAST snapshot when two saves overlap', async () => {
    const { adapter, pending, written } = deferredWriteAdapter();
    const storage = new SpecoratorSettingsStorage(adapter);

    const first = storage.save(settingsWith('first'));
    const second = storage.save(settingsWith('second'));

    await Promise.resolve();
    pending[0].resolve();
    await first;
    await Promise.resolve();
    pending[1].resolve();
    await second;

    expect(written).toHaveLength(2);
    expect(JSON.parse(written[1]).model).toBe('second');
  });

  it('persists the state as of its own call, not the shared object at write time', async () => {
    // The settings bag is shared and mutated in place, so serializing lazily
    // (inside the queued turn) would let a later mutation ride along with an
    // earlier save — and the second save would then write it twice.
    const { adapter, pending, written } = deferredWriteAdapter();
    const storage = new SpecoratorSettingsStorage(adapter);
    const shared = settingsWith('first');

    const first = storage.save(shared);
    shared.model = 'mutated-after-first-save';
    await Promise.resolve();
    pending[0].resolve();
    await first;

    expect(JSON.parse(written[0]).model).toBe('first');
  });

  it('a failed write does not wedge the next save', async () => {
    const { adapter, pending } = deferredWriteAdapter();
    jest.mocked(adapter.write).mockRejectedValueOnce(new Error('EACCES'));
    const storage = new SpecoratorSettingsStorage(adapter);

    await expect(storage.save(settingsWith('first'))).rejects.toThrow('EACCES');

    const second = storage.save(settingsWith('second'));
    await Promise.resolve();
    expect(pending).toHaveLength(1);
    pending[0].resolve();

    await expect(second).resolves.toBeUndefined();
  });
});
