import '@/providers';

import { createMockRuntimeHost } from '@test/helpers/runtimeHost';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';

/**
 * Provider-boundary regression test.
 *
 * Asserts the ProviderRegistry seam (ADR 0001) at runtime, *data-driven* over
 * whatever `getRegisteredProviderIds()` returns — so a newly registered
 * provider is automatically held to the same contract, and a provider that
 * registers an incomplete `ProviderRegistration` fails here instead of at some
 * distant call site. Complements the example-based assertions in
 * ProviderRegistry.test.ts; this one is the "every provider, every required
 * surface" sweep.
 */
describe('provider registration contract', () => {
  const providerIds = ProviderRegistry.getRegisteredProviderIds();

  beforeEach(() => {
    // Some runtimes read workspace services at construction. Register inert
    // stubs for every provider so the data-driven create loop stays decoupled
    // from any one provider's workspace wiring.
    ProviderWorkspaceRegistry.clear();
    for (const id of providerIds) {
      ProviderWorkspaceRegistry.setServices(id, {
        mcpManager: {} as never,
        mcpServerManager: {} as never,
      } as never);
    }
  });

  afterEach(() => {
    ProviderWorkspaceRegistry.clear();
  });

  it('registers the built-in providers (subset check; a new provider needs no edit here)', () => {
    // Assert the built-ins are present rather than an exact set: an exact-list
    // toEqual would itself be a hardcoded provider list that a 5th provider
    // forces someone to edit — the very thing noHardcodedProviderList forbids.
    // A subset check still catches an accidentally dropped built-in.
    expect(providerIds).toEqual(
      expect.arrayContaining(['claude', 'codex', 'cursor', 'opencode']),
    );
    expect(providerIds.length).toBeGreaterThanOrEqual(4);
  });

  it.each(providerIds)('"%s" exposes a structurally complete registration', (id) => {
    expect(ProviderRegistry.getProviderDisplayName(id)).toBeTruthy();

    // First-run onboarding metadata (tech-debt 2026-06-07): the banner renders
    // from the registry, so every provider must contribute both fields.
    expect(ProviderRegistry.getFirstRunBlurb(id)).toBeTruthy();
    expect(ProviderRegistry.getCliCommand(id)).toBeTruthy();

    // Onboarding install metadata: the setup view's provider cards render from
    // the registry, so a new provider must contribute install guidance rather
    // than a feature-level `{claude: …}` table (noHardcodedProviderList).
    const install = ProviderRegistry.getCliInstall(id);
    expect(install.docsUrl).toMatch(/^https:\/\//);
    expect(install.authCommand).toBeTruthy();
    expect(install.methods.length).toBeGreaterThan(0);
    expect(install.methods.map((m) => Boolean(m.id && m.label && m.displayCommand)))
      .toEqual(install.methods.map(() => true));
    // `argv: null` means copy-only; a spawnable method must carry a real
    // single-token command plus at least one argument — never a command string
    // waiting to be split by a shell.
    const spawnable = install.methods.flatMap((m) => (m.argv ? [m.argv] : []));
    expect(spawnable.map((argv) => Boolean(argv.command) && !/\s/.test(argv.command) && argv.args.length > 0))
      .toEqual(spawnable.map(() => true));
    // Every platform must be offered at least one route to the CLI, or its
    // provider card would render an install panel with nothing in it.
    const platforms: NodeJS.Platform[] = ['darwin', 'linux', 'win32'];
    const perPlatform = platforms.map((platform) => [
      platform,
      install.methods.filter((m) => !m.platforms || m.platforms.includes(platform)).length > 0,
    ]);
    expect(perPlatform).toEqual(platforms.map((platform) => [platform, true]));

    const caps = ProviderRegistry.getCapabilities(id);
    expect(caps.providerId).toBe(id);
    expect(typeof caps.supportsPlanMode).toBe('boolean');
    expect(typeof caps.supportsFork).toBe('boolean');
    expect(typeof caps.supportsRewind).toBe('boolean');

    const tools = ProviderRegistry.getCanonicalToolNames(id);
    expect(tools).toBeInstanceOf(Set);
    expect(tools.size).toBeGreaterThan(0);

    const ui = ProviderRegistry.getChatUIConfig(id) as unknown as Record<string, unknown>;
    for (const method of ['getModelOptions', 'getCustomModelIds', 'ownsModel']) {
      expect(typeof ui[method]).toBe('function');
    }

    const reconciler = ProviderRegistry.getSettingsReconciler(id) as unknown as Record<string, unknown>;
    for (const method of ['reconcileModelWithEnvironment', 'normalizeModelVariantSettings']) {
      expect(typeof reconciler[method]).toBe('function');
    }

    const history = ProviderRegistry.getConversationHistoryService(id) as unknown as Record<string, unknown>;
    expect(typeof history.hydrateConversationHistory).toBe('function');

    // taskResultInterpreter is optional on the registration; the registry
    // substitutes a neutral default, so the accessor must always resolve one.
    expect(typeof ProviderRegistry.getTaskResultInterpreter(id).resolveTerminalStatus).toBe('function');

    expect(ProviderRegistry.getDefaultProviderConfigs()[id]).toBeDefined();
  });

  it.each(providerIds)('"%s" createChatRuntime yields a runtime tagged with its own id', (id) => {
    const runtime = ProviderRegistry.createChatRuntime({
      providerId: id,
      plugin: {} as never,
      host: createMockRuntimeHost(),
    });
    expect(runtime.providerId).toBe(id);
    expect(typeof runtime.query).toBe('function');
    expect(typeof runtime.getCapabilities).toBe('function');
    expect(typeof runtime.cleanup).toBe('function');
    expect(runtime.getCapabilities().providerId).toBe(id);
  });

  it('routes an unknown provider id to a clear error rather than a silent default', () => {
    expect(() => ProviderRegistry.getCapabilities('ghost' as never)).toThrow(
      'Provider "ghost" is not registered.',
    );
  });
});
