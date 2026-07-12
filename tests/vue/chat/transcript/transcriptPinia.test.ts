import { describe, expect, it } from 'vitest';

import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';

describe('createTranscriptPinia', () => {
  it('returns a fresh Pinia per call — per-leaf isolation, not a shared singleton', () => {
    // Each chat leaf owns its own ChatState/messages; a shared store would let
    // one transcript overwrite another's. Same reasoning as createChatShellPinia.
    expect(createTranscriptPinia()).not.toBe(createTranscriptPinia());
  });
});
