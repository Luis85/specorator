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
const STUBS: Array<{ id: ProviderId; name: string; cli: string; extra?: string[] }> = [
  { id: 'det-alpha', name: 'Alpha', cli: 'alpha' },
  { id: 'det-beta', name: 'Beta', cli: 'beta' },
  { id: 'det-gamma', name: 'Gamma', cli: 'gamma', extra: ['gamma-alt'] },
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

  it('falls back to a PATH probe and reports unknown (never missing) with no workspace resolver', () => {
    const detection = detectProviderCli(makePlugin(), 'det-beta');

    expect(detection.status).toBe('unknown');
    expect(detection.cliPath).toBeNull();
    expect(findBinaryOnPath).toHaveBeenCalled();
  });

  it('accepts a fallback hit as found', () => {
    jest.mocked(findBinaryOnPath).mockReturnValue('/opt/bin/beta');

    expect(detectProviderCli(makePlugin(), 'det-beta')).toMatchObject({
      status: 'found',
      cliPath: '/opt/bin/beta',
    });
  });

  it('probes the provider-declared extra binary names alongside the primary command', () => {
    detectProviderCli(makePlugin(), 'det-gamma');

    const [candidates] = jest.mocked(findBinaryOnPath).mock.calls[0];
    expect(candidates).toEqual(expect.arrayContaining(['gamma', 'gamma-alt']));
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
      .filter((detection) => registryIds().includes(detection.providerId));

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
