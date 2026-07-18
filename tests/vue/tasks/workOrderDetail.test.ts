import { fireEvent, render } from '@testing-library/vue';
import { Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import {
  DETAIL_APP_KEY,
  DETAIL_CALLBACKS_KEY,
  DETAIL_CLOSE_KEY,
  DETAIL_MD_COMPONENT_KEY,
  DETAIL_TASK_KEY,
} from '@/features/tasks/ui/vue/detailKeys';
import WorkOrderDetailRoot from '@/features/tasks/ui/vue/WorkOrderDetailRoot.vue';
import type { WorkOrderDetailModalCallbacks } from '@/features/tasks/ui/WorkOrderDetailModal';

// ---- fixtures -------------------------------------------------------------

function makeTask(
  id: string,
  status: TaskStatus,
  sections: Partial<TaskSpec['sections']> = {},
  frontmatter: Partial<TaskSpec['frontmatter']> = {},
): TaskSpec {
  return {
    path: `Agent Board/tasks/${id}.md`,
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id,
      title: `Task ${id}`,
      status,
      priority: '2 - normal',
      created: '2026-06-04T00:00:00Z',
      updated: '2026-06-04T00:00:00Z',
      attempts: 0,
      ...frontmatter,
    },
    sections: {
      objective: 'Do something.',
      acceptanceCriteria: '- [ ] Done.',
      context: '',
      constraints: '',
      ledger: '',
      handoff: '',
      ...sections,
    },
    body: '',
    raw: '',
  };
}

function makeCallbacks(overrides: Partial<WorkOrderDetailModalCallbacks> = {}): WorkOrderDetailModalCallbacks {
  return {
    onOpenNote: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    onAccept: vi.fn(),
    onRework: vi.fn(),
    onMarkReady: vi.fn(),
    onArchive: vi.fn(),
    onReopen: vi.fn(),
    onSendToReview: vi.fn(),
    onMarkFailed: vi.fn(),
    onSaveFields: vi.fn(),
    onSaveSections: vi.fn(),
    getProviderOptions: () => [],
    getModelOptions: () => [],
    getAgentOptions: () => [{ value: 'standard', label: 'Standard' }],
    ...overrides,
  };
}

