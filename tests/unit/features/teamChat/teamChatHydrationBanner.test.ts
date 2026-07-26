import { restoreTeamChatDmTabs } from '@/features/teamChat/teamChatDmTabs';
import { createDmHydrationBanner } from '@/features/teamChat/teamChatHydrationBanner';

/**
 * Fix 3 (Round-62): the Team Chat mirror of SpecoratorView's pending-hydration-error
 * plumbing. On `conversation:hydration-failed`, surface the inline banner for the DMs
 * THIS view owns — a live DM tab in this view's manager, OR a team-chat DM not yet
 * hosted by any view (the fresh-open fire lands during `getConversationById`, before the
 * tab binds). A sidebar conversation (surface 'chat') or a DM owned by another leaf is
 * ignored. Owned failures are stashed so the owning tab's `restoreConversation` consume
 * (wired via `component.consumePendingHydrationError`) renders the banner once bound; a
 * currently-bound tab also gets an immediate `setHydrationError`.
 */
describe('createDmHydrationBanner', () => {
  type Cross = { view: unknown; tabId: string } | null;

  function harness(opts: { tabs?: unknown[]; cross?: Cross; surface?: string | null; opening?: boolean } = {}) {
    // `opening` defaults true: a pre-bind team-chat DM is owned only by the leaf ACTUALLY opening it
    // (Round-64), and most cases model that opening leaf. The Round-64 test drives a NON-opening leaf.
    const { tabs = [], cross = null, surface = null, opening = true } = opts;
    const handlers: Record<string, (payload: unknown) => void> = {};
    const off = jest.fn();
    const plugin = {
      events: {
        on: jest.fn((event: string, handler: (payload: unknown) => void) => {
          handlers[event] = handler;
          return off;
        }),
      },
      findConversationAcrossViews: jest.fn(() => cross),
      getConversationSync: jest.fn((id: string) => (surface ? { id, surface } : null)),
    } as never;
    const tabManager = { getAllTabs: jest.fn(() => tabs) };
    const host = { getTabManager: jest.fn(() => tabManager), isOpeningConversation: jest.fn(() => opening) };
    const controller = createDmHydrationBanner(plugin, host as never);
    return { plugin, handlers, off, controller, tabManager, host };
  }

  const fire = (
    handlers: Record<string, (payload: unknown) => void>,
    conversationId: string,
    payload: Partial<{ code: string; message: string }> = {},
  ) =>
    handlers['conversation:hydration-failed']({
      conversationId,
      code: payload.code ?? 'store-unreadable',
      message: payload.message ?? 'Could not read history.',
    });

  it('surfaces the banner on the owning live DM tab AND stashes it for restoreConversation', () => {
    const setHydrationError = jest.fn();
    const tab = { conversationId: 'c1', transcript: { setHydrationError } };
    const { handlers, controller } = harness({ tabs: [tab] });

    fire(handlers, 'c1');

    const banner = { code: 'store-unreadable', message: 'Could not read history.' };
    expect(setHydrationError).toHaveBeenCalledWith(banner);
    expect(controller.consumePendingHydrationError('c1')).toEqual(banner);
    // consume clears it — a second consume returns null.
    expect(controller.consumePendingHydrationError('c1')).toBeNull();
  });

  it('stashes a fresh-opening owned DM (team-chat surface, not yet hosted) — the pre-bind opening fire', () => {
    const { handlers, controller } = harness({ tabs: [], cross: null, surface: 'team-chat' });

    fire(handlers, 'c1', { code: 'sqlite-unavailable', message: 'no sqlite' });

    expect(controller.consumePendingHydrationError('c1')).toEqual({
      code: 'sqlite-unavailable',
      message: 'no sqlite',
    });
  });

  // Round-64 Fix B: `TabManager.createTab` hydrates BEFORE the tab binds, so with MULTIPLE Team Chat
  // leaves open a pre-bind failure was owned (surface === 'team-chat', not yet hosted anywhere) by
  // EVERY leaf — so a non-opening leaf later consumed a stale entry and showed a false banner. The
  // pre-bind branch now also requires host.isOpeningConversation(id): only the opening leaf stashes.
  it('stashes a pre-bind failure ONLY on the leaf actually opening it (Round-64)', () => {
    const banner = { code: 'store-unreadable', message: 'boom' };
    // Leaf A is mid-open of c1; leaf B is not. Both are team-chat DMs not yet hosted by any view.
    const opening = harness({ tabs: [], cross: null, surface: 'team-chat', opening: true });
    const idle = harness({ tabs: [], cross: null, surface: 'team-chat', opening: false });

    fire(opening.handlers, 'c1', banner);
    fire(idle.handlers, 'c1', banner);

    // The opening leaf stashed it (the real owner), the idle leaf did not — so its later consume is
    // null and it cannot surface a failure banner for a DM another leaf successfully opened.
    expect(opening.controller.consumePendingHydrationError('c1')).toEqual(banner);
    expect(idle.controller.consumePendingHydrationError('c1')).toBeNull();
    // The ownership gate consulted the opening state (not just the surface) on the pre-bind path.
    expect(idle.host.isOpeningConversation).toHaveBeenCalledWith('c1');
  });

  it('ignores a sidebar conversation (surface chat) this view does not own', () => {
    const { handlers, controller } = harness({ tabs: [], cross: null, surface: 'chat' });

    fire(handlers, 'c1');

    expect(controller.consumePendingHydrationError('c1')).toBeNull();
  });

  it('ignores a DM owned by another leaf (cross-view hit that is not this view)', () => {
    const { handlers, controller } = harness({
      tabs: [],
      cross: { view: { other: true }, tabId: 't' },
      surface: 'team-chat',
    });

    fire(handlers, 'c1');

    expect(controller.consumePendingHydrationError('c1')).toBeNull();
  });

  it('ignores an unknown conversation with no tab and no store record', () => {
    const { handlers, controller } = harness({ tabs: [], cross: null, surface: null });

    fire(handlers, 'ghost');

    expect(controller.consumePendingHydrationError('ghost')).toBeNull();
  });

  it('dispose removes the event subscription', () => {
    const { off, controller } = harness();

    controller.dispose();

    expect(off).toHaveBeenCalledTimes(1);
  });
});

