import { mountTabChrome } from '@/features/chat/tabs/tabChromeMount';
import type { TabData } from '@/features/chat/tabs/types';

jest.mock('@/features/chat/ui/vue/tabChrome/mountTabChromeApp', () => ({
  mountTabChromeApp: jest.fn(() => ({ app: {}, unmount: jest.fn(), setScrollHost: jest.fn() })),
}));

describe('mountTabChrome', () => {
  it('constructs the bash store + projection and mounts the app', () => {
    const tab = {
      dom: { statusPanelContainerEl: {}, navSidebarHostEl: {} },
      state: { currentTodos: null },
    } as unknown as TabData;
    mountTabChrome(tab, { app: {} } as never, {} as never);
    expect(tab.bashOutputs).toBeTruthy();
    expect(tab.tabChrome).toBeTruthy();
    expect(tab.mountedTabChrome).toBeTruthy();
  });
});
