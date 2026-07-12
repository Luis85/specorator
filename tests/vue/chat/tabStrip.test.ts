import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { TabBarItem } from '@/features/chat/tabs/types';
import TabStrip from '@/features/chat/ui/vue/components/TabStrip.vue';

function item(id: string, o: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...o,
  } as TabBarItem;
}
function mountStrip(items: TabBarItem[]) {
  const onTabClick = vi.fn();
  const onTabClose = vi.fn();
  const { container } = render(TabStrip, { props: { items, onTabClick, onTabClose } });
  return { container, onTabClick, onTabClose };
}
function badges(c: Element): HTMLElement[] {
  return [...c.querySelectorAll<HTMLElement>('.specorator-tab-badge')];
}

describe('TabStrip (Vue parity with TabBar)', () => {
  it('plain chat badge: index text + active class + role/aria/tabindex/data attrs', () => {
    const { container } = mountStrip([item('a', { index: 2, isActive: true, providerId: 'codex' })]);
    const b = badges(container)[0];
    expect(b.textContent?.trim()).toBe('2');
    expect(b.classList.contains('specorator-tab-badge-active')).toBe(true);
    expect(b.getAttribute('role')).toBe('tab');
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(b.getAttribute('data-provider')).toBe('codex');
    expect(b.getAttribute('data-kind')).toBe('chat');
    expect(b.getAttribute('aria-label')).toBe('a');
  });

  it('idle/working/attention classes + working aria', () => {
    const { container } = mountStrip([item('idle'), item('work', { isStreaming: true }), item('attn', { needsAttention: true })]);
    const [idle, work, attn] = badges(container);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-working')).toBe(true);
    expect(work.getAttribute('aria-busy')).toBe('true');
    expect(work.getAttribute('data-working')).toBe('true');
    expect(work.getAttribute('aria-label')).toBe('work (working)');
    expect(attn.classList.contains('specorator-tab-badge-attention')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-idle')).toBe(false);
  });

  it('work-order badge: wrench glyph host, no number, --work-order + aria suffix; first-of-group margin', () => {
    const { container } = mountStrip([item('c'), item('wo1', { kind: 'work-order', title: 'Run', canClose: false }), item('wo2', { kind: 'work-order' })]);
    const [, wo1, wo2] = badges(container);
    expect(wo1.classList.contains('specorator-tab-badge--work-order')).toBe(true);
    expect(wo1.querySelector('.specorator-tab-badge-icon')).toBeTruthy();
    expect(wo1.getAttribute('aria-label')).toBe('Run (work order)');
    expect(wo1.classList.contains('specorator-tab-badge--work-order-first')).toBe(true);
    expect(wo2.classList.contains('specorator-tab-badge--work-order-first')).toBe(false);
  });

  it('agent-bound badge: user glyph + number span + --agent + aria suffix', () => {
    const { container } = mountStrip([item('a', { isAgentBound: true, index: 3 })]);
    const b = badges(container)[0];
    expect(b.classList.contains('specorator-tab-badge--agent')).toBe(true);
    expect(b.querySelector('.specorator-tab-badge-agent-icon')).toBeTruthy();
    expect(b.querySelector('.specorator-tab-badge-number')?.textContent).toBe('3');
    expect(b.getAttribute('aria-label')).toBe('a (agent)');
  });

  it('click + Enter → onTabClick; contextmenu + Delete → onTabClose only when canClose', async () => {
    const { container, onTabClick, onTabClose } = mountStrip([item('a'), item('locked', { canClose: false })]);
    const [a, locked] = badges(container);
    await fireEvent.click(a);
    expect(onTabClick).toHaveBeenCalledWith('a');
    await fireEvent.keyDown(a, { key: 'Enter' });
    expect(onTabClick).toHaveBeenCalledTimes(2);
    await fireEvent(a, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).toHaveBeenCalledWith('a');
    onTabClose.mockClear();
    // Keyboard close path (Delete) — parity with TabBar's wireBadgeInteraction.
    await fireEvent.keyDown(a, { key: 'Delete' });
    expect(onTabClose).toHaveBeenCalledWith('a');
    onTabClose.mockClear();
    // A non-closable badge must NOT close via contextmenu OR Delete.
    await fireEvent(locked, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await fireEvent.keyDown(locked, { key: 'Delete' });
    expect(onTabClose).not.toHaveBeenCalled();
    expect(locked.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('roving tabindex: one tab stop; ArrowRight moves it', async () => {
    const { container } = mountStrip([item('a', { isActive: true }), item('b'), item('c')]);
    const bs = badges(container);
    expect(bs.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    await fireEvent.keyDown(bs[0], { key: 'ArrowRight' });
    expect(bs[1].getAttribute('tabindex')).toBe('0');
    expect(bs[0].getAttribute('tabindex')).toBe('-1');
  });

  // The following mirror the roving assertions in
  // tests/unit/features/chat/tabs/TabBar.test.ts so parity holds across every key.
  it('ArrowLeft moves the tab stop to the previous badge', async () => {
    const { container } = mountStrip([item('a'), item('b', { isActive: true })]);
    const [first, second] = badges(container);
    expect(second.getAttribute('tabindex')).toBe('0');
    await fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(second.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight wraps from the last badge to the first', async () => {
    const { container } = mountStrip([item('a'), item('b', { isActive: true })]);
    const [first, second] = badges(container);
    await fireEvent.keyDown(second, { key: 'ArrowRight' });
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(second.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowLeft wraps from the first badge to the last', async () => {
    const { container } = mountStrip([item('a', { isActive: true }), item('b')]);
    const [first, last] = badges(container);
    await fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');
  });

  it('Home moves the tab stop to the first badge; End to the last', async () => {
    const { container } = mountStrip([item('a'), item('b', { isActive: true }), item('c')]);
    const [first, middle, last] = badges(container);
    await fireEvent.keyDown(middle, { key: 'End' });
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(middle.getAttribute('tabindex')).toBe('-1');
    await fireEvent.keyDown(last, { key: 'Home' });
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(last.getAttribute('tabindex')).toBe('-1');
  });

  it('single-badge strip: ArrowRight/ArrowLeft are no-ops (badge stays tabindex 0)', async () => {
    const { container, onTabClick } = mountStrip([item('only', { isActive: true })]);
    const [only] = badges(container);
    expect(only.getAttribute('tabindex')).toBe('0');
    await fireEvent.keyDown(only, { key: 'ArrowRight' });
    expect(only.getAttribute('tabindex')).toBe('0');
    await fireEvent.keyDown(only, { key: 'ArrowLeft' });
    expect(only.getAttribute('tabindex')).toBe('0');
    // Manual activation: arrows never switch the active tab.
    expect(onTabClick).not.toHaveBeenCalled();
  });
});
