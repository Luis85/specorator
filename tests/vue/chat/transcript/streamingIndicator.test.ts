import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { FLAVOR_TEXTS, STREAMING_RESPONSE_LABEL } from '@/features/chat/constants';
import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
import StreamingIndicator from '@/features/chat/ui/vue/transcript/StreamingIndicator.vue';

/**
 * Parity twin of `streamingIndicator.characterization.test.ts`: reproduces
 * the legacy `.specorator-thinking` > flavor + hint DOM contract as a pure
 * read-model over `transcriptStore.activeStream`. This component owns no
 * timer/debounce — the engine (Task 17) is responsible for setting
 * `isThinking` / `isWriting` / `elapsedSeconds`.
 */
describe('StreamingIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders nothing when activeStream is null', () => {
    const { container } = render(StreamingIndicator);
    expect(container.querySelector('.specorator-thinking')).toBeNull();
  });

  it('renders nothing when both isThinking and isWriting are false', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'm1', blockIndex: 0, isThinking: false, isWriting: false, elapsedSeconds: 3 });

    const { container } = render(StreamingIndicator);
    expect(container.querySelector('.specorator-thinking')).toBeNull();
  });

  it('thinking mode renders .specorator-thinking with a flavor label + hint', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'm1', blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 0 });

    const { container } = render(StreamingIndicator);

    const wrapper = container.querySelector('.specorator-thinking') as HTMLElement;
    expect(wrapper).not.toBeNull();

    const flavor = wrapper.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor).not.toBeNull();
    expect(FLAVOR_TEXTS).toContain(flavor.textContent);

    const hint = wrapper.querySelector('.specorator-thinking-hint') as HTMLElement;
    expect(hint.textContent).toBe(' (esc to interrupt · 0s)');
  });

  it('writing mode renders STREAMING_RESPONSE_LABEL as the flavor label', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'm1', blockIndex: 0, isThinking: false, isWriting: true, elapsedSeconds: 0 });

    const { container } = render(StreamingIndicator);

    const flavor = container.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor.textContent).toBe(STREAMING_RESPONSE_LABEL);
  });

  it('writing takes precedence over thinking when both flags are set', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'm1', blockIndex: 0, isThinking: true, isWriting: true, elapsedSeconds: 0 });

    const { container } = render(StreamingIndicator);

    const flavor = container.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor.textContent).toBe(STREAMING_RESPONSE_LABEL);
  });

  it('hint text tracks elapsedSeconds via formatDurationMmSs (e.g. 65s -> 1m 5s)', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'm1', blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 65 });

    const { container } = render(StreamingIndicator);

    const hint = container.querySelector('.specorator-thinking-hint') as HTMLElement;
    expect(hint.textContent).toBe(' (esc to interrupt · 1m 5s)');
  });

  it('flavor is deterministic and stable across re-renders for the same messageId', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: 'turn-42', blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 0 });

    const first = render(StreamingIndicator);
    const firstFlavor = first.container.querySelector('.specorator-thinking-flavor')?.textContent;

    // Re-render (a fresh mount, same store state) must land on the same phrase —
    // the index is derived from messageId, not Math.random().
    const second = render(StreamingIndicator);
    const secondFlavor = second.container.querySelector('.specorator-thinking-flavor')?.textContent;

    expect(secondFlavor).toBe(firstFlavor);

    // Bump elapsedSeconds (same messageId) to force a reactive re-render of
    // the first instance and confirm the flavor doesn't reshuffle.
    store.setActiveStream({ messageId: 'turn-42', blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 1 });
    const afterUpdate = first.container.querySelector('.specorator-thinking-flavor')?.textContent;
    expect(afterUpdate).toBe(firstFlavor);
  });

  it('is deterministic per messageId across several distinct ids (no Math.random reshuffle)', () => {
    const ids = ['turn-1', 'turn-2', 'abc-def', 'msg-9999'];
    for (const id of ids) {
      const store = useTranscriptStore();
      store.setActiveStream({ messageId: id, blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 0 });

      const first = render(StreamingIndicator).container.querySelector('.specorator-thinking-flavor')?.textContent;
      const second = render(StreamingIndicator).container.querySelector('.specorator-thinking-flavor')?.textContent;
      expect(second).toBe(first);
    }
  });
});