// Round-66: the RESTORE path (restoreTeamChatDmTabs) pre-warms hydration + createTabs its DMs
// WITHOUT the selectAgent `setOpening` bracket, so a restored DM whose transcript is unreadable
// emitted `conversation:hydration-failed` while `isOpeningConversation` was false → ownsDmConversation
// rejected it and the restored DM showed blank with no inline banner. Restore now marks its DMs
// opening for the duration, so THIS leaf owns the restore-time failure; a leaf NEITHER opening NOR
// restoring it still rejects it (Round-64's multi-leaf guard holds).
describe('createDmHydrationBanner — restore-time ownership (Round-66)', () => {
  const teamChatConv = { surface: 'team-chat', boundAgentId: 'roster:a', providerId: 'claude' };
  const layout = (conversationId: string) => ({
    openTabs: [{ tabId: 't1', conversationId, kind: 'chat' as const }],
    activeTabId: 't1',
  });

  it('the restoring leaf owns a restore-time pre-bind hydration failure; an idle sibling does not', async () => {
    const restoring = new Set<string>();
    const handlers: Array<(payload: unknown) => void> = [];
    const plugin = {
      events: {
        on: jest.fn((event: string, handler: (payload: unknown) => void) => {
          if (event === 'conversation:hydration-failed') handlers.push(handler);
          return jest.fn();
        }),
        emit: jest.fn(),
      },
      // The pre-warm read fires a store-unreadable hydration failure for the DM being restored.
      getConversationById: jest.fn(async (id: string) => {
        handlers.forEach((h) => h({ conversationId: id, code: 'store-unreadable', message: 'boom' }));
        return teamChatConv;
      }),
      getConversationSync: jest.fn(() => teamChatConv),
      findConversationAcrossViews: jest.fn(() => null),
      logger: { scope: () => ({ error: jest.fn() }) },
    } as never;
    // The restoring leaf's host reads the shared `restoring` set; the idle sibling never restores.
    const makeHost = (set: Set<string>) => ({
      getTabManager: () => ({ getAllTabs: () => [] }),
      isOpeningConversation: (id: string) => set.has(id),
    });
    const restoringBanner = createDmHydrationBanner(plugin, makeHost(restoring) as never);
    const idleBanner = createDmHydrationBanner(plugin, makeHost(new Set<string>()) as never);
    const manager = { createTab: jest.fn().mockResolvedValue({ id: 't1' }), hasTab: jest.fn(() => true), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, manager, layout('c1'), (id, r) => {
      if (r) restoring.add(id); else restoring.delete(id);
    });

    expect(restoringBanner.consumePendingHydrationError('c1')).toEqual({ code: 'store-unreadable', message: 'boom' });
    expect(idleBanner.consumePendingHydrationError('c1')).toBeNull();
  });
});
