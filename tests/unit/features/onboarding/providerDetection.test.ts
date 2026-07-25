import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { ProviderCliResolver, ProviderId, ProviderRegistration } from '@/core/providers/types';
import { detectProviderCli, detectProviderClis } from '@/features/onboarding/providerDetection';

jest.mock('@/utils/cliBinaryLocator', () => ({
  findBinaryOnPath: jest.fn(() => null),
}));

import { findBinaryOnPath } from '@/utils/cliBinaryLocator';

// Stub registrations rather than importing `@/providers`: the real aggregator
// drags the MCP SDK's ESM-only deps in, and detection only needs the registry's
// name/blurb/cli/install surface.
interface Stub {
  id: ProviderId;
  name: string;
  cli: string;
  extra?: string[];
  /** Models OpenCode: the runtime spawns the bare command, so PATH counts. */
  pathFallback?: boolean;
}

const STUBS: Stub[] = [
  { id: 'det-alpha', name: 'Alpha', cli: 'alpha' },
  { id: 'det-beta', name: 'Beta', cli: 'beta' },
  { id: 'det-gamma', name: 'Gamma', cli: 'gamma', extra: ['gamma-alt'] },
  { id: 'det-path', name: 'Path', cli: 'pathcli', extra: ['pathcli-alt'], pathFallback: true },
];

function stubResolver(resolved: string | null): ProviderCliResolver & { resetCalls: number } {
  const resolver = {
    resetCalls: 0,
    reset(): void {
      resolver.resetCalls += 1;
    },
    resolveFromSettings(): string | null {
      return resolved;
    },
  };
  return resolver;
}

function registryIds(): ProviderId[] {
  return STUBS.map((stub) => stub.id);
}

beforeAll(() => {
  for (const stub of STUBS) {
    ProviderRegistry.register(stub.id, {
      displayName: stub.name,
      firstRunBlurb: `${stub.name} CLI`,
      cliCommand: stub.cli,
      cliInstall: {
        docsUrl: 'https://example.test/docs',
        authCommand: `${stub.cli} login`,
        extraBinaryNames: stub.extra,
        runtimeFallsBackToPathLookup: stub.pathFallback,
        methods: [],
      },
      isEnabled: (settings: Record<string, unknown>) => Boolean(
        (settings.providerConfigs as Record<string, { enabled?: boolean }> | undefined)
          ?.[stub.id]?.enabled,
      ),
    } as unknown as ProviderRegistration);
  }
  // Keep the registry's own provider list out of the assertions: only these stubs
  // matter, so filter by id where order is checked.
});

afterEach(() => {
  ProviderWorkspaceRegistry.clear();
  jest.mocked(findBinaryOnPath).mockReset();
  jest.mocked(findBinaryOnPath).mockReturnValue(null);
});

function makePlugin(settings: Record<string, unknown> = {}) {
  return { settings } as never;
}

