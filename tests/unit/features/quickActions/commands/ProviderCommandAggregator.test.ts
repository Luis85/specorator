import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { ProviderCommandAggregator } from '@/features/quickActions/commands/ProviderCommandAggregator';
import type { CommandTabEntry } from '@/features/quickActions/commands/types';
import type { ProviderRecord } from '@/features/quickActions/skills/types';

function makeEntry(overrides: Partial<ProviderCommandEntry> = {}): ProviderCommandEntry {
  return {
    id: 'cmd-review',
    providerId: 'claude',
    kind: 'command',
    name: 'review',
    description: 'Review a pull request',
    content: '',
    scope: 'vault',
    source: 'user',
    isEditable: true,
    isDeletable: true,
    displayPrefix: '/',
    insertPrefix: '/',
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<ProviderRecord> & {
    entries?: ProviderCommandEntry[] | (() => Promise<ProviderCommandEntry[]>);
  } = {},
): ProviderRecord {
  const { entries = [], ...rest } = overrides;
  return {
    providerId: 'claude',
    displayName: 'Claude',
    isEnabled: true,
    hiddenNames: new Set<string>(),
    commandCatalog: {
      setRuntimeCommands: jest.fn(),
      listDropdownEntries: typeof entries === 'function'
        ? jest.fn().mockImplementation(entries)
        : jest.fn().mockResolvedValue(entries),
      listVaultEntries: jest.fn().mockResolvedValue([]),
      saveVaultEntry: jest.fn(),
      deleteVaultEntry: jest.fn(),
      getDropdownConfig: jest.fn(),
      refresh: jest.fn(),
    },
    ...rest,
  };
}

describe('ProviderCommandAggregator', () => {
  it('reads the dropdown listing with built-ins and keeps only command-kind entries', async () => {
    const record = makeRecord({
      entries: [
        makeEntry({ id: 'cmd-review', name: 'review' }),
        makeEntry({ id: 'skill-tdd', name: 'tdd', kind: 'skill' }),
      ],
    });
    const aggregator = new ProviderCommandAggregator(() => [record]);

    const entries = await aggregator.listAll();

    expect(record.commandCatalog.listDropdownEntries).toHaveBeenCalledWith({
      includeBuiltIns: true,
    });
    expect(entries.map((e) => e.name)).toEqual(['review']);
    expect(entries[0]).toMatchObject<Partial<CommandTabEntry>>({
      id: 'claude:cmd-review',
      providerId: 'claude',
      providerDisplayName: 'Claude',
      insertPrefix: '/',
      providerEnabled: true,
    });
  });

  it('carries the argument hint through so the picker can seed instead of send', async () => {
    const aggregator = new ProviderCommandAggregator(() => [
      makeRecord({ entries: [makeEntry({ argumentHint: '[pr-url]' })] }),
    ]);

    const [entry] = await aggregator.listAll();

    expect(entry.argumentHint).toBe('[pr-url]');
  });

  it('drops commands the user hid from the composer dropdown', async () => {
    const aggregator = new ProviderCommandAggregator(() => [
      makeRecord({
        hiddenNames: new Set(['review']),
        entries: [makeEntry({ name: 'Review' }), makeEntry({ id: 'cmd-b', name: 'build' })],
      }),
    ]);

    const entries = await aggregator.listAll();

    expect(entries.map((e) => e.name)).toEqual(['build']);
  });

  it.each(['clear', 'new', 'add-dir', 'resume', 'fork'])(
    'drops %s, which InputController intercepts as a built-in before provider dispatch',
    async (shadowed) => {
      // sendMessage runs detectBuiltInCommand first, so such a row would fire
      // Specorator's local action rather than the provider command it advertises.
      // The composer dropdown already skips these collisions; the tab must too.
      const aggregator = new ProviderCommandAggregator(() => [
        makeRecord({
          entries: [
            makeEntry({ id: 'cmd-shadowed', name: shadowed }),
            makeEntry({ id: 'cmd-ok', name: 'review' }),
          ],
        }),
      ]);

      const entries = await aggregator.listAll();

      expect(entries.map((e) => e.name)).toEqual(['review']);
    },
  );

  it('keeps a provider command whose name merely resembles a built-in', async () => {
    // The guard matches whole names, not substrings — `/compact` and
    // `/clear-cache` reach the provider untouched and must stay listed.
    const aggregator = new ProviderCommandAggregator(() => [
      makeRecord({
        entries: [
          makeEntry({ id: 'cmd-compact', name: 'compact' }),
          makeEntry({ id: 'cmd-clear-cache', name: 'clear-cache' }),
        ],
      }),
    ]);

    const entries = await aggregator.listAll();

    expect(entries.map((e) => e.name)).toEqual(['clear-cache', 'compact']);
  });

  it('de-duplicates by name so a cold vault listing and a warm SDK listing cannot double up', async () => {
    const aggregator = new ProviderCommandAggregator(() => [
      makeRecord({
        entries: [
          makeEntry({ id: 'cmd-vault', name: 'review' }),
          makeEntry({ id: 'cmd-sdk', name: 'Review', scope: 'runtime' }),
        ],
      }),
    ]);

    const entries = await aggregator.listAll();

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('claude:cmd-vault');
  });

  it('serves the TTL cache and re-fetches once it expires', async () => {
    let now = 1_000;
    const record = makeRecord({ entries: [makeEntry()] });
    const aggregator = new ProviderCommandAggregator(() => [record], {
      ttlMs: 500,
      nowMs: () => now,
    });

    await aggregator.listAll();
    await aggregator.listAll();
    expect(record.commandCatalog.listDropdownEntries).toHaveBeenCalledTimes(1);

    now += 501;
    await aggregator.listAll();
    expect(record.commandCatalog.listDropdownEntries).toHaveBeenCalledTimes(2);
  });

  it('re-tags provider enablement from the live record without invalidation', async () => {
    const record = makeRecord({ entries: [makeEntry()] });
    const aggregator = new ProviderCommandAggregator(() => [record]);

    await aggregator.listAll();
    record.isEnabled = false;

    expect(aggregator.listCachedNow()[0].providerEnabled).toBe(false);
  });

  it('deduplicates concurrent fetches for the same provider', async () => {
    const record = makeRecord({ entries: [makeEntry()] });
    const aggregator = new ProviderCommandAggregator(() => [record]);

    await Promise.all([aggregator.listAll(), aggregator.listAll()]);

    expect(record.commandCatalog.listDropdownEntries).toHaveBeenCalledTimes(1);
  });

  it('preserves the last-known-good bucket when a revalidation rejects', async () => {
    let now = 1_000;
    let shouldFail = false;
    const record = makeRecord({
      entries: () =>
        shouldFail ? Promise.reject(new Error('boom')) : Promise.resolve([makeEntry()]),
    });
    const warn = jest.fn();
    const aggregator = new ProviderCommandAggregator(() => [record], {
      ttlMs: 500,
      nowMs: () => now,
      logger: { scope: () => ({ warn }) } as never,
    });

    await aggregator.listAll();
    now += 501;
    shouldFail = true;

    // A transient provider failure must not blank rows the user could still run.
    const entries = await aggregator.listAll();
    expect(entries.map((e) => e.name)).toEqual(['review']);
    expect(warn).toHaveBeenCalled();
  });

  it('primes a runtime-backed catalog whose listing came back empty, then re-reads it', async () => {
    // Opencode holds its commands only in `runtimeCommands`, which nothing in
    // the modal path fills — without the warmup the tab would report Opencode
    // as having no commands and cache that emptiness for the full TTL.
    let primed = false;
    const record = makeRecord({
      providerId: 'opencode',
      displayName: 'Opencode',
      entries: () => Promise.resolve(
        primed ? [makeEntry({ id: 'cmd-test', providerId: 'opencode', name: 'test' })] : [],
      ),
    });
    const warm = jest.fn().mockImplementation(() => {
      primed = true;
      return Promise.resolve(true);
    });
    const aggregator = new ProviderCommandAggregator(() => [record], {
      warmRuntimeCommands: warm,
    });

    const entries = await aggregator.listAll();

    expect(warm).toHaveBeenCalledWith(record);
    expect(entries.map((e) => e.name)).toEqual(['test']);
  });

  it('does not re-read when the warmup primed nothing, sparing a second SDK probe', async () => {
    // Claude has no runtime loader, so the hook primes nothing. Re-reading its
    // catalog would run `ensureProbed()` again — a second subprocess for the
    // same empty answer.
    const record = makeRecord({ entries: [] });
    const aggregator = new ProviderCommandAggregator(() => [record], {
      warmRuntimeCommands: jest.fn().mockResolvedValue(false),
    });

    expect(await aggregator.listAll()).toEqual([]);
    expect(record.commandCatalog.listDropdownEntries).toHaveBeenCalledTimes(1);
  });

  it('does not pay for the runtime warmup when the catalog already answered', async () => {
    const warm = jest.fn();
    const aggregator = new ProviderCommandAggregator(
      () => [makeRecord({ entries: [makeEntry()] })],
      { warmRuntimeCommands: warm },
    );

    await aggregator.listAll();

    expect(warm).not.toHaveBeenCalled();
  });

  it('never asks a disabled provider for its listing', async () => {
    // A cold `listDropdownEntries()` can spawn — Claude's probes the SDK in a
    // subprocess — so merely opening the tab must not launch an opted-out
    // provider. (The skills aggregator's disk scan has no such hazard.)
    const record = makeRecord({ isEnabled: false, entries: [makeEntry()] });
    const warm = jest.fn();
    const aggregator = new ProviderCommandAggregator(() => [record], {
      warmRuntimeCommands: warm,
    });

    const entries = await aggregator.listAll();

    expect(record.commandCatalog.listDropdownEntries).not.toHaveBeenCalled();
    expect(warm).not.toHaveBeenCalled();
    expect(entries).toEqual([]);
  });

  it('does not cache the disabled state, so re-enabling inside the TTL fetches live', async () => {
    // An empty bucket committed while disabled would be served for the rest of
    // the TTL, leaving a just-enabled provider looking command-less.
    let now = 1_000;
    const record = makeRecord({ isEnabled: false, entries: [makeEntry()] });
    const aggregator = new ProviderCommandAggregator(() => [record], {
      ttlMs: 60_000,
      nowMs: () => now,
    });

    expect(await aggregator.listAll()).toEqual([]);

    record.isEnabled = true;
    now += 10; // well inside the TTL a cached empty bucket would have claimed

    expect((await aggregator.listAll()).map((e) => e.name)).toEqual(['review']);
  });

  it('keeps dimming rows cached before the provider was disabled', async () => {
    // Disabling mid-session must not blank the list — `mapEntries` re-tags
    // `providerEnabled` off the live record so the rows render dimmed.
    const record = makeRecord({ entries: [makeEntry()] });
    const aggregator = new ProviderCommandAggregator(() => [record]);

    await aggregator.listAll();
    record.isEnabled = false;

    expect(aggregator.listCachedNow()).toEqual([
      expect.objectContaining({ name: 'review', providerEnabled: false }),
    ]);
  });

  it('streams one callback per provider', async () => {
    const aggregator = new ProviderCommandAggregator(() => [
      makeRecord({ entries: [makeEntry()] }),
      makeRecord({
        providerId: 'opencode',
        displayName: 'Opencode',
        entries: [makeEntry({ id: 'cmd-test', providerId: 'opencode', name: 'test' })],
      }),
    ]);

    const seen: string[] = [];
    await aggregator.listAllStreaming((providerId) => seen.push(providerId));

    expect(seen.sort()).toEqual(['claude', 'opencode']);
  });

  it('retires an in-flight listing that invalidate() superseded', async () => {
    let release: (entries: ProviderCommandEntry[]) => void = () => undefined;
    const record = makeRecord({
      entries: () => new Promise((resolve) => { release = resolve; }),
    });
    const aggregator = new ProviderCommandAggregator(() => [record]);

    const pending = aggregator.listAll();
    aggregator.invalidate('claude');
    release([makeEntry({ name: 'stale' })]);
    await pending;

    // The stale listing resolved after the invalidate, so it must not have
    // repopulated the bucket for the rest of the TTL.
    expect(aggregator.listCachedNow()).toEqual([]);
  });
});

describe('providerCommand.changed invalidation', () => {
  function makeBus() {
    const handlers = new Map<string, ((p: any) => void)[]>();
    return {
      on: jest.fn((evt: string, fn: (p: any) => void) => {
        handlers.set(evt, [...(handlers.get(evt) ?? []), fn]);
        return () => handlers.set(evt, (handlers.get(evt) ?? []).filter((h) => h !== fn));
      }),
      emit: (evt: string, payload: any) => {
        for (const fn of handlers.get(evt) ?? []) fn(payload);
      },
      count: (evt: string) => (handlers.get(evt) ?? []).length,
    };
  }

  it('re-fetches a provider after its commands change, without waiting out the TTL', async () => {
    // Authoring a command in provider settings is the one mutation with no other
    // route to this cache: no file watcher, and Refresh only drops our bucket.
    let listing = [makeEntry({ id: 'cmd-a', name: 'alpha' })];
    const record = makeRecord({ entries: () => Promise.resolve(listing) });
    const bus = makeBus();
    const aggregator = new ProviderCommandAggregator(() => [record], { eventBus: bus as never });

    expect((await aggregator.listAll()).map((e) => e.name)).toEqual(['alpha']);

    listing = [makeEntry({ id: 'cmd-a', name: 'alpha' }), makeEntry({ id: 'cmd-b', name: 'beta' })];
    // Without the event this would serve the cached bucket for the full TTL.
    bus.emit('providerCommand.changed', { providerId: 'claude' });

    expect((await aggregator.listAll()).map((e) => e.name)).toEqual(['alpha', 'beta']);
  });

  it('ignores a change announced for a different provider', async () => {
    const record = makeRecord({ entries: [makeEntry({ id: 'cmd-a', name: 'alpha' })] });
    const bus = makeBus();
    const aggregator = new ProviderCommandAggregator(() => [record], { eventBus: bus as never });

    await aggregator.listAll();
    const callsAfterFirst = (record.commandCatalog.listDropdownEntries as jest.Mock).mock.calls.length;
    bus.emit('providerCommand.changed', { providerId: 'codex' });
    await aggregator.listAll();

    expect((record.commandCatalog.listDropdownEntries as jest.Mock).mock.calls.length)
      .toBe(callsAfterFirst);
  });

  it('releases the subscription on dispose', () => {
    const bus = makeBus();
    const aggregator = new ProviderCommandAggregator(() => [makeRecord()], { eventBus: bus as never });

    expect(bus.count('providerCommand.changed')).toBe(1);
    aggregator.dispose();
    expect(bus.count('providerCommand.changed')).toBe(0);
  });
});

describe('invalidate refreshes the provider catalog too', () => {
  it('refreshes every catalog on a full invalidate (the tab Refresh button)', () => {
    // Both layers cache. A warm ClaudeCommandCatalog answers from `sdkCommands`,
    // which no TTL expires, so dropping only our bucket re-reads the same stale
    // set — Refresh looked broken for edits made outside the app.
    const record = makeRecord();
    const aggregator = new ProviderCommandAggregator(() => [record]);

    aggregator.invalidate();

    expect(record.commandCatalog.refresh).toHaveBeenCalled();
  });

  it('refreshes only the named provider on a targeted invalidate', () => {
    const claude = makeRecord({ providerId: 'claude' });
    const codex = makeRecord({ providerId: 'codex' });
    const aggregator = new ProviderCommandAggregator(() => [claude, codex]);

    aggregator.invalidate('claude');

    expect(claude.commandCatalog.refresh).toHaveBeenCalled();
    expect(codex.commandCatalog.refresh).not.toHaveBeenCalled();
  });

  it('survives a catalog whose refresh rejects', () => {
    const record = makeRecord();
    (record.commandCatalog.refresh as jest.Mock).mockRejectedValue(new Error('nope'));
    const aggregator = new ProviderCommandAggregator(() => [record]);

    expect(() => aggregator.invalidate()).not.toThrow();
  });
});