function richCallbacks(overrides: Partial<WorkOrderDetailModalCallbacks> = {}): WorkOrderDetailModalCallbacks {
  return makeCallbacks({
    getProviderOptions: () => [
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ],
    getModelOptions: (providerId) =>
      providerId === 'codex'
        ? [{ value: 'gpt-5', label: 'gpt-5' }]
        : [{ value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  });
}

function renderRoot(task: TaskSpec, callbacks: WorkOrderDetailModalCallbacks = makeCallbacks(), close = vi.fn()) {
  const utils = render(WorkOrderDetailRoot, {
    global: {
      provide: {
        [DETAIL_TASK_KEY as symbol]: task,
        [DETAIL_CALLBACKS_KEY as symbol]: callbacks,
        [DETAIL_APP_KEY as symbol]: {},
        [DETAIL_MD_COMPONENT_KEY as symbol]: new Component(),
        [DETAIL_CLOSE_KEY as symbol]: close,
      },
    },
  });
  return { ...utils, task, callbacks, close };
}

type Container = ReturnType<typeof renderRoot>['container'];

// ---- query helpers --------------------------------------------------------

function propRowKeys(container: Container): string[] {
  return [...container.querySelectorAll('[data-prop]')].map((el) => el.getAttribute('data-prop') ?? '');
}
function row(container: Container, key: string): HTMLElement {
  return container.querySelector(`[data-prop="${key}"]`) as HTMLElement;
}
function select(scope: Element): HTMLSelectElement | null {
  return scope.querySelector('select');
}

interface FooterButton {
  label: string;
  variant: string;
  icon: string;
  side: 'left' | 'right';
  el: HTMLElement;
}
function footerButtons(container: Container): FooterButton[] {
  const footer = container.querySelector('.specorator-work-order-modal-footer') as HTMLElement;
  return [...footer.querySelectorAll('.specorator-work-order-modal-action')].map((btn) => {
    const variant =
      ['cta', 'ghost', 'danger'].find((v) => btn.classList.contains(`specorator-work-order-modal-action--${v}`)) ?? '';
    const label = btn.querySelector('.specorator-work-order-modal-action-label')?.textContent ?? '';
    const icon = btn.querySelector('.specorator-work-order-modal-action-icon')?.getAttribute('data-icon') ?? '';
    const side = btn.closest('.specorator-work-order-modal-footer-group--left') ? 'left' : 'right';
    return { label, variant, icon, side, el: btn as HTMLElement };
  });
}
function footerSummary(buttons: FooterButton[]): Array<[string, string]> {
  return buttons.map((b) => [b.label, b.variant]);
}

const CANONICAL_HANDOFF = [
  '## Summary',
  'Implemented the activity block.',
  '',
  '## Verification',
  'All gates pass.',
  '',
  '## Risks',
  'Migration risk on reload.',
  '',
  '## Next Action',
  'Review and merge.',
].join('\n');

// ---------------------------------------------------------------------------

describe('WorkOrderDetailRoot — shell', () => {
  it('renders the two-pane body (main + sidebar) plus a footer', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'));
    const body = container.querySelector('.specorator-work-order-modal-body');
    expect(body).toBeTruthy();
    expect(body!.querySelector('.specorator-work-order-modal-main')).toBeTruthy();
    expect(body!.querySelector('.specorator-work-order-modal-sidebar')).toBeTruthy();
    expect(container.querySelector('.specorator-work-order-modal-footer')).toBeTruthy();
  });

  it('renders the properties panel into the sidebar and the sections into main', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'));
    const sidebar = container.querySelector('.specorator-work-order-modal-sidebar')!;
    expect(sidebar.querySelector('.specorator-work-order-modal-properties')).toBeTruthy();
    const labels = [...container.querySelectorAll('.specorator-work-order-modal-main .specorator-work-order-modal-section-label')]
      .map((el) => el.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Objective', 'Acceptance criteria', 'Context', 'Constraints']));
  });
});

describe('WorkOrderDetailRoot — properties sidebar', () => {
  it('renders a Properties header', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    expect(container.querySelector('.specorator-work-order-modal-properties-head')?.textContent?.trim()).toBe('Properties');
  });

  it('renders editable rows in spec order (no Conversation without a link)', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    expect(propRowKeys(container)).toEqual([
      'status', 'agent', 'provider', 'model', 'loop', 'chain', 'priority', 'created', 'updated', 'attempts',
    ]);
  });

  it('colors the Status pill with the status-specific class + tooltip', () => {
    const { container } = renderRoot(makeTask('t', 'needs_approval'), richCallbacks());
    const pill = row(container, 'status').querySelector('.specorator-work-order-modal-status-pill')!;
    expect(pill.classList.contains('specorator-work-order-modal-status-pill--needs_approval')).toBe(true);
    expect(pill.getAttribute('title')).toBe('needs_approval');
  });

  it('renders the Agent row as a persona chip (avatar + select) in an editable state', async () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    // The avatar mounts one tick after render() (template-ref → watchEffect).
    await nextTick();
    const agentRow = row(container, 'agent');
    expect(agentRow.querySelector('.specorator-work-order-modal-chip')).toBeTruthy();
    expect(select(agentRow)).toBeTruthy();
    const avatar = agentRow.querySelector('.specorator-agent-avatar')!;
    expect(avatar.getAttribute('title')).toBe('Standard');
    // The Standard-only option is present.
    const optionLabels = [...select(agentRow)!.querySelectorAll('option')].map((o) => o.textContent);
    expect(optionLabels).toEqual(['Standard']);
  });

  it('persists an Agent selection through onSaveFields({ agent })', async () => {
    const onSaveFields = vi.fn();
    const task = makeTask('t', 'inbox');
    const { container } = renderRoot(task, richCallbacks({ onSaveFields }));
    const sel = select(row(container, 'agent'))!;
    await fireEvent.update(sel, 'standard');
    expect(onSaveFields).toHaveBeenCalledWith(task, { agent: 'standard' });
  });

  it('renders the Agent row as a static avatar + name (no chip) when running', async () => {
    const { container } = renderRoot(makeTask('t', 'running'), richCallbacks());
    await nextTick();
    const agentRow = row(container, 'agent');
    expect(agentRow.querySelector('.specorator-work-order-modal-chip')).toBeFalsy();
    expect(select(agentRow)).toBeFalsy();
    expect(agentRow.querySelector('.specorator-agent-avatar')).toBeTruthy();
    expect(agentRow.querySelector('.specorator-work-order-modal-agent-name')?.textContent).toBe('Standard');
  });

  it('renders Provider/Model/Priority as editable chips (inbox)', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    for (const key of ['provider', 'model', 'priority']) {
      expect(row(container, key).querySelector('.specorator-work-order-modal-chip')).toBeTruthy();
      expect(select(row(container, key))).toBeTruthy();
    }
  });

  it('renders read-only Provider (mono) + priority bars when running', () => {
    const task = makeTask('t', 'running', {}, { provider: 'codex', model: 'gpt-5', priority: '1 - high' });
    const { container } = renderRoot(task, richCallbacks());
    expect(container.querySelector('.specorator-work-order-modal-chip')).toBeFalsy();
    expect(row(container, 'provider').querySelector('.specorator-work-order-modal-mono')).toBeTruthy();
    const priorityRow = row(container, 'priority');
    expect(priorityRow.querySelector('.specorator-work-order-modal-priority-bars')).toBeTruthy();
    expect(priorityRow.querySelector('.specorator-work-order-modal-priority--1')).toBeTruthy();
  });

  it('persists a Provider change and resets Model to provider default', async () => {
    const onSaveFields = vi.fn();
    const task = makeTask('t', 'inbox', {}, { provider: 'claude', model: 'opus' });
    const { container } = renderRoot(task, richCallbacks({ onSaveFields }));
    const providerSel = select(row(container, 'provider'))!;
    await fireEvent.update(providerSel, 'codex');
    expect(onSaveFields).toHaveBeenCalledWith(task, { provider: 'codex', model: '' });
    // Model chip repopulated for the new provider + reset to the empty default.
    const modelSel = select(row(container, 'model'))!;
    expect(modelSel.value).toBe('');
    const modelOptions = [...modelSel.querySelectorAll('option')].map((o) => o.textContent);
    expect(modelOptions).toEqual(['Provider default', 'gpt-5']);
  });

  it('persists a Model change through onSaveFields', async () => {
    const onSaveFields = vi.fn();
    const task = makeTask('t', 'inbox', {}, { provider: 'codex' });
    const { container } = renderRoot(task, richCallbacks({ onSaveFields }));
    await fireEvent.update(select(row(container, 'model'))!, 'gpt-5');
    expect(onSaveFields).toHaveBeenCalledWith(task, { model: 'gpt-5' });
  });

  it('persists a Priority change through onSaveFields', async () => {
    const onSaveFields = vi.fn();
    const task = makeTask('t', 'inbox');
    const { container } = renderRoot(task, richCallbacks({ onSaveFields }));
    await fireEvent.update(select(row(container, 'priority'))!, '0 - urgent');
    expect(onSaveFields).toHaveBeenCalledWith(task, { priority: '0 - urgent' });
  });

  it('updates the visible chip label after a selection (no stale value)', async () => {
    const task = makeTask('t', 'inbox', {}, { priority: '2 - normal' });
    const { container } = renderRoot(task, richCallbacks());
    const priorityRow = row(container, 'priority');
    expect(priorityRow.querySelector('.specorator-work-order-modal-chip-label')?.textContent).toBe('2 - normal');
    await fireEvent.update(select(priorityRow)!, '0 - urgent');
    expect(priorityRow.querySelector('.specorator-work-order-modal-chip-label')?.textContent).toBe('0 - urgent');
  });

  it('updates the loop chip label in place after the picker resolves', async () => {
    const task = makeTask('t', 'inbox');
    const onPickLoop = vi.fn().mockResolvedValue('repro');
    const { container } = renderRoot(task, richCallbacks({
      onPickLoop,
      getLoopName: (id) => (id === 'repro' ? 'Repro loop' : undefined),
    }));
    const loopChip = row(container, 'loop').querySelector('.specorator-work-order-modal-chip--loop') as HTMLElement;
    expect(row(container, 'loop').querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('No loop');
    await fireEvent.click(loopChip);
    await nextTick();
    expect(onPickLoop).toHaveBeenCalledWith(task);
    expect(row(container, 'loop').querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('Repro loop');
    expect(task.frontmatter.loop).toBe('repro');
  });

  it('resets the loop chip to "No loop" when the picker detaches the loop', async () => {
    const task = makeTask('t', 'inbox', {}, { loop: 'repro' });
    const { container } = renderRoot(task, richCallbacks({
      onPickLoop: vi.fn().mockResolvedValue(''),
      getLoopName: (id) => (id === 'repro' ? 'Repro loop' : undefined),
    }));
    const loopChip = row(container, 'loop').querySelector('.specorator-work-order-modal-chip--loop') as HTMLElement;
    expect(row(container, 'loop').querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('Repro loop');
    await fireEvent.click(loopChip);
    await nextTick();
    expect(row(container, 'loop').querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('No loop');
    expect(task.frontmatter.loop).toBeUndefined();
  });

  it('renders the Next step chip with the configured summary and updates it in place after configuring', async () => {
    const task = makeTask('t', 'inbox');
    const onConfigureChain = vi.fn().mockResolvedValue('Implement stage');
    const { container } = renderRoot(task, richCallbacks({
      onConfigureChain,
      getChainSummary: () => 'None',
    }));
    const chainRow = row(container, 'chain');
    const chip = chainRow.querySelector('.specorator-work-order-modal-chip--chain') as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chainRow.querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('None');
    await fireEvent.click(chip);
    await nextTick();
    expect(onConfigureChain).toHaveBeenCalledWith(task);
    expect(chainRow.querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('Implement stage');
  });

  it('leaves the Next step label untouched when configuring is cancelled', async () => {
    const task = makeTask('t', 'inbox');
    const onConfigureChain = vi.fn().mockResolvedValue(undefined);
    const { container } = renderRoot(task, richCallbacks({ onConfigureChain, getChainSummary: () => 'None' }));
    const chainRow = row(container, 'chain');
    await fireEvent.click(chainRow.querySelector('.specorator-work-order-modal-chip--chain') as HTMLElement);
    await nextTick();
    expect(chainRow.querySelector('.specorator-work-order-modal-chip-value')?.textContent).toBe('None');
  });

  it('renders the Next step value as static text (not a button) when onConfigureChain is absent', () => {
    const task = makeTask('t', 'inbox');
    const { container } = renderRoot(task, richCallbacks({ getChainSummary: () => 'Custom summary' }));
    const chainRow = row(container, 'chain');
    expect(chainRow.querySelector('.specorator-work-order-modal-chip--chain')).toBeFalsy();
    expect(chainRow.textContent).toContain('Custom summary');
  });

  it('defaults the Next step chip to "None" when no chain callbacks are wired', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), makeCallbacks());
    expect(row(container, 'chain').textContent).toContain('None');
  });

  it('marks Created/Updated/Attempts values with the tabular-nums class', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    for (const key of ['created', 'updated', 'attempts']) {
      expect(row(container, key).querySelector('.specorator-work-order-modal-prop-num')).toBeTruthy();
    }
  });

  it('hides the Conversation row without a conversation id', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'), richCallbacks());
    expect(container.querySelector('[data-prop="conversation"]')).toBeFalsy();
  });

  it('hides the Conversation row when canOpenConversation returns false', () => {
    const task = makeTask('t', 'inbox', {}, { conversation_id: 'conv-1' });
    const { container } = renderRoot(task, richCallbacks({ onOpenConversation: vi.fn(), canOpenConversation: () => false }));
    expect(container.querySelector('[data-prop="conversation"]')).toBeFalsy();
  });

  it('shows the Conversation row and invokes onOpenConversation on click', async () => {
    const onOpenConversation = vi.fn();
    const task = makeTask('t', 'inbox', {}, { conversation_id: 'conv-1' });
    const { container } = renderRoot(task, richCallbacks({ onOpenConversation, canOpenConversation: () => true }));
    const link = row(container, 'conversation').querySelector('.specorator-work-order-modal-prop-link') as HTMLElement;
    expect(link).toBeTruthy();
    await fireEvent.click(link);
    expect(onOpenConversation).toHaveBeenCalledWith(task);
  });
});

