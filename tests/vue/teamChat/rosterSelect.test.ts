import { fireEvent, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/i18n/i18n';

import { agent, awaitRoster, makeCallbacks, makePlugin, mountRoot, rosterRow } from './fixtures';

// Avatar rendering is imperative (setIcon/createSpan); stub it so the assertions
// are about row interaction, not avatar internals.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

// The empty-roster CTA routes through activateMarketplace; stub it so the click is
// asserted without opening a real Marketplace leaf (mirrors libraryView.test.ts).
const { activateMarketplaceMock } = vi.hoisted(() => ({ activateMarketplaceMock: vi.fn() }));
vi.mock('@/features/marketplace/activateMarketplace', () => ({
  activateMarketplace: activateMarketplaceMock,
}));

describe('TeamRoster (Phase 4b: interactive roster → DM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('fires onSelectAgent(agentId) when a roster row is clicked', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await awaitRoster();

    await fireEvent.click(await rosterRow('Ada'));

    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:a');
  });

  it('fires onSelectAgent on Enter and Space for keyboard access', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await awaitRoster();
    const row = await rosterRow('Ada');

    await fireEvent.keyDown(row, { key: 'Enter' });
    await fireEvent.keyDown(row, { key: ' ' });

    expect(callbacks.onSelectAgent).toHaveBeenNthCalledWith(1, 'roster:a');
    expect(callbacks.onSelectAgent).toHaveBeenNthCalledWith(2, 'roster:a');
  });

  // listbox/option, not button rows: "pick one of N, the pane shows the pick" is what a
  // listbox announces, and it makes the selected row read as selected rather than pressed.
  it('exposes the roster as a listbox of options', async () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), makeCallbacks());
    await awaitRoster();
    const row = await rosterRow('Ada');
    expect(row.getAttribute('role')).toBe('option');
    expect(row.closest('[role="listbox"]')).toBeTruthy();
  });

  // Roving tabindex: the whole rail is ONE tab stop, so a 20-agent team isn't 20 stops
  // before the composer.
  it('makes exactly one row tabbable', async () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada'), agent('roster:b', 'Bo')]), makeCallbacks());
    await awaitRoster();

    const tabbable = [await rosterRow('Ada'), await rosterRow('Bo')].filter((row) => row.getAttribute('tabindex') === '0');

    expect(tabbable).toHaveLength(1);
  });

  it('subscribes the store projection seam exactly once on mount', () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    expect(callbacks.subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not open any DM on mere render (interaction is click/keyboard only)', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await awaitRoster();
    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
  });
});

// Round-43: an empty roster is a first-run dead end without a way to get agents, so the
// empty state carries a CTA that deep-links the Marketplace's Agents category.
describe('TeamRoster empty-roster Marketplace CTA (Round-43)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('renders a Marketplace CTA when the roster is empty', async () => {
    mountRoot(makePlugin([]), makeCallbacks());
    expect(await screen.findByRole('button', { name: t('teamChat.rosterEmptyCta') })).toBeTruthy();
  });

  it('deep-links the Marketplace Agents category when the CTA is clicked', async () => {
    const plugin = makePlugin([]);
    mountRoot(plugin, makeCallbacks());
    const cta = await screen.findByRole('button', { name: t('teamChat.rosterEmptyCta') });

    await fireEvent.click(cta);

    // 'agent' (singular) is the real MarketplaceItemType — matching the Library deep-link.
    expect(activateMarketplaceMock).toHaveBeenCalledWith(plugin, 'agent');
  });

  it('does not render the CTA once the roster has agents', async () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), makeCallbacks());
    await awaitRoster();
    expect(screen.queryByRole('button', { name: t('teamChat.rosterEmptyCta') })).toBeNull();
  });
});
