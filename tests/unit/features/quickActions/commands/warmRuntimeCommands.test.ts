import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { warmRuntimeCommands } from '@/features/quickActions/commands/warmRuntimeCommands';
import type { ProviderRecord } from '@/features/quickActions/skills/types';

jest.mock('@/core/providers/ProviderWorkspaceRegistry', () => ({
  ProviderWorkspaceRegistry: { getRuntimeCommandLoader: jest.fn() },
}));

jest.mock('@/core/types/settings', () => ({
  asSettingsBag: (s: unknown) => s as Record<string, unknown>,
}));

const getLoader = ProviderWorkspaceRegistry.getRuntimeCommandLoader as jest.Mock;

/**
 * Catalog double mirroring `OpencodeCommandCatalog`: one provider-global
 * `runtimeCommands` field that `setRuntimeCommands` replaces wholesale and
 * `listDropdownEntries` reads straight off.
 */
function makeCatalog(initial: string[] = []) {
  let runtimeCommands = [...initial];
  return {
    setRuntimeCommands: jest.fn((commands: { name: string }[]) => {
      runtimeCommands = commands.map((c) => c.name);
    }),
    listDropdownEntries: jest.fn(async () => runtimeCommands.map((name) => ({
      id: name,
      name,
      kind: 'command' as const,
      insertPrefix: '/',
      scope: 'vault' as const,
    }))),
    current: () => runtimeCommands,
  };
}

function makeRecord(catalog: ReturnType<typeof makeCatalog>, isEnabled = true): ProviderRecord {
  return {
    providerId: 'opencode',
    displayName: 'Opencode',
    isEnabled,
    commandCatalog: catalog as never,
    hiddenNames: new Set<string>(),
  };
}

const plugin = { settings: {} } as never;

beforeEach(() => jest.clearAllMocks());

describe('warmRuntimeCommands', () => {
  it('primes an empty catalog from the runtime loader', async () => {
    const catalog = makeCatalog();
    getLoader.mockReturnValue({
      isAvailable: () => true,
      loadCommands: jest.fn().mockResolvedValue([{ name: 'build' }, { name: 'test' }]),
    });

    const primed = await warmRuntimeCommands(plugin, makeRecord(catalog));

    expect(catalog.setRuntimeCommands).toHaveBeenCalled();
    expect(catalog.current()).toEqual(['build', 'test']);
    expect(primed).toBe(true);
  });

  it('does not clobber a catalog a chat tab primed during the load', async () => {
    // The catalog is provider-global and `setRuntimeCommands` replaces
    // wholesale, so `TabProviderCommandCoordinator` writes the same field. Its
    // result is session-backed where ours is headless — if it lands first, ours
    // must stand down.
    const catalog = makeCatalog();
    getLoader.mockReturnValue({
      isAvailable: () => true,
      loadCommands: jest.fn().mockImplementation(async () => {
        // A chat tab's warmup completes while our headless load is in flight.
        catalog.setRuntimeCommands([{ name: 'session-backed' }]);
        return [{ name: 'headless' }];
      }),
    });

    const primed = await warmRuntimeCommands(plugin, makeRecord(catalog));

    expect(catalog.current()).toEqual(['session-backed']);
    // Reports "the catalog holds entries", so the aggregator still re-reads and
    // shows the tab's commands rather than treating the provider as empty.
    expect(primed).toBe(true);
  });

  it('does not blank a populated catalog when the headless load returns nothing', async () => {
    // The damaging case: an isolated session that fails to enumerate would
    // otherwise wipe the commands the composer's dropdown had just discovered,
    // and the aggregator would cache that emptiness for the full TTL.
    const catalog = makeCatalog();
    getLoader.mockReturnValue({
      isAvailable: () => true,
      loadCommands: jest.fn().mockImplementation(async () => {
        catalog.setRuntimeCommands([{ name: 'session-backed' }]);
        return [];
      }),
    });

    const primed = await warmRuntimeCommands(plugin, makeRecord(catalog));

    expect(catalog.current()).toEqual(['session-backed']);
    expect(primed).toBe(true);
  });

  it('never spawns for a disabled provider', async () => {
    const catalog = makeCatalog();

    const primed = await warmRuntimeCommands(plugin, makeRecord(catalog, false));

    expect(getLoader).not.toHaveBeenCalled();
    expect(primed).toBe(false);
  });

  it('reports false when the provider has no runtime loader', async () => {
    // Claude's path: nothing primed, so the caller must not re-read — a second
    // `listDropdownEntries` would spawn another SDK probe for the same answer.
    getLoader.mockReturnValue(null);

    expect(await warmRuntimeCommands(plugin, makeRecord(makeCatalog()))).toBe(false);
  });

  it('reports false when the loader is unavailable for the current settings', async () => {
    getLoader.mockReturnValue({ isAvailable: () => false, loadCommands: jest.fn() });

    expect(await warmRuntimeCommands(plugin, makeRecord(makeCatalog()))).toBe(false);
  });
});
