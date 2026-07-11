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
    onOpenWorkOrders: vi.fn(),
    onQuickActions: vi.fn(),
    onRename: vi.fn(),
    onOpenSettings: vi.fn(),
    mountHistoryHost: vi.fn(),
    mountWorkOrderHost: vi.fn(),
    mountGitActionHost: vi.fn(),
    resolveNavRowEl: vi.fn(() => null),
    renderProviderLogo: vi.fn(),
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
});
