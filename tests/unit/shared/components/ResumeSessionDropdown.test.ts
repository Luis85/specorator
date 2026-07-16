/**
 * @jest-environment jsdom
 */
import type { ConversationMeta } from '@/core/types';
import type {
  ComposerDropdownDelegate,
  ComposerDropdownSource,
} from '@/shared/components/composerDropdownDelegate';
import {
  ResumeSessionDropdown,
  type ResumeSessionDropdownCallbacks,
} from '@/shared/components/ResumeSessionDropdown';

function createMockInput(): any {
  return {
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    focus: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
}

function createMockCallbacks(
  overrides: Partial<ResumeSessionDropdownCallbacks> = {}
): ResumeSessionDropdownCallbacks {
  return {
    onSelect: jest.fn(),
    onDismiss: jest.fn(),
    ...overrides,
  };
}

/**
 * Records the render/keyboard delegation. The resume dropdown owns detection +
 * insert logic and hands the coordinator its sorted items + a `source`; every
 * render/visibility/keyboard call goes through this stub (there is no DOM path).
 */
function createDelegateStub() {
  let kind: 'slash' | 'mention' | 'resume' | null = null;
  const captured: {
    items: ConversationMeta[] | null;
    source: ComposerDropdownSource | null;
    currentConversationId: string | null;
  } = { items: null, source: null, currentConversationId: null };

  const delegate: ComposerDropdownDelegate = {
    showSlash: jest.fn(),
    showMention: jest.fn(),
    showResume: jest.fn((items, _inputEl, source, currentConversationId) => {
      kind = 'resume';
      captured.items = items;
      captured.source = source;
      captured.currentConversationId = currentConversationId;
    }),
    setActiveIndex: jest.fn(),
    move: jest.fn(),
    // Owner-scoped clear: mirrors the real coordinator — only drops the state
    // when `owner` is omitted or matches the current kind.
    hide: jest.fn((owner?: 'slash' | 'mention' | 'resume') => {
      if (owner !== undefined && kind !== owner) return;
      kind = null;
    }),
    selectActive: jest.fn(),
    handleKeydown: jest.fn(() => true),
    getState: jest.fn(() => ({ kind })),
  };

  return {
    delegate,
    captured,
    setKind: (next: typeof kind) => { kind = next; },
  };
}

function createConversation(
  id: string,
  title: string,
  opts: Partial<ConversationMeta> = {}
): ConversationMeta {
  return {
    id,
    providerId: 'claude',
    title,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 5000,
    messageCount: 3,
    preview: 'Test preview',
    ...opts,
  };
}

describe('ResumeSessionDropdown', () => {
  let inputEl: any;
  let callbacks: ResumeSessionDropdownCallbacks;
  let stub: ReturnType<typeof createDelegateStub>;

  const conversations: ConversationMeta[] = [
    createConversation('conv-1', 'First Chat', { lastResponseAt: 1000 }),
    createConversation('conv-2', 'Second Chat', { lastResponseAt: 3000 }),
    createConversation('conv-3', 'Third Chat', { lastResponseAt: 2000 }),
  ];

  function makeDropdown(
    convs: ConversationMeta[] = conversations,
    currentId: string | null = null,
  ): ResumeSessionDropdown {
    return new ResumeSessionDropdown(
      document.createElement('div') as unknown as HTMLElement,
      inputEl,
      convs,
      currentId,
      callbacks,
      { coordinator: stub.delegate },
    );
  }

  beforeEach(() => {
    inputEl = createMockInput();
    callbacks = createMockCallbacks();
    stub = createDelegateStub();
  });

  describe('render delegation', () => {
    it('delegates render to the coordinator with sorted conversations', () => {
      const dropdown = makeDropdown();

      expect(stub.delegate.showResume).toHaveBeenCalledTimes(1);
      const sortedTitles = (stub.captured.items ?? []).map((c) => c.title);
      expect(sortedTitles).toEqual(['Second Chat', 'Third Chat', 'First Chat']);

      dropdown.destroy();
    });

    it('projects the current conversation id to the coordinator', () => {
      const dropdown = makeDropdown(conversations, 'conv-2');

      expect(stub.captured.currentConversationId).toBe('conv-2');

      dropdown.destroy();
    });

    it('never builds resume DOM in the container', () => {
      const containerEl = document.createElement('div');
      const dropdown = new ResumeSessionDropdown(
        containerEl,
        inputEl,
        conversations,
        null,
        callbacks,
        { coordinator: stub.delegate },
      );

      expect(containerEl.querySelector('.specorator-resume-dropdown')).toBeNull();

      dropdown.destroy();
    });

    it('adds input event listener for auto-dismiss', () => {
      const dropdown = makeDropdown();

      expect(inputEl.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));

      dropdown.destroy();
    });
  });

  describe('handleKeydown', () => {
    it('returns false without delegating when not visible', () => {
      const dropdown = makeDropdown();
      stub.setKind(null);

      const event = { key: 'ArrowDown', preventDefault: jest.fn() } as any;
      expect(dropdown.handleKeydown(event)).toBe(false);
      expect(stub.delegate.handleKeydown).not.toHaveBeenCalled();

      dropdown.destroy();
    });

    it('delegates the keyboard event to the coordinator when visible', () => {
      const dropdown = makeDropdown();

      const event = { key: 'ArrowDown', preventDefault: jest.fn() } as any;
      expect(dropdown.handleKeydown(event)).toBe(true);
      expect(stub.delegate.handleKeydown).toHaveBeenCalledWith(event);

      dropdown.destroy();
    });
  });

  describe('select (insert logic)', () => {
    it('calls onSelect with the id at the coordinator-provided index', () => {
      const dropdown = makeDropdown();

      // Sorted order: conv-2, conv-3, conv-1
      stub.captured.source?.select(0);
      expect(callbacks.onSelect).toHaveBeenCalledWith('conv-2');

      dropdown.destroy();
    });

    it('dismisses instead of selecting the current conversation', () => {
      const dropdown = makeDropdown(conversations, 'conv-2');

      // conv-2 sorts first and is current
      stub.captured.source?.select(0);
      expect(callbacks.onSelect).not.toHaveBeenCalled();
      expect(callbacks.onDismiss).toHaveBeenCalled();

      dropdown.destroy();
    });

    it('ignores an out-of-range index', () => {
      const dropdown = makeDropdown();

      stub.captured.source?.select(99);
      expect(callbacks.onSelect).not.toHaveBeenCalled();
      expect(callbacks.onDismiss).not.toHaveBeenCalled();

      dropdown.destroy();
    });

    it('routes the coordinator dismiss source through onDismiss', () => {
      const dropdown = makeDropdown();

      stub.captured.source?.dismiss();
      expect(callbacks.onDismiss).toHaveBeenCalled();

      dropdown.destroy();
    });
  });

  describe('isVisible', () => {
    it('reflects the coordinator resume state', () => {
      const dropdown = makeDropdown();
      expect(dropdown.isVisible()).toBe(true);

      stub.setKind(null);
      expect(dropdown.isVisible()).toBe(false);

      dropdown.destroy();
    });
  });

  describe('destroy', () => {
    it('removes the input listener and hides the owned coordinator state', () => {
      const dropdown = makeDropdown();

      dropdown.destroy();

      expect(inputEl.removeEventListener).toHaveBeenCalledWith('input', expect.any(Function));
      // Owner-scoped clear: passes its own 'resume' kind so it only drops the
      // state it owns.
      expect(stub.delegate.hide).toHaveBeenCalledTimes(1);
      expect(stub.delegate.hide).toHaveBeenCalledWith('resume');
      expect(stub.delegate.getState().kind).toBeNull();
    });

    it('does not clear the coordinator when it no longer owns the resume state', () => {
      const dropdown = makeDropdown();
      stub.setKind('slash');

      dropdown.destroy();

      // The scoped hide('resume') is a no-op against a non-resume owner, so the
      // menu another detector opened survives.
      expect(stub.delegate.hide).toHaveBeenCalledWith('resume');
      expect(stub.delegate.getState().kind).toBe('slash');
    });
  });
});
