import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposerDropdownCoordinator } from '@/features/chat/controllers/ComposerDropdownCoordinator';
import type { DropdownItem } from '@/shared/components/SlashCommandDropdown';
import type { MentionItem } from '@/shared/mention/types';

function makeInput(): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  // jsdom returns a zero rect; anchorFromInput floors width at 280.
  return el;
}

function slash(name: string, description?: string): DropdownItem {
  return { name, description, content: '', displayPrefix: '/', insertPrefix: '/', isBuiltIn: true };
}

// Raw detector items (the coordinator maps them into ComposerDropdownItem).
const SLASH_ITEMS: DropdownItem[] = [
  slash('clear', 'Start a new conversation'),
  slash('compact'),
  slash('help'),
];

describe('ComposerDropdownCoordinator projection', () => {
  let emitCount = 0;
  let coordinator: ComposerDropdownCoordinator;

  beforeEach(() => {
    emitCount = 0;
    coordinator = new ComposerDropdownCoordinator(() => { emitCount += 1; });
  });

  it('starts empty', () => {
    expect(coordinator.getState()).toEqual({ kind: null, items: [], activeIndex: 0, anchorRect: null });
    expect(coordinator.isVisible()).toBe(false);
  });

  it('showSlash projects { kind: slash, items, activeIndex: 0, anchorRect } and emits', () => {
    const input = makeInput();
    coordinator.showSlash(SLASH_ITEMS, input, { select: vi.fn(), dismiss: vi.fn() });

    const state = coordinator.getState();
    expect(state.kind).toBe('slash');
    // Coordinator projects raw DropdownItem[] into ComposerDropdownItem[].
    expect(state.items).toEqual([
      { id: '/clear', primary: '/clear', secondary: 'Start a new conversation', hint: undefined },
      { id: '/compact', primary: '/compact', secondary: undefined, hint: undefined },
      { id: '/help', primary: '/help', secondary: undefined, hint: undefined },
    ]);
    expect(state.activeIndex).toBe(0);
    expect(state.anchorRect).toEqual({ top: 0, left: 0, width: 280 });
    expect(coordinator.isVisible()).toBe(true);
    expect(emitCount).toBe(1);
  });

  it('move(1) advances then clamps at the last item', () => {
    coordinator.showSlash(SLASH_ITEMS, makeInput(), { select: vi.fn(), dismiss: vi.fn() });
    emitCount = 0;

    coordinator.move(1);
    expect(coordinator.getState().activeIndex).toBe(1);
    coordinator.move(1);
    expect(coordinator.getState().activeIndex).toBe(2);
    // Clamp: cannot advance past the last index.
    coordinator.move(1);
    expect(coordinator.getState().activeIndex).toBe(2);
    // Clamp: cannot retreat below 0.
    coordinator.move(-5);
    expect(coordinator.getState().activeIndex).toBe(0);
    expect(emitCount).toBe(4);
  });

  it('setActiveIndex clamps into range and emits', () => {
    coordinator.showSlash(SLASH_ITEMS, makeInput(), { select: vi.fn(), dismiss: vi.fn() });
    emitCount = 0;

    coordinator.setActiveIndex(99);
    expect(coordinator.getState().activeIndex).toBe(2);
    coordinator.setActiveIndex(-3);
    expect(coordinator.getState().activeIndex).toBe(0);
    expect(emitCount).toBe(2);
  });

  it('selectActive commits the highlighted item through the source', () => {
    const select = vi.fn();
    coordinator.showSlash(SLASH_ITEMS, makeInput(), { select, dismiss: vi.fn() });
    coordinator.move(1);
    coordinator.selectActive();
    expect(select).toHaveBeenCalledWith(1);
  });

  it('hide() clears the projection (no source teardown re-entry) and emits', () => {
    const dismiss = vi.fn();
    coordinator.showSlash(SLASH_ITEMS, makeInput(), { select: vi.fn(), dismiss });
    emitCount = 0;

    coordinator.hide();
    expect(coordinator.getState()).toEqual({ kind: null, items: [], activeIndex: 0, anchorRect: null });
    expect(coordinator.isVisible()).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
    expect(emitCount).toBe(1);
  });

  it('showMention projects raw items and pre-highlights the provided initial index', () => {
    const items: MentionItem[] = [
      { type: 'agent-folder', name: 'Agents' },
      { type: 'folder', name: 'notes', path: 'notes' },
      { type: 'file', name: 'c.md', path: 'c.md', file: {} as never },
    ];
    coordinator.showMention(items, makeInput(), { select: vi.fn(), dismiss: vi.fn() }, 2);
    const state = coordinator.getState();
    expect(state.kind).toBe('mention');
    expect(state.activeIndex).toBe(2);
    expect(state.items).toEqual([
      { id: 'agent-folder', primary: '@Agents/', variant: 'agent-folder' },
      { id: 'folder:notes', primary: '@notes/', variant: 'vault-folder' },
      { id: 'file:c.md', primary: 'c.md' },
    ]);
  });

  describe('keyboard bridge', () => {
    function keydown(key: string): KeyboardEvent {
      return new KeyboardEvent('keydown', { key, cancelable: true });
    }

    it('returns false when no dropdown is open (keydown falls through to send)', () => {
      expect(coordinator.handleKeydown(keydown('Enter'))).toBe(false);
    });

    it('ArrowDown/Up move the selection and are consumed', () => {
      coordinator.showSlash(SLASH_ITEMS, makeInput(), { select: vi.fn(), dismiss: vi.fn() });
      expect(coordinator.handleKeydown(keydown('ArrowDown'))).toBe(true);
      expect(coordinator.getState().activeIndex).toBe(1);
      expect(coordinator.handleKeydown(keydown('ArrowUp'))).toBe(true);
      expect(coordinator.getState().activeIndex).toBe(0);
    });

    it('Enter commits + returns true; Escape dismisses (runs source teardown) + returns true', () => {
      const select = vi.fn();
      const dismiss = vi.fn();
      coordinator.showSlash(SLASH_ITEMS, makeInput(), { select, dismiss });

      expect(coordinator.handleKeydown(keydown('Enter'))).toBe(true);
      expect(select).toHaveBeenCalledWith(0);

      coordinator.showSlash(SLASH_ITEMS, makeInput(), { select, dismiss });
      expect(coordinator.handleKeydown(keydown('Escape'))).toBe(true);
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(coordinator.isVisible()).toBe(false);
    });

    it('setEnabled(false) tears down any open dropdown', () => {
      const dismiss = vi.fn();
      coordinator.showSlash(SLASH_ITEMS, makeInput(), { select: vi.fn(), dismiss });
      coordinator.setEnabled(false);
      expect(coordinator.isVisible()).toBe(false);
      expect(dismiss).toHaveBeenCalledTimes(1);
    });
  });
});
