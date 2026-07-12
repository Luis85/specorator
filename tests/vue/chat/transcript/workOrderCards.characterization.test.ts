import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderContentFn } from '@/features/chat/rendering/MessageRenderer';
import { renderWorkOrderHandoffCard } from '@/features/chat/rendering/WorkOrderHandoffCard';
import { renderWorkOrderNeedsApprovalCard } from '@/features/chat/rendering/WorkOrderNeedsApprovalCard';
import { renderWorkOrderNeedsInputCard } from '@/features/chat/rendering/WorkOrderNeedsInputCard';
import { renderWorkOrderProgressCard } from '@/features/chat/rendering/WorkOrderProgressCard';
import type { WorkOrderProtocolSegment } from '@/features/chat/rendering/WorkOrderProtocolDisplay';

/**
 * Characterization test: locks the exact DOM contract the legacy work-order
 * protocol card renderers produce — classes, icons, text, optional-field
 * elision, and (for the handoff card) the collapsible header/details
 * contract — so the Vue twins (`cards/WorkOrder*.vue`) can be built to
 * reproduce it exactly. Deleted alongside the legacy renderers in a later
 * cleanup task; their Vue parity twins are `workOrderCards.test.ts`.
 */
describe('renderWorkOrderProgressCard characterization', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('renders step, counter, bar fill %, and note when all fields present', () => {
    renderWorkOrderProgressCard(parentEl, { step: 'scanning files', done: { complete: 2, total: 5 }, note: 'src/ first' });

    const card = parentEl.querySelector('.specorator-work-order-progress-card');
    expect(card).not.toBeNull();

    const header = card!.querySelector('.specorator-work-order-progress-card-header') as HTMLElement;
    const icon = header.querySelector('.specorator-work-order-progress-card-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(icon, 'activity');

    expect(header.querySelector('.specorator-work-order-progress-card-step')?.textContent).toBe('scanning files');
    expect(header.querySelector('.specorator-work-order-progress-card-counter')?.textContent).toBe('2 / 5');

    const fill = card!.querySelector('.specorator-work-order-progress-card-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(card!.querySelector('.specorator-work-order-progress-card-note')?.textContent).toBe('src/ first');
  });

  it('omits counter, bar, and note when done/note are absent', () => {
    renderWorkOrderProgressCard(parentEl, { step: 'thinking' });
    expect(parentEl.querySelector('.specorator-work-order-progress-card-counter')).toBeNull();
    expect(parentEl.querySelector('.specorator-work-order-progress-card-bar')).toBeNull();
    expect(parentEl.querySelector('.specorator-work-order-progress-card-note')).toBeNull();
  });

  it('clamps the bar fill to [0, 100] and handles a zero total', () => {
    renderWorkOrderProgressCard(parentEl, { step: 'a', done: { complete: 7, total: 3 } });
    expect((parentEl.querySelector('.specorator-work-order-progress-card-bar-fill') as HTMLElement).style.width).toBe(
      '100%',
    );

    parentEl.empty();
    renderWorkOrderProgressCard(parentEl, { step: 'b', done: { complete: 0, total: 0 } });
    expect((parentEl.querySelector('.specorator-work-order-progress-card-bar-fill') as HTMLElement).style.width).toBe(
      '0%',
    );
  });
});

describe('renderWorkOrderNeedsInputCard characterization', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('renders icon, title, question, and why/default rows as label + sibling text', () => {
    renderWorkOrderNeedsInputCard(parentEl, { question: 'Which env?', why: 'Ambiguous target', defaultValue: 'staging' });

    const card = parentEl.querySelector('.specorator-work-order-needs-input-card')!;
    const header = card.querySelector('.specorator-work-order-needs-input-card-header') as HTMLElement;
    const icon = header.querySelector('.specorator-work-order-needs-input-card-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(icon, 'message-circle-question');
    expect(header.querySelector('.specorator-work-order-needs-input-card-title')?.textContent).toBe(
      'Awaiting your input',
    );
    expect(header.querySelector('.specorator-work-order-needs-input-card-question')?.textContent).toBe(
      'Which env?',
    );

    const why = card.querySelector('.specorator-work-order-needs-input-card-why')!;
    expect(why.querySelector('.specorator-work-order-needs-input-card-label')?.textContent).toBe('Why: ');
    expect(why.textContent).toBe('Why: Ambiguous target');

    const def = card.querySelector('.specorator-work-order-needs-input-card-default')!;
    expect(def.querySelector('.specorator-work-order-needs-input-card-label')?.textContent).toBe('Default: ');
    expect(def.textContent).toBe('Default: staging');
  });

  it('omits why/default rows when absent', () => {
    renderWorkOrderNeedsInputCard(parentEl, { question: 'Which env?' });
    expect(parentEl.querySelector('.specorator-work-order-needs-input-card-why')).toBeNull();
    expect(parentEl.querySelector('.specorator-work-order-needs-input-card-default')).toBeNull();
  });
});

describe('renderWorkOrderNeedsApprovalCard characterization', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('renders icon, title, action, reversible chip, and risk row', () => {
    renderWorkOrderNeedsApprovalCard(parentEl, { action: 'Delete branch', risk: 'Irreversible history loss', reversible: false });

    const card = parentEl.querySelector('.specorator-work-order-needs-approval-card')!;
    const header = card.querySelector('.specorator-work-order-needs-approval-card-header') as HTMLElement;
    const icon = header.querySelector('.specorator-work-order-needs-approval-card-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(icon, 'shield-alert');
    expect(header.querySelector('.specorator-work-order-needs-approval-card-title')?.textContent).toBe(
      'Approval required',
    );
    expect(header.querySelector('.specorator-work-order-needs-approval-card-action')?.textContent).toBe(
      'Delete branch',
    );

    const chip = header.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')!;
    expect(chip.classList.contains('is-irreversible')).toBe(true);
    expect(chip.textContent).toBe('Irreversible');

    const risk = card.querySelector('.specorator-work-order-needs-approval-card-risk')!;
    expect(risk.querySelector('.specorator-work-order-needs-approval-card-label')?.textContent).toBe('Risk: ');
    expect(risk.textContent).toBe('Risk: Irreversible history loss');
  });

  it('renders a Reversible chip (no is-irreversible class) when reversible is true', () => {
    renderWorkOrderNeedsApprovalCard(parentEl, { action: 'Rename file', reversible: true });
    const chip = parentEl.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')!;
    expect(chip.classList.contains('is-irreversible')).toBe(false);
    expect(chip.textContent).toBe('Reversible');
  });

  it('omits the chip and risk row when both are absent', () => {
    renderWorkOrderNeedsApprovalCard(parentEl, { action: 'Rename file' });
    expect(parentEl.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')).toBeNull();
    expect(parentEl.querySelector('.specorator-work-order-needs-approval-card-risk')).toBeNull();
  });
});

describe('renderWorkOrderHandoffCard characterization', () => {
  let parentEl: HTMLElement;
  let renderMarkdown: RenderContentFn & ReturnType<typeof vi.fn>;

  const segment: Extract<WorkOrderProtocolSegment, { type: 'handoff' }> = {
    type: 'handoff',
    handoff: {
      summary: 'Refactored the auth module',
      verification: 'Ran the full test suite',
      risks: 'None identified',
      nextAction: 'Merge to main',
    },
    preview: 'Refactored the auth module',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
    renderMarkdown = vi.fn(async (el: HTMLElement, md: string) => {
      el.createDiv({ cls: 'rendered-md', text: md });
    });
  });

  it('renders header/chips/details with collapsible toggle behavior', () => {
    renderWorkOrderHandoffCard(parentEl, segment, renderMarkdown);

    const wrapper = parentEl.querySelector('.specorator-work-order-handoff-card') as HTMLElement;
    expect(wrapper.classList.contains('expanded')).toBe(false);

    const header = wrapper.querySelector('.specorator-work-order-handoff-card-header') as HTMLElement;
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('aria-label')).toBe('Work order handoff - click to expand');

    const icon = header.querySelector('.specorator-work-order-handoff-card-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(icon, 'clipboard-check');
    expect(header.querySelector('.specorator-work-order-handoff-card-title')?.textContent).toBe(
      'Work order handoff',
    );
    expect(header.querySelector('.specorator-work-order-handoff-card-preview')?.textContent).toBe(
      'Refactored the auth module',
    );

    const toggle = header.querySelector('.specorator-work-order-handoff-card-toggle')!;
    expect(toggle.textContent).toBe('Expand');

    const chips = Array.from(wrapper.querySelectorAll('.specorator-work-order-handoff-card-chip')).map(
      (el) => el.textContent,
    );
    expect(chips).toEqual(['Verification', 'Risks', 'Next Action']);

    const details = wrapper.querySelector('.specorator-work-order-handoff-card-details') as HTMLElement;
    expect(details.classList.contains('specorator-hidden')).toBe(true);

    const sections = details.querySelectorAll(':scope > .specorator-work-order-handoff-card-section');
    expect(sections).toHaveLength(4);
    const titles = Array.from(sections).map(
      (s) => s.querySelector('.specorator-work-order-handoff-card-section-title')?.textContent,
    );
    expect(titles).toEqual(['Summary', 'Verification', 'Risks', 'Next Action']);
    expect(renderMarkdown).toHaveBeenCalledTimes(4);
    expect(renderMarkdown.mock.calls.map((c) => c[1])).toEqual([
      'Refactored the auth module',
      'Ran the full test suite',
      'None identified',
      'Merge to main',
    ]);

    header.click();
    expect(wrapper.classList.contains('expanded')).toBe(true);
    expect(details.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-label')).toBe('Work order handoff - click to collapse');
    expect(toggle.textContent).toBe('Collapse');
  });
});
