import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
import type { TranscriptSnapshot } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';
import { useTranscriptEventRouting } from '@/features/chat/ui/vue/transcript/useTranscriptEventRouting';

describe('useTranscriptEventRouting', () => {
  beforeEach(() => setActivePinia(createTranscriptPinia()));

  it('fans snapshots into the store and disposes on unmount', () => {
    let push!: (s: TranscriptSnapshot) => void;
    const dispose = vi.fn();
    const subscribe = (cb: (s: TranscriptSnapshot) => void) => { push = cb; return dispose; };
    const store = useTranscriptStore();
    const Comp = defineComponent({ setup() { useTranscriptEventRouting(subscribe); return () => h('div'); } });
    const wrapper = mount(Comp);
    push({
      messages: [{ id: '1', role: 'assistant', content: '', timestamp: 0 }],
      activeStream: null,
      conversationId: 'conv-1',
      projectionRevision: 1,
      greeting: 'Good morning',
      loadingText: null,
      hydrationError: null,
    });
    expect(store.messages).toHaveLength(1);
    expect(store.greeting).toBe('Good morning');
    wrapper.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
