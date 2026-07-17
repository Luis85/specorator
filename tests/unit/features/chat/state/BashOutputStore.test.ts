import { BashOutputStore } from '@/features/chat/state/BashOutputStore';

describe('BashOutputStore', () => {
  it('adds, lists in insertion order, and notifies onChange', () => {
    const onChange = jest.fn();
    const store = new BashOutputStore(onChange);
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.add({ id: 'b', command: 'pwd', status: 'running', output: '' });
    expect(store.list().map((o) => o.id)).toEqual(['a', 'b']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('updates an existing entry and preserves id/command', () => {
    const store = new BashOutputStore(() => {});
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.update('a', { status: 'completed', output: 'done', exitCode: 0 });
    expect(store.list()[0]).toEqual({ id: 'a', command: 'ls', status: 'completed', output: 'done', exitCode: 0 });
  });

  it('evicts the oldest beyond 50 (LRU) and exposes latest()', () => {
    const store = new BashOutputStore(() => {});
    for (let i = 0; i < 55; i++) store.add({ id: `id-${i}`, command: `c${i}`, status: 'running', output: '' });
    expect(store.list()).toHaveLength(50);
    expect(store.list()[0].id).toBe('id-5');
    expect(store.latest()?.id).toBe('id-54');
  });

  it('clears everything', () => {
    const store = new BashOutputStore(() => {});
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.clear();
    expect(store.list()).toEqual([]);
  });
});