describe('WorkOrderDetailRoot — main pane (acceptance ring + checklist)', () => {
  it('renders the progress ring + count when the checklist has items', () => {
    const { container } = renderRoot(makeTask('t', 'inbox', { acceptanceCriteria: '- [x] a\n- [ ] b' }));
    expect(container.querySelector('.specorator-work-order-modal-ring')).toBeTruthy();
    expect(container.querySelector('.specorator-work-order-modal-ring-count')?.textContent?.trim()).toBe('1/2');
  });

  it('renders a read-only checklist (role=checkbox + aria-checked) for a pure task-list', () => {
    const { container } = renderRoot(makeTask('t', 'inbox', { acceptanceCriteria: '- [x] a\n- [ ] b' }));
    const items = [...container.querySelectorAll('.specorator-work-order-modal-checklist-item')];
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('role')).toBe('checkbox');
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
  });
});

describe('WorkOrderDetailRoot — activity (Agent handoff)', () => {
  function cards(container: Container) {
    return [...container.querySelectorAll('.specorator-work-order-modal-collapse')];
  }

  it('renders the Agent handoff header (clipboard-check) + 4 ordered cards on review', () => {
    const { container } = renderRoot(makeTask('t', 'review', { handoff: CANONICAL_HANDOFF }));
    const icons = [...container.querySelectorAll('.specorator-work-order-modal-section-icon')]
      .map((el) => el.getAttribute('data-icon'));
    expect(icons).toContain('clipboard-check');
    const titles = cards(container).map((c) => c.querySelector('.specorator-work-order-modal-collapse-title')?.textContent);
    expect(titles).toEqual(['Summary', 'Verification', 'Risks', 'Next action']);
  });

  it('defaults Summary + Next action open; Verification + Risks closed', () => {
    const { container } = renderRoot(makeTask('t', 'review', { handoff: CANONICAL_HANDOFF }));
    const [summary, verification, risks, nextAction] = cards(container);
    const expanded = (c: Element) => c.querySelector('.specorator-work-order-modal-collapse-head')?.getAttribute('aria-expanded');
    expect(expanded(summary)).toBe('true');
    expect(expanded(verification)).toBe('false');
    expect(expanded(risks)).toBe('false');
    expect(expanded(nextAction)).toBe('true');
    expect(summary.classList.contains('is-open')).toBe(true);
    expect(summary.querySelector('.specorator-work-order-modal-collapse-body')).toBeTruthy();
    expect(verification.querySelector('.specorator-work-order-modal-collapse-body')).toBeFalsy();
  });

  it('keys each card off a per-section modifier class', () => {
    const { container } = renderRoot(makeTask('t', 'review', { handoff: CANONICAL_HANDOFF }));
    const [summary, verification, risks, nextAction] = cards(container);
    expect(summary.classList.contains('specorator-work-order-modal-collapse--summary')).toBe(true);
    expect(verification.classList.contains('specorator-work-order-modal-collapse--verification')).toBe(true);
    expect(risks.classList.contains('specorator-work-order-modal-collapse--risks')).toBe(true);
    expect(nextAction.classList.contains('specorator-work-order-modal-collapse--next')).toBe(true);
  });

  it('toggles a closed card open on click', async () => {
    const { container } = renderRoot(makeTask('t', 'review', { handoff: CANONICAL_HANDOFF }));
    const verification = cards(container)[1];
    const head = verification.querySelector('.specorator-work-order-modal-collapse-head') as HTMLElement;
    expect(head.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(verification.querySelector('.specorator-work-order-modal-collapse-body')).toBeTruthy();
  });

  it('shows the Agent handoff on needs_fix with content, not when empty, not on inbox', () => {
    const withContent = renderRoot(makeTask('a', 'needs_fix', { handoff: CANONICAL_HANDOFF }));
    expect(withContent.container.querySelector('.specorator-work-order-modal-collapse')).toBeTruthy();
    const empty = renderRoot(makeTask('b', 'needs_fix', { handoff: '' }));
    expect(empty.container.querySelector('.specorator-work-order-modal-collapse')).toBeFalsy();
    const inbox = renderRoot(makeTask('c', 'inbox', { handoff: CANONICAL_HANDOFF }));
    expect(inbox.container.querySelector('.specorator-work-order-modal-collapse')).toBeFalsy();
  });

  it('falls back to full markdown when the handoff parses into no known section', () => {
    const { container } = renderRoot(makeTask('t', 'review', { handoff: 'Totally freeform, no headings.' }));
    expect(container.querySelectorAll('.specorator-work-order-modal-collapse')).toHaveLength(0);
    expect(container.querySelector('.specorator-work-order-modal-handoff-fallback')).toBeTruthy();
  });
});

describe('WorkOrderDetailRoot — activity (salvage + ledger)', () => {
  it('renders the needs_handoff salvage callout + transcript tail', () => {
    const { container } = renderRoot(
      makeTask('t', 'needs_handoff', { ledger: '- 2026-06-04T00:00:00Z [running] doing the work' }),
    );
    expect(container.querySelector('.specorator-work-order-modal-salvage-callout')).toBeTruthy();
    const tail = container.querySelector('.specorator-work-order-modal-tail-body');
    expect(tail?.textContent).toContain('doing the work');
  });

  it('shows an empty transcript tail when there is no ledger trace', () => {
    const { container } = renderRoot(makeTask('t', 'needs_handoff', { ledger: '' }));
    const tail = container.querySelector('.specorator-work-order-modal-tail-body');
    expect((tail?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('renders the failed Run ledger (one entry per parsed line, dot per status)', () => {
    const ledger = [
      '- 2026-06-04T00:00:00Z [running] started the run',
      '- 2026-06-04T00:05:00Z [failed] hit an error',
    ].join('\n');
    const { container } = renderRoot(makeTask('t', 'failed', { ledger }));
    const entries = [...container.querySelectorAll('.specorator-work-order-modal-ledger-entry')];
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.querySelector('.specorator-work-order-modal-ledger-time')?.textContent))
      .toEqual(['2026-06-04T00:00:00Z', '2026-06-04T00:05:00Z']);
    expect(entries[0].querySelector('.specorator-work-order-modal-ledger-dot--running')).toBeTruthy();
    expect(entries[1].querySelector('.specorator-work-order-modal-ledger-dot--failed')).toBeTruthy();
  });

  it('tolerates malformed ledger lines (renders only the well-formed entries)', () => {
    const { container } = renderRoot(
      makeTask('t', 'failed', { ledger: ['garbage', '- 2026-06-04T00:00:00Z [done] ok'].join('\n') }),
    );
    const entries = [...container.querySelectorAll('.specorator-work-order-modal-ledger-entry')];
    expect(entries).toHaveLength(1);
    expect(entries[0].querySelector('.specorator-work-order-modal-ledger-msg')?.textContent).toBe('ok');
  });

  it('renders no activity for running or done', () => {
    const running = renderRoot(makeTask('a', 'running', { ledger: '- 2026-06-04T00:00:00Z [running] x' }));
    expect(running.container.querySelector('.specorator-work-order-modal-collapse')).toBeFalsy();
    expect(running.container.querySelector('.specorator-work-order-modal-ledger')).toBeFalsy();
    const done = renderRoot(makeTask('b', 'done', { handoff: CANONICAL_HANDOFF }));
    expect(done.container.querySelector('.specorator-work-order-modal-collapse')).toBeFalsy();
  });
});

describe('WorkOrderDetailRoot — footer action sets', () => {
  function convTask(status: TaskStatus): TaskSpec {
    return makeTask('t', status, { handoff: 'Handoff text.', ledger: 'x' }, { conversation_id: 'conv-1' });
  }
  const convCallbacks = () => makeCallbacks({ onOpenConversation: vi.fn(), canOpenConversation: () => true });

  it('inbox: Open note + Edit (ghost) left, Mark ready (cta) right', () => {
    const { container } = renderRoot(makeTask('t', 'inbox'));
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Edit', 'ghost'], ['Mark ready', 'cta'],
    ]);
    const edit = footerButtons(container).find((b) => b.label === 'Edit')!;
    expect(edit.side).toBe('left');
    expect(edit.icon).toBe('pencil');
    expect(footerButtons(container).find((b) => b.label === 'Mark ready')!.side).toBe('right');
  });

  it('running: Open note + Open conversation left, Stop (danger) right', () => {
    const { container } = renderRoot(convTask('running'), convCallbacks());
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Open conversation', 'ghost'], ['Stop', 'danger'],
    ]);
    expect(footerButtons(container).filter((b) => b.side === 'right')).toHaveLength(1);
  });

  it('review: Rework (ghost) + Accept (cta) right', () => {
    const { container } = renderRoot(convTask('review'), convCallbacks());
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Open conversation', 'ghost'], ['Rework', 'ghost'], ['Accept', 'cta'],
    ]);
  });

  it('needs_handoff: Mark failed (danger) + Send to review (cta) right', () => {
    const { container } = renderRoot(convTask('needs_handoff'), convCallbacks());
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Open conversation', 'ghost'], ['Mark failed', 'danger'], ['Send to review', 'cta'],
    ]);
  });

  it('done: Open note + Archive left, Reopen right', () => {
    const { container } = renderRoot(makeTask('t', 'done'));
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Archive', 'ghost'], ['Reopen', 'ghost'],
    ]);
    expect(footerButtons(container).find((b) => b.label === 'Reopen')!.side).toBe('right');
  });

  it('failed: Open note left, Archive right', () => {
    const { container } = renderRoot(makeTask('t', 'failed'));
    const buttons = footerButtons(container);
    expect(footerSummary(buttons)).toEqual([['Open note', 'ghost'], ['Archive', 'ghost']]);
    expect(buttons.find((b) => b.label === 'Archive')!.side).toBe('right');
  });

  it('ready: Open note + Edit, no right-side primary (Run is a board action)', () => {
    const { container } = renderRoot(makeTask('t', 'ready'));
    const buttons = footerButtons(container);
    expect(footerSummary(buttons)).toEqual([['Open note', 'ghost'], ['Edit', 'ghost']]);
    expect(buttons.some((b) => b.label === 'Run')).toBe(false);
    expect(buttons.filter((b) => b.side === 'right')).toHaveLength(0);
  });

  it('needs_fix: Open note + Open conversation + Edit, no right-side primary', () => {
    const { container } = renderRoot(convTask('needs_fix'), convCallbacks());
    expect(footerSummary(footerButtons(container))).toEqual([
      ['Open note', 'ghost'], ['Open conversation', 'ghost'], ['Edit', 'ghost'],
    ]);
  });

  it('canceled: Open note left, Archive right', () => {
    const { container } = renderRoot(makeTask('t', 'canceled'));
    expect(footerSummary(footerButtons(container))).toEqual([['Open note', 'ghost'], ['Archive', 'ghost']]);
  });

  it('closes the modal then runs a status action (close-on-click)', async () => {
    const onOpenNote = vi.fn();
    const close = vi.fn();
    const { container } = renderRoot(makeTask('t', 'inbox'), makeCallbacks({ onOpenNote }), close);
    const openNote = footerButtons(container).find((b) => b.label === 'Open note')!;
    await fireEvent.click(openNote.el);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledTimes(1);
  });
});

