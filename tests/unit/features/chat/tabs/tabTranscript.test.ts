import type { ChatMessage } from '@/core/types';
import type { ChatState } from '@/features/chat/state/ChatState';
import type { ActiveStreamState } from '@/features/chat/state/types';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import type { TranscriptSnapshot } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';

/** Minimal `ChatState` stand-in exposing only what the projection reads. The
 *  `messages` getter returns a FRESH copy each read, exactly like the real
 *  `ChatState` — the projection relies on that to keep snapshots independent. */
class FakeChatState {
  private _messages: ChatMessage[] = [];
  activeMessageId: string | null = null;
  currentConversationId: string | null = 'c1';
  private stream: ActiveStreamState | null = null;

  get messages(): ChatMessage[] {
    return [...this._messages];
  }
  set messages(next: ChatMessage[]) {
    this._messages = next;
  }
  setStream(stream: ActiveStreamState | null): void {
    this.stream = stream;
  }
  getActiveStreamSnapshot(): ActiveStreamState | null {
    return this.stream;
  }
}

function makeProjection(state: FakeChatState) {
  return new TabTranscriptProjection(state as unknown as ChatState);
}

function collect(): { fn: (s: TranscriptSnapshot) => void; snapshots: TranscriptSnapshot[] } {
  const snapshots: TranscriptSnapshot[] = [];
  return { fn: (s) => snapshots.push(s), snapshots };
}

describe('TabTranscriptProjection', () => {
  it('pushes the current snapshot on subscribe and stops after dispose', () => {
    const state = new FakeChatState();
    state.messages = [{ id: 'm1', role: 'assistant', content: 'hi', timestamp: 0 }];
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();

    const dispose = projection.subscribe(fn);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].messages).toHaveLength(1);
    expect(snapshots[0].conversationId).toBe('c1');

    projection.emit();
    expect(snapshots).toHaveLength(2);

    dispose();
    projection.emit();
    expect(snapshots).toHaveLength(2); // no further pushes after dispose
  });

  it('emit is a no-op with no observers', () => {
    const projection = makeProjection(new FakeChatState());
    expect(() => projection.emit()).not.toThrow();
  });

  it('setGreeting only re-emits on a changed value and suppresses greeting once messages exist', () => {
    const state = new FakeChatState();
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();
    projection.subscribe(fn); // initial

    projection.setGreeting('Good morning');
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].greeting).toBe('Good morning');

    projection.setGreeting('Good morning'); // unchanged → no emit
    expect(snapshots).toHaveLength(2);

    // Greeting is suppressed once the transcript has messages.
    state.messages = [{ id: 'm1', role: 'assistant', content: 'x', timestamp: 0 }];
    projection.emit();
    expect(snapshots[2].greeting).toBe('');
  });

  it('setLoadingText re-raises a non-null value even when unchanged, but coalesces repeated null', () => {
    const projection = makeProjection(new FakeChatState());
    const { fn, snapshots } = collect();
    projection.subscribe(fn);
    const base = snapshots.length;

    projection.setLoadingText('Loading…');
    projection.setLoadingText('Loading…'); // unchanged non-null → still re-raises
    expect(snapshots.length).toBe(base + 2);
    expect(snapshots[snapshots.length - 1].loadingText).toBe('Loading…');

    projection.setLoadingText(null);
    projection.setLoadingText(null); // unchanged null → coalesced (no emit)
    expect(snapshots.length).toBe(base + 3);
    expect(snapshots[snapshots.length - 1].loadingText).toBeNull();
  });

  it('setHydrationError always re-emits and carries the banner', () => {
    const projection = makeProjection(new FakeChatState());
    const { fn, snapshots } = collect();
    projection.subscribe(fn);

    projection.setHydrationError({ code: 'x', message: 'boom' });
    expect(snapshots[snapshots.length - 1].hydrationError).toEqual({ code: 'x', message: 'boom' });
    projection.setHydrationError(null);
    expect(snapshots[snapshots.length - 1].hydrationError).toBeNull();
  });

  it('gives the active-stream message a fresh identity (incl tool calls + nested subagent) so the keyed child re-renders', () => {
    const state = new FakeChatState();
    const live: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      toolCalls: [
        {
          id: 't1',
          name: 'Task',
          status: 'running',
          input: {},
          subagent: {
            agentId: 'sa1',
            toolCalls: [{ id: 'n1', name: 'Read', status: 'running', input: {} }],
          },
        },
      ],
    } as unknown as ChatMessage;
    state.messages = [live];
    state.activeMessageId = 'a1';
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();
    projection.subscribe(fn);

    const projected = snapshots[0].messages[0];
    expect(projected).not.toBe(live); // fresh message identity
    expect(projected.toolCalls![0]).not.toBe(live.toolCalls![0]); // fresh tool-call identity
    expect(projected.toolCalls![0].subagent).not.toBe(live.toolCalls![0].subagent); // fresh subagent ref
    expect(projected.toolCalls![0].subagent!.toolCalls![0]).not.toBe(live.toolCalls![0].subagent!.toolCalls![0]);
    // Snapshot-only: the engine's live object is untouched.
    expect(state.messages[0]).toBe(live);
  });

  it('refreshMessage gives an off-stream dirtied message a fresh identity exactly once', () => {
    const state = new FakeChatState();
    const msg: ChatMessage = { id: 'b1', role: 'assistant', content: 'done', timestamp: 0 };
    state.messages = [msg];
    state.activeMessageId = null; // not the active stream
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();
    projection.subscribe(fn);
    expect(snapshots[0].messages[0]).toBe(msg); // not dirtied yet → same identity

    projection.refreshMessage('b1');
    expect(snapshots[1].messages[0]).not.toBe(msg); // dirtied → fresh identity

    projection.emit();
    expect(snapshots[2].messages[0]).toBe(msg); // dirty flag consumed → same identity again
  });

  it('bumps projectionRevision only when the conversation identity changes', () => {
    const state = new FakeChatState();
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();
    projection.subscribe(fn);
    const rev0 = snapshots[0].projectionRevision;

    projection.emit(); // same conversation
    expect(snapshots[1].projectionRevision).toBe(rev0);

    state.currentConversationId = 'c2';
    projection.emit();
    expect(snapshots[2].projectionRevision).toBe(rev0 + 1);
  });

  it('leaves tool-call-less and subagent-less messages structurally intact on refresh', () => {
    const state = new FakeChatState();
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      toolCalls: [{ id: 't1', name: 'Bash', status: 'completed', input: {} }],
    } as unknown as ChatMessage;
    state.messages = [msg];
    state.activeMessageId = 'a1';
    const projection = makeProjection(state);
    const { fn, snapshots } = collect();
    projection.subscribe(fn);

    const tool = snapshots[0].messages[0].toolCalls![0];
    expect(tool.subagent).toBeUndefined();
    expect(tool.name).toBe('Bash');
  });
});
