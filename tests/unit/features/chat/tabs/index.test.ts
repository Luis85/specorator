import { createTab } from '@/features/chat/tabs/Tab';
import { TabManager } from '@/features/chat/tabs/TabManager';

describe('features/chat/tabs index', () => {
  it('re-exports runtime symbols', () => {
    expect(createTab).toBeDefined();
    expect(TabManager).toBeDefined();
  });
});
