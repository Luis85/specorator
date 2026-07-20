import { ReadyStateNotifier } from '@/providers/cursor/runtime/readyStateNotifier';

describe('ReadyStateNotifier', () => {
  it('starts not-ready', () => {
    expect(new ReadyStateNotifier().get()).toBe(false);
  });

  it('updates the flag and notifies subscribers on a transition', () => {
    const notifier = new ReadyStateNotifier();
    const seen: boolean[] = [];
    notifier.subscribe((ready) => seen.push(ready));
    notifier.set(true);
    expect(notifier.get()).toBe(true);
    expect(seen).toEqual([true]);
    notifier.set(false);
    expect(seen).toEqual([true, false]);
  });

  it('does not notify when the value is unchanged', () => {
    const notifier = new ReadyStateNotifier();
    const listener = jest.fn();
    notifier.subscribe(listener);
    notifier.set(false); // already false
    notifier.set(true);
    notifier.set(true); // no transition
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('notifies every subscriber', () => {
    const notifier = new ReadyStateNotifier();
    const a = jest.fn();
    const b = jest.fn();
    notifier.subscribe(a);
    notifier.subscribe(b);
    notifier.set(true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
  });

  it('stops notifying after the returned unsubscribe runs', () => {
    const notifier = new ReadyStateNotifier();
    const listener = jest.fn();
    const off = notifier.subscribe(listener);
    off();
    notifier.set(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops all subscribers on clear() but leaves the flag intact', () => {
    const notifier = new ReadyStateNotifier();
    const listener = jest.fn();
    notifier.subscribe(listener);
    notifier.set(true);
    listener.mockClear();
    notifier.clear();
    notifier.set(false);
    expect(listener).not.toHaveBeenCalled();
    expect(notifier.get()).toBe(false);
  });
});
