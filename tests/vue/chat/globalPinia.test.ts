import { describe, expect, it } from 'vitest';

import { createChatShellPinia } from '@/features/chat/ui/vue/globalPinia';

describe('createChatShellPinia', () => {
  it('returns a fresh Pinia per call — per-view isolation, NOT a shared singleton', () => {
    // Regression guard: two open chat leaves each own their own TabManager/tabs,
    // so their Vue apps must install DISTINCT Pinia instances. A shared singleton
    // would let one view's snapshot overwrite the other's chat-shell store.
    const a = createChatShellPinia();
    const b = createChatShellPinia();
    expect(a).not.toBe(b);
  });
});
