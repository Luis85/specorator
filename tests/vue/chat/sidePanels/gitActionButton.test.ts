import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import GitActionButton from '@/features/chat/ui/vue/components/GitActionButton.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, name: string) => el.setAttribute('data-icon', name) }));

function mountBtn(cb: Record<string, unknown> = {}) {
  return mount(GitActionButton, { global: { provide: { [CALLBACKS_KEY as symbol]: { onGitCommit: vi.fn(), ...cb } } } });
}

describe('GitActionButton.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hides when store.git.visible is false and emits legacy classes when visible', () => {
    const store = useChatShellStore();
    const w = mountBtn();
    expect(w.find('.specorator-git-action').classes()).toContain('specorator-hidden');
    store.setGit({ isRepo: true, dirtyCount: 4, visible: true });
    return w.vm.$nextTick().then(() => {
      expect(w.find('.specorator-git-action').classes()).not.toContain('specorator-hidden');
      expect(w.find('.specorator-git-action-btn').exists()).toBe(true);
      expect(w.find('.specorator-git-action-icon').exists()).toBe(true);
      expect(w.find('.specorator-git-action-label').text()).toBe('Commit & push');
      expect(w.find('.specorator-git-action-badge').text()).toBe('4');
    });
  });

  it('calls onGitCommit on click', async () => {
    const store = useChatShellStore();
    store.setGit({ isRepo: true, dirtyCount: 1, visible: true });
    const onGitCommit = vi.fn();
    const w = mountBtn({ onGitCommit });
    await w.find('.specorator-git-action-btn').trigger('click');
    expect(onGitCommit).toHaveBeenCalled();
  });
});
