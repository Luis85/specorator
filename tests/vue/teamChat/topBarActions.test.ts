import { fireEvent, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { useTeamChatStore } from '@/features/teamChat/ui/vue/stores/teamChatStore';
import { t } from '@/i18n/i18n';

import { agent, awaitRoster, makeCallbacks, makePlugin, mountRoot, within } from './fixtures';

vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

const { menuItems, showAtMouseEvent } = vi.hoisted(() => ({
  menuItems: [] as string[],
  showAtMouseEvent: vi.fn(),
}));
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Menu: class {
      addItem(build: (item: unknown) => void) {
        const item = {
          setTitle(title: string) { menuItems.push(title); return item; },
          setIcon() { return item; },
          onClick() { return item; },
        };
        build(item);
        return this;
      }

      showAtMouseEvent = showAtMouseEvent;
    },
  };
});

const TEAM = [agent('roster:a', 'Ada', { description: 'router', voice: 'terse and precise' })];

/** Mounts with 'roster:a' as the active DM, which is what makes the top bar render. */
async function mountWithActiveDm(callbacks = makeCallbacks()) {
  mountRoot(makePlugin(TEAM), callbacks);
  await awaitRoster();
  const store = useTeamChatStore();
  store.setSelected('roster:a');
  await nextTick();
  return { store, callbacks };
}

function topBar(): HTMLElement {
  const bar = document.querySelector('.specorator-team-chat-top-bar');
  if (!bar) throw new Error('top bar not rendered');
  return bar as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  menuItems.length = 0;
  setActivePinia(createPinia());
});

describe('top bar identity', () => {
  it('renders the agent name and voice line for the active DM', async () => {
    await mountWithActiveDm();

    expect(within(topBar()).getByText('Ada')).toBeTruthy();
    expect(within(topBar()).getByText('terse and precise')).toBeTruthy();
  });

  // Reuses PresenceDot so the roster and the bar can never disagree about "busy".
  it('rides the agent presence on the avatar', async () => {
    const { store } = await mountWithActiveDm();

    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();

    const dot = topBar().querySelector('.specorator-team-chat-top-bar-dot');
    expect(dot?.classList.contains('specorator-team-presence-dot--busy')).toBe(true);
  });
});

describe('top bar model chip', () => {
  it('shows the active DM model beside the provider', async () => {
    const { store } = await mountWithActiveDm();

    store.setActiveModelId('claude-opus-5');
    await nextTick();

    expect(within(topBar()).getByText('claude-opus-5')).toBeTruthy();
  });

  // Hidden, not a placeholder: an empty slot reads as a broken chip.
  it('hides the chip entirely when no model is known', async () => {
    await mountWithActiveDm();

    expect(topBar().querySelector('.specorator-team-chat-top-bar-model')).toBeNull();
  });
});

describe('top bar overflow menu', () => {
  it('offers exactly the two non-conversation-minting actions', async () => {
    await mountWithActiveDm();

    await fireEvent.click(screen.getByLabelText(t('teamChat.topBarActions')));

    expect(menuItems).toEqual([t('teamChat.menuEditAgent'), t('teamChat.menuCloseChat')]);
  });

  // fork / new session / clear are surface-gated off for a DM's one-fixed-thread model —
  // re-adding them here as a "convenience" would reopen exactly the hole the gating closes.
  it('never offers an action that would mint an unbound conversation', async () => {
    await mountWithActiveDm();

    await fireEvent.click(screen.getByLabelText(t('teamChat.topBarActions')));

    for (const forbidden of ['Fork', 'New session', 'New chat', 'Clear']) {
      expect(menuItems.some((item) => item.includes(forbidden))).toBe(false);
    }
  });

  it('hides Close chat while the DM is streaming', async () => {
    const { store } = await mountWithActiveDm();
    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();

    await fireEvent.click(screen.getByLabelText(t('teamChat.topBarActions')));

    expect(menuItems).toEqual([t('teamChat.menuEditAgent')]);
  });
});

describe('empty states', () => {
  it('offers agent quick-picks that open the right DM', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();

    const pick = document.querySelector('.specorator-team-chat-empty-pick');
    await fireEvent.click(pick as HTMLElement);

    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:a');
  });

  it('shows no quick-picks when the roster is empty', async () => {
    mountRoot(makePlugin([]), makeCallbacks());
    await screen.findByText(t('teamChat.rosterEmpty'));

    expect(document.querySelector('.specorator-team-chat-empty-pick')).toBeNull();
  });

  it('hides the empty pane once a DM is selected', async () => {
    await mountWithActiveDm();

    expect(document.querySelector('.specorator-team-chat-empty')).toBeNull();
  });

  // A one-click send from a suggestion spends a provider turn the user only meant to read.
  it('fills the composer from a conversation starter WITHOUT sending', async () => {
    const { callbacks, store } = await mountWithActiveDm();
    store.setActiveDmIsEmpty(true);
    await nextTick();

    const starter = document.querySelector('.specorator-team-chat-starter');
    await fireEvent.click(starter as HTMLElement);

    expect(callbacks.onFillComposer).toHaveBeenCalledWith(t('teamChat.starterExplain'));
    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
  });

  it('drops the starters once the thread has messages', async () => {
    const { store } = await mountWithActiveDm();
    store.setActiveDmIsEmpty(true);
    await nextTick();
    expect(document.querySelector('.specorator-team-chat-starter')).toBeTruthy();

    store.setActiveDmIsEmpty(false);
    await nextTick();

    expect(document.querySelector('.specorator-team-chat-starter')).toBeNull();
  });
});
