import { describe, expect, it, vi } from 'vitest';

import { TabBar, type TabBarCallbacks } from '@/features/chat/tabs/TabBar';
import type { TabBarItem } from '@/features/chat/tabs/types';

function item(id: string, o: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...o,
  } as TabBarItem;
}

function mountBar(items: TabBarItem[], cbs: Partial<TabBarCallbacks> = {}) {
  const el = document.createElement('div');
  const bar = new TabBar(el, {
    onTabClick: vi.fn(), onTabClose: vi.fn(), onNewTab: vi.fn(), ...cbs,
  });
  bar.update(items);
  return { el, bar };
}
function badges(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.specorator-tab-badge')];
}

describe('TabBar characterization (parity target for the Vue TabStrip)', () => {
  it('a plain chat badge shows its 1-based index as text and carries state/aria attrs', () => {
    const { el } = mountBar([item('a', { index: 2, isActive: true, providerId: 'codex' })]);
    const b = badges(el)[0];
    expect(b.textContent).toBe('2');
    expect(b.classList.contains('specorator-tab-badge-active')).toBe(true);
    expect(b.getAttribute('role')).toBe('tab');
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(b.getAttribute('data-provider')).toBe('codex');
    expect(b.getAttribute('data-kind')).toBe('chat');
    expect(b.getAttribute('aria-label')).toBe('a');
  });

  it('idle vs working vs attention state classes are mutually exclusive on the idle fallback', () => {
    const { el } = mountBar([
      item('idle'),
      item('work', { isStreaming: true }),
      item('attn', { needsAttention: true }),
    ]);
    const [idle, work, attn] = badges(el);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-working')).toBe(true);
    expect(work.getAttribute('aria-busy')).toBe('true');
    expect(work.getAttribute('data-working')).toBe('true');
    expect(work.getAttribute('aria-label')).toBe('work (working)');
    expect(attn.classList.contains('specorator-tab-badge-attention')).toBe(true);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-idle')).toBe(false);
  });

  it('a work-order badge renders a wrench glyph (no number), the work-order class, and the aria suffix', () => {
    const { el } = mountBar([item('c', { title: 'Ship it', index: 5 }), item('wo', { kind: 'work-order', title: 'Run', canClose: false })]);
    const wo = badges(el)[1];
    expect(wo.classList.contains('specorator-tab-badge--work-order')).toBe(true);
    expect(wo.querySelector('.specorator-tab-badge-icon')).toBeTruthy();
    expect(wo.textContent).toBe('');
    expect(wo.getAttribute('aria-label')).toBe('Run (work order)');
  });

  it('the first work-order badge after a chat group gets the --work-order-first margin class', () => {
    const { el } = mountBar([item('c'), item('wo1', { kind: 'work-order' }), item('wo2', { kind: 'work-order' })]);
    const [, wo1, wo2] = badges(el);
    expect(wo1.classList.contains('specorator-tab-badge--work-order-first')).toBe(true);
    expect(wo2.classList.contains('specorator-tab-badge--work-order-first')).toBe(false);
  });

  it('an agent-bound chat badge prepends a user glyph before the number and gets the --agent class', () => {
    const { el } = mountBar([item('a', { isAgentBound: true, index: 3 })]);
    const b = badges(el)[0];
    expect(b.classList.contains('specorator-tab-badge--agent')).toBe(true);
    expect(b.querySelector('.specorator-tab-badge-agent-icon')).toBeTruthy();
    expect(b.querySelector('.specorator-tab-badge-number')?.textContent).toBe('3');
    expect(b.getAttribute('aria-label')).toBe('a (agent)');
  });

  it('click and Enter fire onTabClick; right-click and Delete fire onTabClose only when canClose', () => {
    const onTabClick = vi.fn();
    const onTabClose = vi.fn();
    const { el } = mountBar([item('a'), item('locked', { canClose: false })], { onTabClick, onTabClose });
    const [a, locked] = badges(el);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTabClick).toHaveBeenCalledWith('a');
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).toHaveBeenCalledWith('a');
    onTabClose.mockClear();
    locked.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).not.toHaveBeenCalled();
    expect(locked.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('roving tabindex: exactly one badge is tabindex 0; ArrowRight moves the tab stop', () => {
    const { el } = mountBar([item('a', { isActive: true }), item('b'), item('c')]);
    const bs = badges(el);
    expect(bs.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    bs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(bs[1].getAttribute('tabindex')).toBe('0');
    expect(bs[0].getAttribute('tabindex')).toBe('-1');
  });
});
