import { render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { markRaw, nextTick } from 'vue';

import type { ChatShellCallbacks } from '@/features/chat/ui/vue/chatShellCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ChatLogo from '@/features/chat/ui/vue/components/ChatLogo.vue';

function fakeCallbacks(overrides: Partial<ChatShellCallbacks> = {}): ChatShellCallbacks {
  return {
    subscribe: vi.fn(() => () => {}),
    onTabClick: vi.fn(),
    onTabClose: vi.fn(),
    onNewTab: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenHistory: vi.fn(),
    onQuickActions: vi.fn(),
    onQuickActionsHover: vi.fn(),
    onRename: vi.fn(),
    onOpenSettings: vi.fn(),
    mountHistoryHost: vi.fn(),
    resolveNavRowEl: vi.fn(() => null),
    renderProviderLogo: vi.fn(),
    onSelectConversation: vi.fn(),
    onOpenConversationInNewTab: vi.fn(),
    onRenameConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onRegenerateConversationTitle: vi.fn(),
    onConversationContextMenu: vi.fn(),
    onOpenWorkOrderItem: vi.fn(),
    onCloseWorkOrderTab: vi.fn(),
    onGitCommit: vi.fn(),
    ...overrides,
  };
}

function mountLogo(cb: ChatShellCallbacks, props: { providerId: string | null; visible: boolean }) {
  return render(ChatLogo, {
    props,
    global: { provide: { [CALLBACKS_KEY as symbol]: markRaw(cb) } },
  });
}

describe('ChatLogo', () => {
  it('calls renderProviderLogo with the host element and providerId on mount', async () => {
    const cb = fakeCallbacks();
    const { container } = mountLogo(cb, { providerId: 'claude', visible: true });
    const host = container.querySelector('.specorator-logo');
    expect(host).toBeTruthy();
    // watchEffect's re-run (triggered by the template ref populating on mount)
    // is scheduled on the pre-flush queue, not synchronous with render().
    await nextTick();
    expect(cb.renderProviderLogo).toHaveBeenCalledTimes(1);
    expect(cb.renderProviderLogo).toHaveBeenCalledWith(host, 'claude');
  });

  it('does not call renderProviderLogo when providerId is null', () => {
    const cb = fakeCallbacks();
    mountLogo(cb, { providerId: null, visible: true });
    expect(cb.renderProviderLogo).not.toHaveBeenCalled();
  });

  it('is hidden (display:none via v-show) when visible=false, and shown when visible=true', () => {
    const cb = fakeCallbacks();
    const { container, rerender } = mountLogo(cb, { providerId: 'claude', visible: false });
    const host = container.querySelector('.specorator-logo') as HTMLElement;
    expect(host.style.display).toBe('none');

    return rerender({ providerId: 'claude', visible: true }).then(() => {
      expect(host.style.display).not.toBe('none');
    });
  });

  it('re-invokes renderProviderLogo when providerId changes', async () => {
    const cb = fakeCallbacks();
    const { rerender } = mountLogo(cb, { providerId: 'claude', visible: true });
    await nextTick();
    expect(cb.renderProviderLogo).toHaveBeenCalledTimes(1);

    await rerender({ providerId: 'codex', visible: true });
    expect(cb.renderProviderLogo).toHaveBeenCalledTimes(2);
    expect(cb.renderProviderLogo).toHaveBeenLastCalledWith(expect.anything(), 'codex');
  });

  it('clears the host before each render so a provider switch replaces the SVG rather than stacking', async () => {
    // A realistic renderProviderLogo: append one SVG per call, as syncHeaderLogo
    // does. Only ChatLogo's own `el.textContent = ''` keeps the count at one.
    const renderProviderLogo = vi.fn((el: HTMLElement, providerId: string) => {
      const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-provider', providerId);
      el.appendChild(svg);
    });
    const cb = fakeCallbacks({ renderProviderLogo });
    const { container, rerender } = mountLogo(cb, { providerId: 'claude', visible: true });
    await nextTick();
    const host = container.querySelector('.specorator-logo') as HTMLElement;
    expect(host.querySelectorAll('svg')).toHaveLength(1);

    await rerender({ providerId: 'codex', visible: true });
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(host.querySelector('svg')?.getAttribute('data-provider')).toBe('codex');
  });
});
