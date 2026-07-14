import { activateOpenConversationTab, classifyPostActivateAction } from '@/features/chat/tabs/tabSwitchHelpers';
import type { TabData } from '@/features/chat/tabs/types';

function makeTab(overrides: Partial<TabData> = {}): TabData {
  return {
    conversationId: 'conv-1',
    state: {
      messages: [],
      isHydrating: true,
      isStreaming: false,
      hasPendingConversationSave: false,
    },
    service: { providerId: 'claude' },
    ...overrides,
  } as unknown as TabData;
}

describe('classifyPostActivateAction', () => {
  it('hydrates an empty bound transcript even while isHydrating is true', () => {
    expect(classifyPostActivateAction(makeTab())).toBe('hydrate');
  });

  it('passive-syncs when the transcript is already loaded', () => {
    const tab = makeTab({
      state: {
        messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
        isHydrating: false,
        isStreaming: false,
        hasPendingConversationSave: false,
      },
    } as Partial<TabData>);

    expect(classifyPostActivateAction(tab)).toBe('passive-sync');
  });
});

describe('activateOpenConversationTab', () => {
  it('retries switchTo when the transcript is still empty after hydration settles', async () => {
    const switchTo = jest.fn().mockResolvedValue(undefined);
    const whenHydrated = jest.fn().mockResolvedValue(undefined);
    const tab = {
      id: 'tab-1',
      conversationId: 'conv-1',
      state: { messages: [] },
      controllers: { conversationController: { switchTo, whenHydrated } },
    } as unknown as TabData;
    const switchToTab = jest.fn().mockResolvedValue(undefined);

    await activateOpenConversationTab(switchToTab, tab, 'conv-1');

    expect(switchToTab).toHaveBeenCalledWith('tab-1');
    expect(whenHydrated).toHaveBeenCalledTimes(2);
    expect(switchTo).toHaveBeenCalledWith('conv-1');
  });
});
