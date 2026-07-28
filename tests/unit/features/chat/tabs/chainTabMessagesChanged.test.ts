import { chainTabMessagesChanged } from '@/features/chat/tabs/tabControllers';
import type { TabData } from '@/features/chat/tabs/types';

/**
 * The host seam for message-list changes. `initializeTabControllers` installs
 * `onMessagesChanged: () => tab.transcript?.emit()`; this chains a host notification onto it
 * with the same spread-and-wrap composition one layer up.
 *
 * The contract that matters is COMPOSITION, not ordering-for-its-own-sake: dropping the
 * existing callback would silently kill every transcript re-projection on add/remove/set,
 * which is a far worse bug than the one this exists to fix.
 */
function makeTab(onMessagesChanged?: () => void): TabData {
  return { id: 'tab-1', state: { callbacks: { onMessagesChanged, onStreamingStateChanged: jest.fn() } } } as unknown as TabData;
}

describe('chainTabMessagesChanged', () => {
  it('calls BOTH the existing re-projection and the host notifier', () => {
    const reproject = jest.fn();
    const notifyHost = jest.fn();
    const tab = makeTab(reproject);

    chainTabMessagesChanged(tab, notifyHost);
    tab.state.callbacks.onMessagesChanged?.();

    expect(reproject).toHaveBeenCalledTimes(1);
    expect(notifyHost).toHaveBeenCalledTimes(1);
  });

  it('re-projects the transcript FIRST, so the host reads a settled projection', () => {
    const order: string[] = [];
    const tab = makeTab(() => order.push('transcript'));

    chainTabMessagesChanged(tab, () => order.push('host'));
    tab.state.callbacks.onMessagesChanged?.();

    expect(order).toEqual(['transcript', 'host']);
  });

  // Defensive: the chain is installed after `initializeTabControllers`, but a lean test tab or
  // a future reorder could leave the slot empty — that must not throw on every message add.
  it('still notifies the host when no prior callback was installed', () => {
    const notifyHost = jest.fn();
    const tab = makeTab(undefined);

    chainTabMessagesChanged(tab, notifyHost);

    expect(() => tab.state.callbacks.onMessagesChanged?.()).not.toThrow();
    expect(notifyHost).toHaveBeenCalledTimes(1);
  });

  it('preserves the OTHER state callbacks it spreads over', () => {
    const onStreamingStateChanged = jest.fn();
    const tab = { id: 'tab-1', state: { callbacks: { onStreamingStateChanged } } } as unknown as TabData;

    chainTabMessagesChanged(tab, jest.fn());

    expect(tab.state.callbacks.onStreamingStateChanged).toBe(onStreamingStateChanged);
  });
});
