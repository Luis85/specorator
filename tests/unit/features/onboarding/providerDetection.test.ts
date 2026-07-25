import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { ProviderCliResolver, ProviderId, ProviderRegistration } from '@/core/providers/types';
import {
  binaryCandidates,
  detectProviderCli,
  detectProviderClis,
} from '@/features/onboarding/providerDetection';

jest.mock('@/utils/env', () => ({
  ...jest.requireActual('@/utils/env'),
  cliPathRequiresNode: jest.fn(() => false),
  findNodeExecutable: jest.fn(() => '/usr/bin/node'),
}));
jest.mock('@/utils/cliBinaryLocator', () => ({
  // The real `executableCandidateNames`: its per-platform shape is part of what
  // these tests assert, so stubbing it would assert nothing.
  ...jest.requireActual('@/utils/cliBinaryLocator'),
  findBinaryOnPath: jest.fn(() => null),
  // Default to "the resolver named a real, runnable host file", which is what
  // every resolver but Codex's WSL branch guarantees; the other shapes override.
  isExistingFile: jest.fn(() => true),
  isExecutableFile: jest.fn(() => true),
}));

import {
  findBinaryOnPath,
  isExecutableFile,
  isExistingFile,
} from '@/utils/cliBinaryLocator';
import { cliPathRequiresNode, findNodeExecutable } from '@/utils/env';

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
  /** What the provider's Windows spawn can start beyond a native `.exe`. */
  windowsForms?: readonly ('batch' | 'node')[];
}

const STUBS: Stub[] = [
  // Models the self-spawning providers: cmd.exe wrap, no Node prefix.
  { id: 'det-alpha', name: 'Alpha', cli: 'alpha', windowsForms: ['batch'] },
  { id: 'det-beta', name: 'Beta', cli: 'beta' },
  { id: 'det-gamma', name: 'Gamma', cli: 'gamma', extra: ['gamma-alt'] },
  { id: 'det-path', name: 'Path', cli: 'pathcli', extra: ['pathcli-alt'], pathFallback: true },
  // Models Claude: prefixes Node, cannot wrap a batch shim.
  { id: 'det-nobatch', name: 'NoBatch', cli: 'nobatch', windowsForms: ['node'] },
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
        windowsLaunchForms: stub.windowsForms,
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
  jest.mocked(isExistingFile).mockReset();
  jest.mocked(isExistingFile).mockReturnValue(true);
  jest.mocked(isExecutableFile).mockReset();
  jest.mocked(isExecutableFile).mockReturnValue(true);
  jest.mocked(cliPathRequiresNode).mockReset().mockReturnValue(false);
  jest.mocked(findNodeExecutable).mockReset().mockReturnValue('/usr/bin/node');
});

function makePlugin(settings: Record<string, unknown> = {}) {
  return { settings } as never;
}

