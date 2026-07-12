import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createThinkingBlock,
  finalizeThinkingBlock,
  renderStoredThinkingBlock,
} from '@/features/chat/rendering/ThinkingBlockRenderer';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `ThinkingBlockRenderer` produces (classes, attributes, labels) so
 * `ThinkingBlock.vue` can be built to reproduce it exactly. This test is
 * deleted alongside the legacy renderer in Task 18; its Vue parity twin
 * (`thinkingBlock.test.ts`) remains.
 */
describe('ThinkingBlockRenderer characterization (DOM contract lock)', () => {
  let parentEl: HTMLElement;
  const mockRenderContent = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    mockRenderContent.mockClear();
    parentEl = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createThinkingBlock builds the live wrapper/header/label/content DOM contract', () => {
    const state = createThinkingBlock(parentEl, mockRenderContent);

    expect(state.wrapperEl.className).toBe('specorator-thinking-block');

    const header = state.wrapperEl.querySelector('.specorator-thinking-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe('Extended thinking - click to expand');

    const label = header.querySelector('.specorator-thinking-label') as HTMLElement;
    expect(label.textContent).toBe('Thinking 0s...');

    const content = state.wrapperEl.querySelector('.specorator-thinking-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);
    expect(state.wrapperEl.classList.contains('expanded')).toBe(false);

    finalizeThinkingBlock(state);
  });

  it('live label ticks every second while running', () => {
    const state = createThinkingBlock(parentEl, mockRenderContent);

    vi.advanceTimersByTime(3000);
    expect(state.labelEl.textContent).toBe('Thinking 3s...');

    finalizeThinkingBlock(state);
  });

  it('finalizeThinkingBlock sets the "Thought for Ns" label and collapses', () => {
    const state = createThinkingBlock(parentEl, mockRenderContent);

    vi.advanceTimersByTime(5000);
    const duration = finalizeThinkingBlock(state);

    expect(duration).toBeGreaterThanOrEqual(5);
    expect(state.labelEl.textContent).toBe(`Thought for ${duration}s`);
    expect(state.wrapperEl.classList.contains('expanded')).toBe(false);

    const header = state.wrapperEl.querySelector('.specorator-thinking-header') as HTMLElement;
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('renderStoredThinkingBlock renders the finalized wrapper contract with a duration', async () => {
    const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 12, mockRenderContent);

    expect(wrapperEl.className).toBe('specorator-thinking-block');

    const header = wrapperEl.querySelector('.specorator-thinking-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-label')).toBe('Extended thinking - click to expand');
    // setupCollapsible (initiallyExpanded: false) is what stamps aria-expanded here.
    expect(header.getAttribute('aria-expanded')).toBe('false');

    const label = header.querySelector('.specorator-thinking-label') as HTMLElement;
    expect(label.textContent).toBe('Thought for 12s');

    const content = wrapperEl.querySelector('.specorator-thinking-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);
    expect(mockRenderContent).toHaveBeenCalledWith(content, 'thinking content');
  });

  it('renderStoredThinkingBlock without a duration renders "Thought"', () => {
    const wrapperEl = renderStoredThinkingBlock(parentEl, 'x', undefined, mockRenderContent);
    const label = wrapperEl.querySelector('.specorator-thinking-label') as HTMLElement;
    expect(label.textContent).toBe('Thought');
  });

  it('header click/keydown toggles expanded state + aria/class contract; aria-label stays static', () => {
    const wrapperEl = renderStoredThinkingBlock(parentEl, 'x', 5, mockRenderContent);
    const header = wrapperEl.querySelector('.specorator-thinking-header') as HTMLElement;
    const content = wrapperEl.querySelector('.specorator-thinking-content') as HTMLElement;

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapperEl.classList.contains('expanded')).toBe(true);
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    // No baseAriaLabel is passed to setupCollapsible for thinking blocks, so
    // the aria-label never updates on toggle.
    expect(header.getAttribute('aria-label')).toBe('Extended thinking - click to expand');

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.dispatchEvent(enterEvent);
    expect(wrapperEl.classList.contains('expanded')).toBe(false);
    expect(enterEvent.defaultPrevented).toBe(true);
  });
});