describe('detectProviderCli', () => {
  it('reports found with the path the provider resolver returns', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('/usr/local/bin/alpha'),
    } as never);

    const detection = detectProviderCli(makePlugin(), 'det-alpha');

    expect(detection.status).toBe('found');
    expect(detection.cliPath).toBe('/usr/local/bin/alpha');
    expect(detection.displayName).toBe('Alpha');
    expect(detection.cliCommand).toBe('alpha');
  });

  it('resets the memoizing resolver before probing so a post-install re-probe is not cached', () => {
    const resolver = stubResolver(null);
    ProviderWorkspaceRegistry.setServices('det-alpha', { cliResolver: resolver } as never);

    detectProviderCli(makePlugin(), 'det-alpha');
    detectProviderCli(makePlugin(), 'det-alpha');

    expect(resolver.resetCalls).toBe(2);
  });

  it('reports missing when the provider resolver looked and found nothing', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', { cliResolver: stubResolver(null) } as never);

    expect(detectProviderCli(makePlugin(), 'det-alpha').status).toBe('missing');
    expect(findBinaryOnPath).not.toHaveBeenCalled();
  });

  it('reports unknown (never missing) with no workspace resolver', () => {
    const detection = detectProviderCli(makePlugin(), 'det-beta');

    expect(detection.status).toBe('unknown');
    expect(detection.cliPath).toBeNull();
  });

  it('does NOT claim a PATH hit is usable when the runtime needs a resolved path', () => {
    // Without a workspace resolver `getResolvedProviderCliPath` returns null and
    // Claude/Codex/Cursor runtimes refuse to start, so a bare PATH match must not
    // be reported as ready.
    jest.mocked(findBinaryOnPath).mockReturnValue('/opt/bin/beta');

    expect(detectProviderCli(makePlugin(), 'det-beta')).toMatchObject({
      status: 'unknown',
      cliPath: null,
    });
  });

  it('treats a PATH install as found when the runtime spawns the bare command', () => {
    // OpenCode's resolver is configured-paths-only, so its null means "no pin,
    // use PATH" — reporting missing would call a working install broken.
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);
    jest.mocked(findBinaryOnPath).mockReturnValue('/usr/local/bin/pathcli');

    expect(detectProviderCli(makePlugin(), 'det-path')).toMatchObject({
      status: 'found',
      cliPath: '/usr/local/bin/pathcli',
    });
  });

  it('still reports missing for a bare-command provider with nothing on PATH', () => {
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);

    expect(detectProviderCli(makePlugin(), 'det-path')).toMatchObject({
      status: 'missing',
      cliPath: null,
    });
  });

  it('a configured path still wins for a bare-command provider', () => {
    ProviderWorkspaceRegistry.setServices('det-path', {
      cliResolver: stubResolver('/pinned/pathcli'),
    } as never);

    expect(detectProviderCli(makePlugin(), 'det-path').cliPath).toBe('/pinned/pathcli');
    expect(findBinaryOnPath).not.toHaveBeenCalled();
  });

  it('probes the provider-declared extra binary names alongside the primary command', () => {
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);

    detectProviderCli(makePlugin(), 'det-path');

    const [candidates] = jest.mocked(findBinaryOnPath).mock.calls[0];
    expect(candidates).toEqual(expect.arrayContaining(['pathcli', 'pathcli-alt']));
  });

  it('reflects the provider enabled flag from live settings', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', { cliResolver: stubResolver(null) } as never);
    const plugin = makePlugin({ providerConfigs: { 'det-alpha': { enabled: true } } });

    expect(detectProviderCli(plugin, 'det-alpha').enabled).toBe(true);
  });
});

describe('detectProviderClis', () => {
  it('sorts detected providers first, then unknown, then missing', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', { cliResolver: stubResolver(null) } as never);
    ProviderWorkspaceRegistry.setServices('det-gamma', {
      cliResolver: stubResolver('/bin/gamma'),
    } as never);
    // det-beta has no resolver → 'unknown' via the fallback probe.

    const ordered = detectProviderClis(makePlugin())
      .filter((detection) => ['det-alpha', 'det-beta', 'det-gamma'].includes(detection.providerId));

    expect(ordered.map((detection) => [detection.providerId, detection.status])).toEqual([
      ['det-gamma', 'found'],
      ['det-beta', 'unknown'],
      ['det-alpha', 'missing'],
    ]);
  });

  it('keeps registration order within a status group so cards do not shuffle between probes', () => {
    for (const stub of STUBS) {
      ProviderWorkspaceRegistry.setServices(stub.id, { cliResolver: stubResolver(null) } as never);
    }

    const first = detectProviderClis(makePlugin())
      .filter((detection) => registryIds().includes(detection.providerId))
      .map((detection) => detection.providerId);
    const second = detectProviderClis(makePlugin())
      .filter((detection) => registryIds().includes(detection.providerId))
      .map((detection) => detection.providerId);

    expect(first).toEqual(registryIds());
    expect(second).toEqual(first);
  });
});
