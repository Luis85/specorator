import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ExitPlanModeDecision } from '@/core/types/tools';
import { CHOICE_CARD_HINTS_TEXT } from '@/features/chat/rendering/inlineChoiceCard';
import { InlineExitPlanMode } from '@/features/chat/rendering/InlineExitPlanMode';
import { InlinePlanApproval, type PlanApprovalDecision } from '@/features/chat/rendering/InlinePlanApproval';

/**
 * Characterization test: locks the exact DOM contract + keyboard-driven
 * resolve payloads the legacy `InlineExitPlanMode` and `InlinePlanApproval`
 * produce (both built on the shared `InlineChoiceList` + `activateInlineCard`
 * primitives from `inlineChoiceCard.ts`, and `renderPlanContentPreview`) so
 * `InlineChoiceList.vue`, `PlanContentPreview.vue`, `InlineExitPlanMode.vue`,
 * and `InlinePlanApproval.vue` can be built to reproduce it exactly. Its Vue
 * parity twins are `inlineChoiceList.test.ts`, `planContentPreview.test.ts`,
 * `inlineExitPlanMode.test.ts`, and `inlinePlanApproval.test.ts`.
 */

beforeAll(() => {
  // jsdom does not implement scrollIntoView; activateInlineCard + the choice
  // list's focus-change handling both call it unconditionally.
  Element.prototype.scrollIntoView = vi.fn();
});

function fireKeyDown(root: HTMLElement, key: string): void {
  root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function rowLabel(row: Element): string | null {
  return row.querySelector('.specorator-ask-item-label')?.textContent ?? null;
}

// Real jsdom focus() (used by the choice list's auto-focus-on-navigate) is a
// no-op on disconnected elements, so every container must be attached.
function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('InlineExitPlanMode characterization', () => {
  it('renders root/title/permissions/rows/hints and resolves approve-new-session with plan content', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-'));
    const plansDir = path.join(tmpDir, '.claude', 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    const planFilePath = path.join(plansDir, 'plan.md');
    fs.writeFileSync(planFilePath, 'Step 1\nStep 2\n', 'utf8');

    const container = createContainer();
    const resolve = vi.fn<(decision: ExitPlanModeDecision | null) => void>();
    const renderContent = vi.fn().mockResolvedValue(undefined);

    const widget = new InlineExitPlanMode(
      container,
      { planFilePath, allowedPrompts: [{ tool: 'Bash', prompt: 'Run bash commands' }] },
      resolve,
      undefined,
      renderContent,
      plansDir.replace(/\\/g, '/'),
    );
    widget.render();
    // Wait a tick for the rAF-scheduled focus/scroll.
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));

    const root = container.querySelector('.specorator-plan-approval-inline')!;
    expect(root).toBeTruthy();
    expect(root.getAttribute('tabindex')).toBe('0');

    const title = root.querySelector('.specorator-plan-inline-title')!;
    expect(title.textContent).toBe('Plan complete');

    expect(renderContent).toHaveBeenCalledWith(expect.anything(), 'Step 1\nStep 2');

    const permLabel = root.querySelector('.specorator-plan-permissions-label')!;
    expect(permLabel.textContent).toBe('Requested permissions:');
    const permItems = Array.from(root.querySelectorAll('.specorator-plan-permissions-list li')).map(
      (li) => li.textContent,
    );
    expect(permItems).toEqual(['Run bash commands']);

    const rows = Array.from(root.querySelectorAll('.specorator-ask-item'));
    expect(rows).toHaveLength(3);
    expect(rows.map(rowLabel)).toEqual(['Approve (new session)', 'Approve (current session)', null]);
    expect(rows[0].classList.contains('is-focused')).toBe(true);
    expect(rows[1].classList.contains('is-focused')).toBe(false);
    expect(rows[2].classList.contains('specorator-ask-custom-item')).toBe(true);
    const feedbackInput = rows[2].querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(feedbackInput.placeholder).toBe('Enter feedback to continue planning...');

    const hints = root.querySelector('.specorator-ask-hints')!;
    expect(hints.textContent).toBe(CHOICE_CARD_HINTS_TEXT);
    expect(hints.textContent).toBe('Arrow keys to navigate · Enter to select · Esc to cancel');

    fireKeyDown(root as HTMLElement, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({
      type: 'approve-new-session',
      planContent: 'Implement this plan:\n\nStep 1\nStep 2',
    });
    // Single-exit: root detached, further keydowns are no-ops.
    expect(root.isConnected).toBe(false);
    fireKeyDown(root as HTMLElement, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('shows the read-error preview when the plan file cannot be read', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineExitPlanMode(
      container,
      { planFilePath: '/path/.claude/plans/does-not-exist.md' },
      resolve,
      undefined,
      undefined,
      '/.claude/plans/',
    );
    widget.render();

    const errorEl = container.querySelector('.specorator-plan-content-preview.specorator-plan-read-error')!;
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Could not read plan file:');
    expect(errorEl.textContent).toContain('"Approve (new session)" will not include plan details.');
  });

  it('resolves approve (current session) via ArrowDown + Enter', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineExitPlanMode(container, {}, resolve);
    widget.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'ArrowDown');
    fireKeyDown(root, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'approve' });
  });

  it('resolves feedback via ArrowDown x2 + Enter (focuses input) + typed Enter', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineExitPlanMode(container, {}, resolve);
    widget.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'ArrowDown');
    fireKeyDown(root, 'ArrowDown');
    fireKeyDown(root, 'Enter'); // focuses the feedback input
    expect(resolve).not.toHaveBeenCalled();

    const input = root.querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    input.value = 'Please revise the plan';
    fireKeyDown(root, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'feedback', text: 'Please revise the plan' });
  });

  it('resolves null on Escape (top level) without submitting feedback', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineExitPlanMode(container, {}, resolve);
    widget.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'Escape');
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null on abort and does not resolve twice on destroy()', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const controller = new AbortController();
    const widget = new InlineExitPlanMode(container, {}, resolve, controller.signal);
    widget.render();

    controller.abort();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);

    widget.destroy();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('destroy() alone (no prior render-triggered resolve) resolves null exactly once', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineExitPlanMode(container, {}, resolve);
    widget.render();

    widget.destroy();
    widget.destroy();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
  });
});

