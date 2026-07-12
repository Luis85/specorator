import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';

function msg(id: string): ChatMessage {
  return { id, role: 'assistant', content: '', timestamp: 0 };
}

describe('useTranscriptStore', () => {
  beforeEach(() => setActivePinia(createTranscriptPinia()));

  it('setMessages replaces the whole array (new reference)', () => {
    const store = useTranscriptStore();
    const a = [msg('1')];
    store.setMessages(a);
    expect(store.messages).toBe(a);
    const b = [msg('1'), msg('2')];
    store.setMessages(b);
    expect(store.messages).toBe(b);
  });

  it('setActiveStream drives the in-flight turn projection', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: '2', blockIndex: 1, isThinking: true, isWriting: false, elapsedSeconds: 3 });
    expect(store.activeStream?.messageId).toBe('2');
    expect(store.activeStream?.isThinking).toBe(true);
    store.setActiveStream(null);
    expect(store.activeStream).toBeNull();
  });
});
