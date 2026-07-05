import { describe, expect, it } from 'vitest';

import { mergeById } from '@/features/library/vue/mergeById';

const key = (x: { id: string }): string => x.id;

describe('mergeById', () => {
  it('reuses the prev reference for a deep-equal item (identity preserved)', () => {
    const prev = [{ id: 'a', name: 'Alice', tags: ['x'] }];
    const next = [{ id: 'a', name: 'Alice', tags: ['x'] }]; // equal, fresh identity
    const merged = mergeById(prev, next, key);
    expect(merged[0]).toBe(prev[0]); // same reference, not the fresh `next` object
  });

  it('takes the next reference for a changed item', () => {
    const prev = [{ id: 'a', name: 'Alice' }];
    const next = [{ id: 'a', name: 'Alice renamed' }];
    const merged = mergeById(prev, next, key);
    expect(merged[0]).toBe(next[0]);
    expect(merged[0].name).toBe('Alice renamed');
  });

  it('preserves identity for unchanged rows while swapping only the changed one', () => {
    const prev = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Cara' },
    ];
    const next = [
      { id: 'a', name: 'Alice' }, // unchanged
      { id: 'b', name: 'Bobby' }, // changed
      { id: 'c', name: 'Cara' }, // unchanged
    ];
    const merged = mergeById(prev, next, key);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1]).toBe(next[1]);
    expect(merged[2]).toBe(prev[2]);
  });

  it('handles an added row (new key -> next reference)', () => {
    const prev = [{ id: 'a', name: 'Alice' }];
    const next = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
    const merged = mergeById(prev, next, key);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1]).toBe(next[1]);
  });

  it('handles a removed row (absent from next -> dropped)', () => {
    const prev = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
    const next = [{ id: 'a', name: 'Alice' }];
    const merged = mergeById(prev, next, key);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(prev[0]);
  });

  it('returns a new array instance (list-level reactivity still fires)', () => {
    const prev = [{ id: 'a', name: 'Alice' }];
    const next = [{ id: 'a', name: 'Alice' }];
    const merged = mergeById(prev, next, key);
    expect(merged).not.toBe(prev);
    expect(merged).not.toBe(next);
  });

  it('follows next order, not prev order', () => {
    const prev = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const next = [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }];
    const merged = mergeById(prev, next, key);
    expect(merged.map((m) => m.id)).toEqual(['b', 'a']);
    expect(merged[0]).toBe(prev[1]);
    expect(merged[1]).toBe(prev[0]);
  });

  it('detects deep (nested) changes, not just top-level', () => {
    const prev = [{ id: 'a', name: 'A', model: { providerId: 'claude', modelId: 'm1' } }];
    const next = [{ id: 'a', name: 'A', model: { providerId: 'claude', modelId: 'm2' } }];
    const merged = mergeById(prev, next, key);
    expect(merged[0]).toBe(next[0]); // nested modelId differs -> replaced
  });

  it('treats differing array contents as changed', () => {
    const prev = [{ id: 'a', tags: ['x', 'y'] }];
    const next = [{ id: 'a', tags: ['x'] }];
    const merged = mergeById(prev, next, key);
    expect(merged[0]).toBe(next[0]);
  });
});
