import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock } from 'vitest';

import WorkOrderHandoffCard from '@/features/chat/ui/vue/transcript/cards/WorkOrderHandoffCard.vue';
import WorkOrderNeedsApprovalCard from '@/features/chat/ui/vue/transcript/cards/WorkOrderNeedsApprovalCard.vue';
import WorkOrderNeedsInputCard from '@/features/chat/ui/vue/transcript/cards/WorkOrderNeedsInputCard.vue';
import WorkOrderProgressCard from '@/features/chat/ui/vue/transcript/cards/WorkOrderProgressCard.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of `workOrderCards.characterization.test.ts`: reproduces the
 * same four card DOM contracts via the Vue components.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('WorkOrderProgressCard', () => {
  it('renders step, counter, bar fill %, and note', () => {
    const { container } = render(WorkOrderProgressCard, {
      props: { progress: { step: 'scanning files', done: { complete: 2, total: 5 }, note: 'src/ first' } },
    });

    const card = container.querySelector('.specorator-work-order-progress-card')!;
    expect(card.querySelector('.specorator-work-order-progress-card-step')?.textContent).toBe('scanning files');
    expect(card.querySelector('.specorator-work-order-progress-card-counter')?.textContent).toBe('2 / 5');
    const fill = card.querySelector('.specorator-work-order-progress-card-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(card.querySelector('.specorator-work-order-progress-card-note')?.textContent).toBe('src/ first');
  });

  it('omits counter, bar, and note when absent', () => {
    const { container } = render(WorkOrderProgressCard, { props: { progress: { step: 'thinking' } } });
    expect(container.querySelector('.specorator-work-order-progress-card-counter')).toBeNull();
    expect(container.querySelector('.specorator-work-order-progress-card-bar')).toBeNull();
    expect(container.querySelector('.specorator-work-order-progress-card-note')).toBeNull();
  });

  it('clamps the bar fill and handles a zero total', () => {
    const { container } = render(WorkOrderProgressCard, {
      props: { progress: { step: 'a', done: { complete: 7, total: 3 } } },
    });
    expect((container.querySelector('.specorator-work-order-progress-card-bar-fill') as HTMLElement).style.width).toBe(
      '100%',
    );
  });
});

describe('WorkOrderNeedsInputCard', () => {
  it('renders title, question, and why/default rows as label + sibling text', () => {
    const { container } = render(WorkOrderNeedsInputCard, {
      props: { needsInput: { question: 'Which env?', why: 'Ambiguous target', defaultValue: 'staging' } },
    });

    const card = container.querySelector('.specorator-work-order-needs-input-card')!;
    expect(card.querySelector('.specorator-work-order-needs-input-card-title')?.textContent).toBe(
      'Awaiting your input',
    );
    expect(card.querySelector('.specorator-work-order-needs-input-card-question')?.textContent).toBe(
      'Which env?',
    );
    expect(card.querySelector('.specorator-work-order-needs-input-card-why')?.textContent).toBe(
      'Why: Ambiguous target',
    );
    expect(card.querySelector('.specorator-work-order-needs-input-card-default')?.textContent).toBe(
      'Default: staging',
    );
  });

  it('omits why/default rows when absent', () => {
    const { container } = render(WorkOrderNeedsInputCard, { props: { needsInput: { question: 'Which env?' } } });
    expect(container.querySelector('.specorator-work-order-needs-input-card-why')).toBeNull();
    expect(container.querySelector('.specorator-work-order-needs-input-card-default')).toBeNull();
  });
});

describe('WorkOrderNeedsApprovalCard', () => {
  it('renders title, action, irreversible chip, and risk row', () => {
    const { container } = render(WorkOrderNeedsApprovalCard, {
      props: { needsApproval: { action: 'Delete branch', risk: 'Irreversible history loss', reversible: false } },
    });

    const card = container.querySelector('.specorator-work-order-needs-approval-card')!;
    expect(card.querySelector('.specorator-work-order-needs-approval-card-action')?.textContent).toBe(
      'Delete branch',
    );
    const chip = card.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')!;
    expect(chip.classList.contains('is-irreversible')).toBe(true);
    expect(chip.textContent).toBe('Irreversible');
    expect(card.querySelector('.specorator-work-order-needs-approval-card-risk')?.textContent).toBe(
      'Risk: Irreversible history loss',
    );
  });

  it('renders a Reversible chip without is-irreversible when reversible is true', () => {
    const { container } = render(WorkOrderNeedsApprovalCard, {
      props: { needsApproval: { action: 'Rename file', reversible: true } },
    });
    const chip = container.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')!;
    expect(chip.classList.contains('is-irreversible')).toBe(false);
    expect(chip.textContent).toBe('Reversible');
  });

  it('omits the chip and risk row when both are absent', () => {
    const { container } = render(WorkOrderNeedsApprovalCard, { props: { needsApproval: { action: 'Rename file' } } });
    expect(container.querySelector('.specorator-work-order-needs-approval-card-reversible-chip')).toBeNull();
    expect(container.querySelector('.specorator-work-order-needs-approval-card-risk')).toBeNull();
  });
});

describe('WorkOrderHandoffCard', () => {
  function mountHandoff() {
    const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
    return render(WorkOrderHandoffCard, {
      props: {
        preview: 'Refactored the auth module',
        handoff: {
          summary: 'Refactored the auth module',
          verification: 'Ran the full test suite',
          risks: 'None identified',
          nextAction: 'Merge to main',
        },
      },
      global: {
        provide: {
          [APP_KEY as symbol]: new App(),
          [COMPONENT_KEY as symbol]: new Component(),
          [PLUGIN_KEY as symbol]: plugin,
        },
      },
    });
  }

  it('renders header/chips/details and toggles on click', async () => {
    const { container } = mountHandoff();
    await flushPromises();

    const wrapper = container.querySelector('.specorator-work-order-handoff-card') as HTMLElement;
    expect(wrapper.classList.contains('expanded')).toBe(false);

    const header = wrapper.querySelector('.specorator-work-order-handoff-card-header') as HTMLElement;
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('aria-label')).toBe('Work order handoff - click to expand');
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
    expect(sections[0].querySelector('.rendered-md')?.textContent).toBe('Refactored the auth module');
    expect(sections[3].querySelector('.rendered-md')?.textContent).toBe('Merge to main');

    header.click();
    await flushPromises();
    expect(wrapper.classList.contains('expanded')).toBe(true);
    expect(details.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-label')).toBe('Work order handoff - click to collapse');
    expect(toggle.textContent).toBe('Collapse');
  });
});
