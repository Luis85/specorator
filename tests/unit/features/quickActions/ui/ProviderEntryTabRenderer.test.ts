/**
 * @jest-environment jsdom
 */
import '../../../../setup/obsidianDom';

import type { CommandTabEntry, ProviderCommandSource } from '@/features/quickActions/commands/types';
import type { SkillTabEntry, VaultSkillSource } from '@/features/quickActions/skills/types';
import {
  buildCommandsTabConfig,
  buildSkillsTabConfig,
} from '@/features/quickActions/ui/entryTabConfigs';
import { ProviderEntryTabRenderer } from '@/features/quickActions/ui/ProviderEntryTabRenderer';

jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
}));

jest.mock('@/i18n/i18n', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

type StreamingCallback = (
  providerId: SkillTabEntry['providerId'],
  entries: SkillTabEntry[],
) => void;

interface SourceStub extends VaultSkillSource {
  _calls: {
    invalidate: number;
    listAllStreaming: number;
    listCachedNow: number;
  };
  _streamingCallbacks: StreamingCallback[];
}

function makeSource(opts: {
  cached?: SkillTabEntry[];
  streaming?: SkillTabEntry[];
  /** When true, listAllStreaming captures the callback without firing it. */
  defer?: boolean;
} = {}): SourceStub {
  const calls = { invalidate: 0, listAllStreaming: 0, listCachedNow: 0 };
  const streamingCallbacks: StreamingCallback[] = [];

  return {
    _calls: calls,
    _streamingCallbacks: streamingCallbacks,
    listAll: jest
      .fn()
      .mockResolvedValue([...(opts.cached ?? []), ...(opts.streaming ?? [])]),
    listCachedNow: jest.fn().mockImplementation(() => {
      calls.listCachedNow++;
      return opts.cached ?? [];
    }),
    listAllStreaming: jest
      .fn()
      .mockImplementation((cb: StreamingCallback) => {
        calls.listAllStreaming++;
        streamingCallbacks.push(cb);
        // Hold the promise open so the renderer's "stream settled" flag stays
        // false and an empty list keeps painting the skeleton.
        if (opts.defer) return new Promise<void>(() => undefined);
        const byProv = new Map<string, SkillTabEntry[]>();
        for (const e of opts.streaming ?? []) {
          const bucket = byProv.get(e.providerId) ?? [];
          bucket.push(e);
          byProv.set(e.providerId, bucket);
        }
        for (const [pid, entries] of byProv) {
          cb(pid as SkillTabEntry['providerId'], entries);
        }
        return Promise.resolve();
      }),
    invalidate: jest.fn().mockImplementation(() => {
      calls.invalidate++;
    }),
    dispose: jest.fn(),
  };
}

function makeEntry(overrides: Partial<SkillTabEntry> = {}): SkillTabEntry {
  return {
    id: 'claude:skill-tdd',
    providerId: 'claude',
    providerDisplayName: 'Claude',
    name: 'tdd',
    description: 'TDD skill',
    insertPrefix: '/',
    sourceFilePath: '.claude/skills/tdd/SKILL.md',
    scope: 'vault',
    providerEnabled: true,
    ...overrides,
  };
}

function makeSkillsRenderer(
  source: VaultSkillSource,
  onRun: (entry: SkillTabEntry) => void = jest.fn(),
  onEdit: (entry: SkillTabEntry) => void = jest.fn(),
  close: () => void = jest.fn(),
): ProviderEntryTabRenderer<SkillTabEntry> {
  return new ProviderEntryTabRenderer(
    buildSkillsTabConfig(source, onRun, onEdit, {
      close,
      usageTracker: null,
      now: () => 0,
    }),
  );
}

function makeHost(): HTMLElement {
  return document.createElement('div');
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ProviderEntryTabRenderer — Skills tab config', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('render entry point', () => {
    it('returns the search input element for focus management', async () => {
      const source = makeSource();
      const renderer = makeSkillsRenderer(source);

      const input = await renderer.render(makeHost());

      expect(input).not.toBeNull();
      expect(input?.tagName).toBe('INPUT');
      // Search semantics come from the placeholder/aria-label set via `attr` —
      // the shared obsidianDom polyfill applies those, even though it does not
      // forward the `type` field of the Obsidian-flavoured options object.
      expect(input?.getAttribute('placeholder')).toBe(
        'quickActions.skills.searchPlaceholder',
      );
      expect(input?.getAttribute('aria-label')).toBe(
        'quickActions.skills.searchPlaceholder',
      );
    });

    it('populates this.skills via listCachedNow() before kicking off listAllStreaming', async () => {
      // Hold the streaming call open so we can observe rendered rows after
      // Phase A but before Phase B fires.
      const cached = [makeEntry({ id: 'claude:cached', name: 'cached-skill' })];
      const source = makeSource({ cached, defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      expect(source._calls.listCachedNow).toBe(1);
      expect(source._calls.listAllStreaming).toBe(1);
      const rows = host.querySelectorAll(
        '.specorator-quick-actions-skill-row:not(.is-skeleton)',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('cached-skill');
    });
  });

  describe('Phase A cached paint', () => {
    it('paints cached rows synchronously before any await resolves', async () => {
      const cached = [
        makeEntry({ id: 'claude:a', name: 'alpha' }),
        makeEntry({ id: 'claude:b', name: 'beta' }),
      ];
      const source = makeSource({ cached, defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      const rows = host.querySelectorAll(
        '.specorator-quick-actions-skill-row:not(.is-skeleton)',
      );
      expect(rows).toHaveLength(2);
      const skeletons = host.querySelectorAll(
        '.specorator-quick-actions-skill-row.is-skeleton',
      );
      expect(skeletons).toHaveLength(0);
    });

    it('paints SKELETON_ROWS=4 skeleton rows when listCachedNow returns empty', async () => {
      const source = makeSource({ defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      const skeletons = host.querySelectorAll(
        '.specorator-quick-actions-skill-row.is-skeleton',
      );
      expect(skeletons).toHaveLength(4);
    });
  });

  describe('Phase B streaming refresh', () => {
    it('replaces a provider\'s rows when its streaming callback fires, leaving other providers intact', async () => {
      const cachedClaude = makeEntry({
        id: 'claude:tdd',
        providerId: 'claude',
        providerDisplayName: 'Claude',
        name: 'tdd',
      });
      const cachedCodex = makeEntry({
        id: 'codex:codex-skill',
        providerId: 'codex',
        providerDisplayName: 'Codex',
        name: 'codex-old',
        insertPrefix: '$',
      });
      const source = makeSource({ cached: [cachedClaude, cachedCodex], defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      // Simulate provider 'claude' streaming fresh rows.
      const cb = source._streamingCallbacks[0];
      cb('claude', [
        makeEntry({ id: 'claude:fresh', providerId: 'claude', name: 'fresh-claude' }),
      ]);
      await flush();

      const names = Array.from(
        host.querySelectorAll(
          '.specorator-quick-actions-skill-row:not(.is-skeleton) strong',
        ),
      ).map((el) => el.textContent);
      // Claude rows replaced; codex row preserved.
      expect(names).toContain('fresh-claude');
      expect(names).toContain('codex-old');
      expect(names).not.toContain('tdd');
    });

    it('accumulates multiple provider callbacks cleanly without duplicates or cross-pollution', async () => {
      const source = makeSource({ defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);
      const cb = source._streamingCallbacks[0];

      cb('claude', [makeEntry({ id: 'claude:a', name: 'a' })]);
      cb('codex', [
        makeEntry({
          id: 'codex:b',
          providerId: 'codex',
          providerDisplayName: 'Codex',
          insertPrefix: '$',
          name: 'b',
        }),
      ]);
      await flush();

      const rows = host.querySelectorAll(
        '.specorator-quick-actions-skill-row:not(.is-skeleton)',
      );
      expect(rows).toHaveLength(2);

      const headers = Array.from(
        host.querySelectorAll('.specorator-quick-actions-provider-header'),
      ).map((h) => h.textContent);
      expect(headers).toEqual(['Claude', 'Codex']);
    });
  });

  describe('refresh button', () => {
    it('exists in the search container with the refresh-cw icon and tooltip', async () => {
      const { setIcon } = jest.requireMock('obsidian') as { setIcon: jest.Mock };
      const source = makeSource();
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      const refresh = host.querySelector(
        '.specorator-quick-actions-search-refresh',
      ) as HTMLButtonElement;
      expect(refresh).not.toBeNull();
      expect(refresh.getAttribute('title')).toBe('quickActions.skills.refreshTooltip');
      expect(refresh.getAttribute('aria-label')).toBe(
        'quickActions.skills.refreshTooltip',
      );

      const iconCall = setIcon.mock.calls.find(
        ([el, icon]) => el === refresh && icon === 'refresh-cw',
      );
      expect(iconCall).toBeDefined();
    });

    it('clicking the refresh button calls source.invalidate() then source.listAllStreaming()', async () => {
      const source = makeSource();
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      // Phase B already fired once on render.
      expect(source._calls.listAllStreaming).toBe(1);
      expect(source._calls.invalidate).toBe(0);

      const refresh = host.querySelector(
        '.specorator-quick-actions-search-refresh',
      ) as HTMLButtonElement;
      refresh.click();

      expect(source._calls.invalidate).toBe(1);
      expect(source._calls.listAllStreaming).toBe(2);
      const invalidateOrder = (source.invalidate as jest.Mock).mock.invocationCallOrder[0];
      const streamOrder =
        (source.listAllStreaming as jest.Mock).mock.invocationCallOrder[1];
      expect(invalidateOrder).toBeLessThan(streamOrder);
    });
  });

  describe('superseded refreshes', () => {
    it('ignores a retired pass that resolves after a newer one has painted', async () => {
      // Refresh clicked mid-fetch: the aggregator's generation guard stops the
      // retired fetch COMMITTING to the cache, but its promise still resolves
      // and still delivers rows. Without the renderer's request token the older
      // pass would overwrite the freshly painted list with stale commands.
      const source = makeSource({ defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);
      const firstPass = source._streamingCallbacks[0];

      const refresh = host.querySelector(
        '.specorator-quick-actions-search-refresh',
      ) as HTMLButtonElement;
      refresh.click();
      const secondPass = source._streamingCallbacks[1];

      secondPass('claude', [makeEntry({ id: 'claude:fresh', name: 'fresh' })]);
      await flush();
      firstPass('claude', [makeEntry({ id: 'claude:stale', name: 'stale' })]);
      await flush();

      const names = Array.from(
        host.querySelectorAll('.specorator-quick-actions-skill-row:not(.is-skeleton) strong'),
      ).map((el) => el.textContent);
      expect(names).toEqual(['fresh']);
    });

    it('lets the newest pass keep patching after an older one is retired', async () => {
      // The token must retire only OLDER passes — the current one still streams
      // each provider in as it settles.
      const source = makeSource({ defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      const refresh = host.querySelector(
        '.specorator-quick-actions-search-refresh',
      ) as HTMLButtonElement;
      refresh.click();
      const secondPass = source._streamingCallbacks[1];

      secondPass('claude', [makeEntry({ id: 'claude:a', name: 'alpha' })]);
      secondPass('codex', [
        makeEntry({
          id: 'codex:b',
          providerId: 'codex',
          providerDisplayName: 'Codex',
          insertPrefix: '$',
          name: 'beta',
        }),
      ]);
      await flush();

      const names = Array.from(
        host.querySelectorAll('.specorator-quick-actions-skill-row:not(.is-skeleton) strong'),
      ).map((el) => el.textContent);
      expect(names).toEqual(['alpha', 'beta']);
    });
  });

  describe('search filter', () => {
    it('filters displayed rows by name with case-insensitive substring match', async () => {
      const cached = [
        makeEntry({
          id: 'claude:a',
          name: 'brainstorming',
          description: 'brainstorm prompts',
        }),
        makeEntry({ id: 'claude:b', name: 'tdd', description: 'red green refactor' }),
      ];
      const source = makeSource({ cached, defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      const input = (await renderer.render(host)) as HTMLInputElement;

      input.value = 'TDD';
      input.dispatchEvent(new Event('input'));

      const rows = host.querySelectorAll(
        '.specorator-quick-actions-skill-row:not(.is-skeleton)',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('tdd');
    });

    it('pressing Escape clears the filter and re-renders', async () => {
      const cached = [
        makeEntry({
          id: 'claude:a',
          name: 'brainstorming',
          description: 'brainstorm prompts',
        }),
        makeEntry({ id: 'claude:b', name: 'tdd', description: 'red green refactor' }),
      ];
      const source = makeSource({ cached, defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      const input = (await renderer.render(host)) as HTMLInputElement;

      input.value = 'tdd';
      input.dispatchEvent(new Event('input'));
      expect(
        host.querySelectorAll('.specorator-quick-actions-skill-row:not(.is-skeleton)'),
      ).toHaveLength(1);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(input.value).toBe('');
      expect(
        host.querySelectorAll('.specorator-quick-actions-skill-row:not(.is-skeleton)'),
      ).toHaveLength(2);
    });
  });

  describe('keyboard run', () => {
    it('Enter invokes onRunSkill with the first filtered result and closes the modal', async () => {
      const cached = [
        makeEntry({
          id: 'claude:a',
          name: 'brainstorming',
          description: 'brainstorm prompts',
        }),
        makeEntry({ id: 'claude:b', name: 'tdd', description: 'red green refactor' }),
      ];
      const source = makeSource({ cached, defer: true });
      const onRunSkill = jest.fn();
      const close = jest.fn();
      const renderer = makeSkillsRenderer(source, onRunSkill, jest.fn(), close);

      const host = makeHost();
      const input = (await renderer.render(host)) as HTMLInputElement;

      input.value = 'tdd';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(onRunSkill).toHaveBeenCalledTimes(1);
      expect(onRunSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'claude:b', name: 'tdd' }),
      );
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('Enter with no matches neither invokes onRunSkill nor closes', async () => {
      const cached = [
        makeEntry({ id: 'claude:a', name: 'tdd', description: 'red green refactor' }),
      ];
      const source = makeSource({ cached, defer: true });
      const onRunSkill = jest.fn();
      const close = jest.fn();
      const renderer = makeSkillsRenderer(source, onRunSkill, jest.fn(), close);

      const host = makeHost();
      const input = (await renderer.render(host)) as HTMLInputElement;

      input.value = 'zzzz-no-match';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(onRunSkill).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    });
  });

  describe('row actions', () => {
    it('clicking a row invokes onRunSkill(entry) then close()', async () => {
      const entry = makeEntry({ id: 'claude:tdd', name: 'tdd' });
      const source = makeSource({ cached: [entry], defer: true });
      const onRunSkill = jest.fn();
      const close = jest.fn();
      const renderer = makeSkillsRenderer(source, onRunSkill, jest.fn(), close);

      const host = makeHost();
      await renderer.render(host);

      const main = host.querySelector(
        '.specorator-quick-actions-skill-row-main',
      ) as HTMLElement;
      main.click();

      expect(onRunSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'claude:tdd', name: 'tdd' }),
      );
      expect(close).toHaveBeenCalledTimes(1);
      const runOrder = onRunSkill.mock.invocationCallOrder[0];
      const closeOrder = close.mock.invocationCallOrder[0];
      expect(runOrder).toBeLessThan(closeOrder);
    });

    it('clicking the edit button invokes close() then onEditSkill(entry)', async () => {
      const entry = makeEntry({
        id: 'claude:tdd',
        name: 'tdd',
        sourceFilePath: '.claude/skills/tdd/SKILL.md',
      });
      const source = makeSource({ cached: [entry], defer: true });
      const onRunSkill = jest.fn();
      const onEditSkill = jest.fn();
      const close = jest.fn();
      const renderer = makeSkillsRenderer(source, onRunSkill, onEditSkill, close);

      const host = makeHost();
      await renderer.render(host);

      const edit = host.querySelector(
        '.specorator-quick-actions-skill-edit',
      ) as HTMLButtonElement;
      expect(edit).not.toBeNull();
      edit.click();

      expect(close).toHaveBeenCalledTimes(1);
      expect(onEditSkill).toHaveBeenCalledTimes(1);
      expect(onEditSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'claude:tdd' }),
      );
      // Clicking edit must not also fire the row's run handler.
      expect(onRunSkill).not.toHaveBeenCalled();

      const closeOrder = close.mock.invocationCallOrder[0];
      const editOrder = onEditSkill.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(editOrder);
    });

    it('hides the edit button for a read-only user skill (host-absolute path)', async () => {
      // ~/.claude/skills has a truthy host-absolute sourceFilePath but is not
      // editable — the settings manager filters it out, so an Edit button would
      // dead-end. It must not render.
      const entry = makeEntry({
        id: 'claude:user-skill-global',
        name: 'global',
        sourceFilePath: '/home/user/.claude/skills/global/SKILL.md',
      });
      const source = makeSource({ cached: [entry], defer: true });
      const renderer = makeSkillsRenderer(source);

      const host = makeHost();
      await renderer.render(host);

      expect(host.querySelector('.specorator-quick-actions-skill-edit')).toBeNull();
    });
  });
});

describe('ProviderEntryTabRenderer — Commands tab config', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCommand(overrides: Partial<CommandTabEntry> = {}): CommandTabEntry {
    return {
      id: 'claude:cmd-review',
      providerId: 'claude',
      providerDisplayName: 'Claude',
      name: 'review',
      description: 'Review a pull request',
      insertPrefix: '/',
      scope: 'vault',
      providerEnabled: true,
      ...overrides,
    };
  }

  function makeCommandSource(entries: CommandTabEntry[] = []): ProviderCommandSource {
    return {
      listAll: jest.fn().mockResolvedValue(entries),
      listCachedNow: jest.fn().mockReturnValue(entries),
      listAllStreaming: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn(),
      dispose: jest.fn(),
    };
  }

  function makeCommandsRenderer(
    source: ProviderCommandSource,
    onRun: (entry: CommandTabEntry) => void = jest.fn(),
    close: () => void = jest.fn(),
  ): ProviderEntryTabRenderer<CommandTabEntry> {
    return new ProviderEntryTabRenderer(buildCommandsTabConfig(source, onRun, { close }));
  }

  it('renders command rows under their own DOM classes and command-scoped copy', async () => {
    const source = makeCommandSource([makeCommand()]);
    const renderer = makeCommandsRenderer(source);

    const host = makeHost();
    const input = await renderer.render(host);

    expect(input?.getAttribute('placeholder')).toBe(
      'quickActions.commands.searchPlaceholder',
    );
    const rows = host.querySelectorAll(
      '.specorator-quick-actions-command-row:not(.is-skeleton)',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('strong')?.textContent).toBe('review');
    // Commands are provider-owned — no edit affordance is wired for them.
    expect(host.querySelector('.specorator-quick-actions-skill-edit')).toBeNull();
  });

  it('renders the argument hint only for commands that declare one', async () => {
    const source = makeCommandSource([
      makeCommand({ id: 'claude:cmd-a', name: 'aaa', argumentHint: '[pr-url]' }),
      makeCommand({ id: 'claude:cmd-b', name: 'bbb' }),
    ]);
    const renderer = makeCommandsRenderer(source);

    const host = makeHost();
    await renderer.render(host);

    const hints = host.querySelectorAll('.specorator-quick-action-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].textContent).toContain('[pr-url]');
  });

  it('clicking a command row runs it then closes', async () => {
    const entry = makeCommand({ name: 'review' });
    const onRun = jest.fn();
    const close = jest.fn();
    const renderer = makeCommandsRenderer(makeCommandSource([entry]), onRun, close);

    const host = makeHost();
    await renderer.render(host);

    (host.querySelector('.specorator-quick-actions-command-row-main') as HTMLElement).click();

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ name: 'review' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(onRun.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
  });

  it('shows the command empty state once the stream settles with nothing', async () => {
    const renderer = makeCommandsRenderer(makeCommandSource());

    const host = makeHost();
    await renderer.render(host);
    await flush();

    expect(host.querySelectorAll('.is-skeleton')).toHaveLength(0);
    expect(
      host.querySelector('.specorator-quick-actions-skills-empty-lead')?.textContent,
    ).toBe('quickActions.commands.emptyAll');
  });
});