describe('InlinePlanApproval characterization', () => {
  it('renders root/title/rows/hints (no permissions block) and resolves implement on default-focused Enter', () => {
    const container = createContainer();
    const resolve = vi.fn<(decision: PlanApprovalDecision | null) => void>();
    const approval = new InlinePlanApproval(container, resolve, { artifact: { markdown: 'Do the thing' } });
    approval.render();

    const root = container.querySelector('.specorator-plan-approval-inline')!;
    expect(root.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('.specorator-plan-inline-title')?.textContent).toBe('Plan complete');
    expect(root.querySelector('.specorator-plan-permissions')).toBeNull();

    const preview = root.querySelector('.specorator-plan-content-preview')!;
    expect(preview).toBeTruthy();
    expect(preview.classList.contains('specorator-plan-read-error')).toBe(false);

    const rows = Array.from(root.querySelectorAll('.specorator-ask-item'));
    expect(rows).toHaveLength(3);
    expect(rows.map(rowLabel)).toEqual(['Implement', null, 'Cancel']);
    expect(rows[1].classList.contains('specorator-ask-custom-item')).toBe(true);
    const reviseInput = rows[1].querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(reviseInput.placeholder).toBe('Enter feedback to revise plan...');

    expect(root.querySelector('.specorator-ask-hints')?.textContent).toBe(CHOICE_CARD_HINTS_TEXT);

    fireKeyDown(root as HTMLElement, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'implement' });
  });

  it('resolves cancel via ArrowDown x2 + Enter', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const approval = new InlinePlanApproval(container, resolve);
    approval.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'ArrowDown'); // -> Revise (auto-focuses input)
    // Esc out of input focus before navigating further, matching real usage.
    fireKeyDown(root, 'Escape');
    expect(resolve).not.toHaveBeenCalled();
    fireKeyDown(root, 'ArrowDown'); // -> Cancel
    fireKeyDown(root, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'cancel' });
  });

  it('resolves revise with typed text', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const approval = new InlinePlanApproval(container, resolve);
    approval.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'ArrowDown'); // -> Revise, auto-focuses input
    const input = root.querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    input.value = 'Add error handling';
    fireKeyDown(root, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'revise', text: 'Add error handling' });
  });

  it('resolves null on Escape at the top level', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const approval = new InlinePlanApproval(container, resolve);
    approval.render();
    const root = container.querySelector('.specorator-plan-approval-inline') as HTMLElement;

    fireKeyDown(root, 'Escape');
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('renders the read-error preview when the artifact path cannot be read', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const approval = new InlinePlanApproval(container, resolve, {
      artifact: { path: '/nope/plan.md' },
      planPathPrefix: '/nope/',
    });
    approval.render();

    const errorEl = container.querySelector('.specorator-plan-content-preview.specorator-plan-read-error')!;
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Could not read plan file:');
  });

  it('resolves null on destroy() and does not resolve twice', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const approval = new InlinePlanApproval(container, resolve);
    approval.render();

    approval.destroy();
    approval.destroy();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
  });
});