describe('WorkOrderDetailRoot — inline edit toggle', () => {
  it('Edit swaps the main pane for the edit form (4 textareas) and suppresses the right primary', async () => {
    const { container } = renderRoot(makeTask('t', 'inbox'));
    // View mode: no textareas, Mark ready present on the right.
    expect(container.querySelectorAll('.specorator-work-order-modal-edit-textarea')).toHaveLength(0);
    const editBtn = footerButtons(container).find((b) => b.label === 'Edit')!;
    await fireEvent.click(editBtn.el);
    expect(container.querySelectorAll('.specorator-work-order-modal-edit-textarea')).toHaveLength(4);
    // Editing: Cancel + Save present; the status right-primary (Mark ready) is gone.
    const labels = footerButtons(container).map((b) => b.label);
    expect(labels).toContain('Cancel');
    expect(labels).toContain('Save');
    expect(labels).not.toContain('Mark ready');
    expect(footerButtons(container).filter((b) => b.side === 'right')).toHaveLength(0);
  });

  it('Save collects the textareas → onSaveSections, then returns to view mode', async () => {
    const onSaveSections = vi.fn();
    const task = makeTask('t', 'inbox', {
      objective: 'Obj', acceptanceCriteria: 'Acc', context: 'Ctx', constraints: 'Con',
    });
    const { container } = renderRoot(task, makeCallbacks({ onSaveSections }));
    await fireEvent.click(footerButtons(container).find((b) => b.label === 'Edit')!.el);
    const textareas = [...container.querySelectorAll('.specorator-work-order-modal-edit-textarea')] as HTMLTextAreaElement[];
    await fireEvent.update(textareas[0], 'New objective');
    await fireEvent.click(footerButtons(container).find((b) => b.label === 'Save')!.el);
    expect(onSaveSections).toHaveBeenCalledWith(task, {
      objective: 'New objective', acceptanceCriteria: 'Acc', context: 'Ctx', constraints: 'Con',
    });
    await nextTick();
    // Back to view mode.
    expect(container.querySelectorAll('.specorator-work-order-modal-edit-textarea')).toHaveLength(0);
  });

  it('Cancel leaves edit mode without persisting', async () => {
    const onSaveSections = vi.fn();
    const { container } = renderRoot(makeTask('t', 'inbox'), makeCallbacks({ onSaveSections }));
    await fireEvent.click(footerButtons(container).find((b) => b.label === 'Edit')!.el);
    await fireEvent.click(footerButtons(container).find((b) => b.label === 'Cancel')!.el);
    expect(onSaveSections).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.specorator-work-order-modal-edit-textarea')).toHaveLength(0);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
