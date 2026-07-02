import { render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import AvatarSlot from '@/features/library/vue/components/AvatarSlot.vue';

vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));
import { renderAgentAvatar } from '@/features/agents/agentAvatar';

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: [],
  createdAt: 1, updatedAt: 2,
};

describe('AvatarSlot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the persona avatar into the host on mount', async () => {
    render(AvatarSlot, { props: { agent, size: 36 } });
    // The template-ref assignment re-triggers the watchEffect on the pre-flush
    // queue — the mount render lands a tick after render() returns.
    await nextTick();
    expect(renderAgentAvatar).toHaveBeenCalledTimes(1);
    const [host, persona, size] = vi.mocked(renderAgentAvatar).mock.calls[0];
    expect(host.classList.contains('specorator-roster-card-avatar')).toBe(true);
    expect(persona).toMatchObject({ id: 'roster:a', name: 'Alice', initials: 'A' });
    expect(size).toBe(36);
  });

  it('re-renders with the NEW persona when the agent prop is replaced (watchEffect, not onMounted)', async () => {
    // Cards are keyed by agent.id, so a store reload after a detail save hands
    // this SAME component instance a fresh agent object — an onMounted-only
    // render would keep showing the stale name/initials/color/icon avatar.
    const { rerender } = render(AvatarSlot, { props: { agent, size: 36 } });
    await nextTick(); // let the template-ref-triggered mount render land
    const host = vi.mocked(renderAgentAvatar).mock.calls[0][0];
    // Simulate a lingering child from the first render so the clear is observable.
    host.appendChild(document.createElement('span'));
    await rerender({ agent: { ...agent, name: 'Alice Renamed', initials: 'ZZ' }, size: 36 });
    await nextTick();
    expect(renderAgentAvatar).toHaveBeenCalledTimes(2);
    const [secondHost, persona] = vi.mocked(renderAgentAvatar).mock.calls[1];
    expect(persona).toMatchObject({ name: 'Alice Renamed', initials: 'ZZ' });
    // Same host node, cleared between renders — stale avatar DOM must not stack.
    expect(secondHost).toBe(host);
    expect(host.childElementCount).toBe(0);
  });
});