// Detection's launchability rules are platform-dependent (Windows decides what
// can start a file by extension, POSIX by the permission bit), and these
// fixtures use POSIX-shaped paths — so the suite pins the platform instead of
// inheriting the runner's. The Windows-specific cases override it locally.
const REAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => setPlatform('linux'));
afterAll(() => setPlatform(REAL_PLATFORM));

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

  it('applies the launchability rules to a PATH hit, not just a resolver answer', () => {
    // The bare-command shape (OpenCode) treats the probe as authoritative, so a
    // rule that only guards the resolver branch would leave that whole provider
    // shape reporting ready off an unlaunchable file. Every rule so far was first
    // written on the resolver branch alone — hence one shared classification.
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);
    jest.mocked(findBinaryOnPath).mockReturnValue('/usr/local/bin/pathcli');
    jest.mocked(cliPathRequiresNode).mockReturnValue(true);
    jest.mocked(findNodeExecutable).mockReturnValue(null);

    expect(detectProviderCli(makePlugin(), 'det-path')).toMatchObject({
      status: 'missing',
      cliPath: null,
      unusable: { path: '/usr/local/bin/pathcli', reason: 'missing-node' },
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

  it('does not offer the extensionless npm shim as a Windows candidate', () => {
    // npm installs BOTH `opencode` (an sh script) and `opencode.cmd` on Windows.
    // Windows cannot execute the former, so naming it as the found binary would
    // point at a file nothing on this platform can spawn — and would hide the
    // `.cmd` sibling that is the real entry point.
    const windows = binaryCandidates('det-path', 'win32');

    expect(windows).not.toContain('pathcli');
    expect(windows[0]).toBe('pathcli.exe');
    expect(windows).toEqual(expect.arrayContaining(['pathcli.cmd', 'pathcli-alt.cmd']));
  });

  it('probes bare names off Windows, where an extensionless binary is the norm', () => {
    expect(binaryCandidates('det-path', 'darwin')).toEqual(['pathcli', 'pathcli-alt']);
  });

  it('probes the provider-declared extra binary names alongside the primary command', () => {
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);

    detectProviderCli(makePlugin(), 'det-path');

    const [candidates] = jest.mocked(findBinaryOnPath).mock.calls[0];
    // Asserted by prefix, not exact name: Windows candidates carry an extension
    // (`binaryCandidates` covers the per-platform shapes directly), and this test
    // is about the extra name being probed at all.
    expect(candidates.some((name) => name === 'pathcli' || name.startsWith('pathcli.'))).toBe(true);
    expect(candidates.some((name) => name.startsWith('pathcli-alt'))).toBe(true);
  });

  it('does not promise ready for a file that exists but cannot be executed', () => {
    // A partially installed or copied script without +x fails at spawn with
    // EACCES, so `found` would promise a launch that cannot happen — and a bare
    // "not found" would send the user looking for a file they already have.
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('/usr/local/bin/alpha'),
    } as never);
    jest.mocked(isExecutableFile).mockReturnValue(false);

    expect(detectProviderCli(makePlugin(), 'det-alpha')).toMatchObject({
      status: 'missing',
      cliPath: null,
      unusable: { path: '/usr/local/bin/alpha', reason: 'not-executable' },
    });
  });

  it('refuses a Node-backed entry point when no Node interpreter is reachable', () => {
    // `cliPathRequiresNode` covers `.js` files and `#!…node` scripts. The
    // permission bit says nothing about whether Node exists, and Claude's runtime
    // refuses to start without it (`getMissingNodeError`) on both its paths — so
    // "executable" alone would advertise a provider that cannot launch.
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('/usr/local/lib/node_modules/alpha/cli.js'),
    } as never);
    jest.mocked(cliPathRequiresNode).mockReturnValue(true);
    jest.mocked(findNodeExecutable).mockReturnValue(null);

    expect(detectProviderCli(makePlugin(), 'det-alpha')).toMatchObject({
      status: 'missing',
      unusable: { path: '/usr/local/lib/node_modules/alpha/cli.js', reason: 'missing-node' },
    });
  });

  it('accepts the same Node entry point once an interpreter is reachable', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('/usr/local/lib/node_modules/alpha/cli.js'),
    } as never);
    jest.mocked(cliPathRequiresNode).mockReturnValue(true);

    expect(detectProviderCli(makePlugin(), 'det-alpha').status).toBe('found');
  });

  it('searches for Node the way the runtime does — provider PATH plus the CLI dir', () => {
    // The runtimes spawn with `getEnhancedPath(customPath, cliPath)`, which also
    // adds the CLI's own directory, so a Node shipped beside the CLI counts.
    // Searching the bare provider PATH would report `missing-node` for a bundle
    // the runtime launches fine.
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('/opt/alpha/cli.js'),
    } as never);
    jest.mocked(cliPathRequiresNode).mockReturnValue(true);
    const plugin = makePlugin({
      providerConfigs: { 'det-alpha': { environmentVariables: 'PATH=/opt/node/bin' } },
    });

    detectProviderCli(plugin, 'det-alpha');

    // Substring, not a delimiter split: the separator is platform-dependent and
    // what matters is that the provider's entry reached the search at all.
    expect(jest.mocked(findNodeExecutable).mock.calls[0][0] ?? '').toContain('/opt/node/bin');
  });

  it('prefers the LAST case-insensitive PATH declaration, as the runtime env does', () => {
    // Shared env declares `PATH=`, the provider's own declares `Path=`: the
    // runtime's `pickEnvValueCaseInsensitive` takes the last, so picking the
    // first would search a different path than the spawn will.
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);
    const plugin = makePlugin({
      sharedEnvironmentVariables: 'PATH=/shared/bin',
      providerConfigs: { 'det-path': { environmentVariables: 'Path=/provider/bin' } },
    });

    detectProviderCli(plugin, 'det-path');

    expect(findBinaryOnPath).toHaveBeenCalledWith(expect.anything(), '/provider/bin');
  });

  it('refuses a Windows batch shim under a provider whose launch path cannot run one', () => {
    // npm installs `claude.cmd` on Windows and nothing stops a user pinning it
    // by hand, but the SDK owns the stdio stream — so the file being real and
    // "executable" (an existence check on Windows) is not enough.
    ProviderWorkspaceRegistry.setServices('det-nobatch', {
      cliResolver: stubResolver('C:\\npm\\nobatch.cmd'),
    } as never);
    setPlatform('win32');
    try {
      expect(detectProviderCli(makePlugin(), 'det-nobatch')).toMatchObject({
        status: 'missing',
        cliPath: null,
        unusable: { path: 'C:\\npm\\nobatch.cmd', reason: 'batch-shim' },
      });
    } finally {
      setPlatform('linux');
    }
  });

  it('refuses a Windows file in no form the provider can start', () => {
    // npm's extensionless POSIX sh shim is the realistic one: Windows cannot run
    // it, it is not a batch file, and `X_OK` is an existence check there — so
    // nothing else in the chain catches it.
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('C:\\npm\\alpha'),
    } as never);
    setPlatform('win32');
    try {
      expect(detectProviderCli(makePlugin(), 'det-alpha')).toMatchObject({
        status: 'missing',
        unusable: { path: 'C:\\npm\\alpha', reason: 'unsupported-form' },
      });
    } finally {
      setPlatform('linux');
    }
  });

  it('accepts a Node entry point on Windows only where the provider prefixes Node', () => {
    ProviderWorkspaceRegistry.setServices('det-nobatch', {
      cliResolver: stubResolver('C:\\npm\\node_modules\\nobatch\\cli.js'),
    } as never);
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('C:\\npm\\node_modules\\alpha\\cli.js'),
    } as never);
    jest.mocked(cliPathRequiresNode).mockReturnValue(true);
    setPlatform('win32');
    try {
      // Claude-shaped: Node prefix declared, so the entry point launches.
      expect(detectProviderCli(makePlugin(), 'det-nobatch').status).toBe('found');
      // Self-spawning shape: no Node prefix, so the same file would fail.
      expect(detectProviderCli(makePlugin(), 'det-alpha')).toMatchObject({
        status: 'missing',
        unusable: { reason: 'unsupported-form' },
      });
    } finally {
      setPlatform('linux');
    }
  });

  it('accepts the same batch shim for a provider that wraps it through cmd.exe', () => {
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('C:\\npm\\alpha.cmd'),
    } as never);
    setPlatform('win32');
    try {
      expect(detectProviderCli(makePlugin(), 'det-alpha').status).toBe('found');
    } finally {
      setPlatform('linux');
    }
  });

  it('does not promise ready for a command that runs on another target', () => {
    // Codex in WSL mode resolves to a command inside the distro (`codex`, or a
    // configured Linux path). It exists nowhere on this host, and the host PATH
    // would answer a different question — so it must not read as installed, and
    // a host install would not reach the guest.
    ProviderWorkspaceRegistry.setServices('det-alpha', {
      cliResolver: stubResolver('codex'),
    } as never);
    jest.mocked(isExecutableFile).mockReturnValue(false);
    jest.mocked(isExistingFile).mockReturnValue(false);

    expect(detectProviderCli(makePlugin(), 'det-alpha')).toMatchObject({
      status: 'unknown',
      unknownReason: 'external-target',
      cliPath: null,
    });
  });

  it('probes the provider runtime PATH, not just the host one', () => {
    // A CLI installed only under a provider-scoped `PATH=` override is genuinely
    // launchable — the runtime builds its subprocess PATH from that same env —
    // so ignoring it would report a working install as missing.
    ProviderWorkspaceRegistry.setServices('det-path', { cliResolver: stubResolver(null) } as never);
    const plugin = makePlugin({
      providerConfigs: { 'det-path': { environmentVariables: 'PATH=/opt/provider/bin' } },
    });

    detectProviderCli(plugin, 'det-path');

    expect(findBinaryOnPath).toHaveBeenCalledWith(expect.anything(), '/opt/provider/bin');
  });

  it('carries the reason when nothing authoritative could look', () => {
    // The card needs it: an install helps a confirmed-missing CLI and neither
    // unknown case, so the two must be distinguishable.
    expect(detectProviderCli(makePlugin(), 'det-beta').unknownReason).toBe('no-resolver');
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
