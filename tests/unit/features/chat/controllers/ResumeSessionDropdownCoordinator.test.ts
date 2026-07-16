/**
 * @jest-environment jsdom
 */
import type { ConversationMeta } from '@/core/types';
import {
  ResumeSessionDropdownCoordinator,
  type ResumeSessionDropdownDeps,
} from '@/features/chat/controllers/ResumeSessionDropdownCoordinator';
import { ResumeSessionDropdown } from '@/shared/components/ResumeSessionDropdown';

jest.mock('@/shared/components/ResumeSessionDropdown', () => ({
  ResumeSessionDropdown: jest.fn(),
}));

const noticeMock = jest.fn();
jest.mock('obsidian', () => ({
  Notice: jest.fn().mockImplementation((...args: unknown[]) => noticeMock(...args)),
}));

function makeConversation(id: string): ConversationMeta {
  return {
    id,
    providerId: 'claude',
    title: id,
    createdAt: 0,
    updatedAt: 0,
    messageCount: 0,
    preview: '',
  };
}

describe('ResumeSessionDropdownCoordinator', () => {
  const dropdownInstance = {
    isVisible: jest.fn(() => true),
    handleKeydown: jest.fn(() => true),
    destroy: jest.fn(),
  };

  function makeCoordinator(overrides: Partial<ResumeSessionDropdownDeps> = {}) {
    const openConversation = jest.fn(() => Promise.resolve());
    const deps: ResumeSessionDropdownDeps = {
      getInputContainerEl: () => document.createElement('div'),
      getInputEl: () => document.createElement('textarea'),
      getConversations: () => [makeConversation('a'), makeConversation('b')],
      getCurrentConversationId: () => 'a',
      openConversation,
      // Chat always injects the dropdown coordinator; the resume dropdown is
      // built only when it is present (there is no DOM-render fallback).
      getDropdownCoordinator: () => ({}) as never,
      ...overrides,
    };
    return { coordinator: new ResumeSessionDropdownCoordinator(deps), openConversation, deps };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (ResumeSessionDropdown as jest.Mock).mockImplementation(() => dropdownInstance);
  });

  it('does not open when there are no conversations to resume', () => {
    const { coordinator } = makeCoordinator({ getConversations: () => [] });
    coordinator.show();
    expect(ResumeSessionDropdown).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledTimes(1);
  });

  it('constructs the dropdown with conversations and the current id', () => {
    const { coordinator } = makeCoordinator();
    coordinator.show();
    expect(ResumeSessionDropdown).toHaveBeenCalledTimes(1);
    const args = (ResumeSessionDropdown as jest.Mock).mock.calls[0];
    expect(args[2]).toHaveLength(2);
    expect(args[3]).toBe('a');
  });

  it('destroys the prior dropdown before opening a new one', () => {
    const { coordinator } = makeCoordinator();
    coordinator.show();
    coordinator.show();
    expect(dropdownInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it('routes onSelect through openConversation and dismisses', () => {
    const { coordinator, openConversation } = makeCoordinator();
    coordinator.show();
    const callbacks = (ResumeSessionDropdown as jest.Mock).mock.calls[0][4];
    callbacks.onSelect('b');
    expect(dropdownInstance.destroy).toHaveBeenCalled();
    expect(openConversation).toHaveBeenCalledWith('b');
  });

  it('delegates keydown only while visible', () => {
    const { coordinator } = makeCoordinator();
    expect(coordinator.handleKeydown(new KeyboardEvent('keydown'))).toBe(false);
    coordinator.show();
    expect(coordinator.handleKeydown(new KeyboardEvent('keydown'))).toBe(true);
    expect(dropdownInstance.handleKeydown).toHaveBeenCalled();
  });
});
