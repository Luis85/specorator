import { describe, expect, it } from 'vitest';

import { EMPTY_WORK_ORDER_ACTIVITY_SUMMARY } from '@/core/types/workOrderActivity';
import {
  buildConversationsSlice,
  buildGitSlice,
  buildWorkOrderSlice,
} from '@/features/chat/ui/vue/chatShellHeaderProjection';

describe('buildGitSlice', () => {
  it('is visible for a dirty repo with actions enabled', () => {
    expect(buildGitSlice({ isRepo: true, dirtyCount: 3 }, true)).toEqual({
      isRepo: true, dirtyCount: 3, visible: true,
    });
  });

  it('is not visible for a clean repo', () => {
    expect(buildGitSlice({ isRepo: true, dirtyCount: 0 }, true).visible).toBe(false);
  });

  it('is not visible when actions are disabled', () => {
    expect(buildGitSlice({ isRepo: true, dirtyCount: 3 }, false).visible).toBe(false);
  });

  it('defaults to hidden/empty when there is no status', () => {
    expect(buildGitSlice(null, true)).toEqual({ isRepo: false, dirtyCount: 0, visible: false });
  });
});

describe('buildConversationsSlice', () => {
  it('sorts newest-first and carries the current id', () => {
    const slice = buildConversationsSlice(
      [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 2 }] as never,
      'b',
    );
    expect(slice.items.map((c) => c.id)).toEqual(['b', 'a']);
    expect(slice.currentConversationId).toBe('b');
  });

  it('prefers lastResponseAt over createdAt for ordering', () => {
    const slice = buildConversationsSlice(
      [{ id: 'a', createdAt: 100, lastResponseAt: 1 }, { id: 'b', createdAt: 1, lastResponseAt: 100 }] as never,
      null,
    );
    expect(slice.items.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('returns an empty slice for an empty list', () => {
    expect(buildConversationsSlice([], null)).toEqual({
      items: [], currentConversationId: null,
    });
  });
});

describe('buildWorkOrderSlice', () => {
  it('falls back to the shared empty summary when absent', () => {
    expect(buildWorkOrderSlice(undefined)).toBe(EMPTY_WORK_ORDER_ACTIVITY_SUMMARY);
    expect(buildWorkOrderSlice(null)).toBe(EMPTY_WORK_ORDER_ACTIVITY_SUMMARY);
  });

  it('returns a passed summary unchanged', () => {
    const summary = { items: [], closableTabs: [], runningCount: 2, attentionCount: 1 };
    expect(buildWorkOrderSlice(summary)).toBe(summary);
  });
});
