import { fireEvent, render, waitFor } from '@testing-library/vue';
import { Notice } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

// ProviderRegistry drives providerOptionList / modelOptionList. Codex exposes a
// single model, Claude two — so a provider change is observable in the model
// select's option set.
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getRegisteredProviderIds: vi.fn().mockReturnValue(['claude', 'codex']),
    isEnabled: vi.fn().mockReturnValue(true),
    getChatUIConfig: vi.fn((providerId: string) => ({
      getModelOptions: vi.fn().mockReturnValue(
        providerId === 'codex'
          ? [{ value: 'gpt-5', label: 'GPT-5' }]
          : [
              { value: 'claude-opus-4', label: 'Claude Opus 4' },
              { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
            ],
      ),
    })),
  },
}));

// LoopNoteStore.list feeds the async loop select.
const { loopListSpy } = vi.hoisted(() => ({ loopListSpy: vi.fn() }));
vi.mock('@/features/tasks/loops/LoopNoteStore', () => ({
  // Function expression: tinyspy constructs the implementation with `new`.
  LoopNoteStore: vi.fn(function () {
    return { list: loopListSpy };
  }),
}));

import type { WorkOrderTemplate } from '@/features/tasks/templates/templateTypes';
import {
  TEMPLATE_EDITOR_CLOSE_KEY,
  TEMPLATE_EDITOR_EXISTING_KEY,
  TEMPLATE_EDITOR_PLUGIN_KEY,
  TEMPLATE_EDITOR_SAVE_KEY,
} from '@/features/tasks/ui/vue/templateEditorKeys';
import WorkOrderTemplateEditorRoot from '@/features/tasks/ui/vue/WorkOrderTemplateEditorRoot.vue';
import { LucideIconPicker } from '@/shared/components/LucideIconPicker';

// ---- fixtures -------------------------------------------------------------

interface FakeAgent {
  id: string;
  name: string;
}

function makePlugin(agents: FakeAgent[] = []) {
  return {
    settings: { agentBoardLoopFolder: 'Agent Board/loops' },
    app: { vault: {} },
    agentRosterStore: { list: vi.fn().mockResolvedValue(agents) },
  } as never;
}

function makeExistingTemplate(overrides: Partial<WorkOrderTemplate> = {}): WorkOrderTemplate {
  return {
    path: 'Agent Board/templates/bug-fix.md',
    name: 'bug-fix',
    description: 'Fix a bug',
    icon: 'bug',
    provider: 'claude',
    model: 'claude-sonnet-4',
    priority: '1 - high',
    loop: 'my-loop',
    body: '# {{title}}\n\n## Objective\n\nFix the bug.',
    ...overrides,
  };
}

function renderRoot(
  existing: WorkOrderTemplate | null,
  {
    onSave = vi.fn().mockResolvedValue(undefined),
    close = vi.fn(),
    plugin = makePlugin(),
  }: { onSave?: ReturnType<typeof vi.fn>; close?: ReturnType<typeof vi.fn>; plugin?: never } = {},
) {
  const utils = render(WorkOrderTemplateEditorRoot, {
    global: {
      provide: {
        [TEMPLATE_EDITOR_PLUGIN_KEY as symbol]: plugin,
        [TEMPLATE_EDITOR_EXISTING_KEY as symbol]: existing,
        [TEMPLATE_EDITOR_SAVE_KEY as symbol]: onSave,
        [TEMPLATE_EDITOR_CLOSE_KEY as symbol]: close,
      },
    },
  });
  return { ...utils, onSave, close, plugin };
}

type Container = ReturnType<typeof renderRoot>['container'];

function field<T extends HTMLElement = HTMLInputElement>(container: Container, name: string): T {
  return container.querySelector(`[data-field="${name}"]`) as T;
}
function action(container: Container, name: string): HTMLElement {
  return container.querySelector(`[data-action="${name}"]`) as HTMLElement;
}
function optionValues(select: HTMLSelectElement): string[] {
  return [...select.querySelectorAll('option')].map((o) => o.value);
}
function optionLabels(select: HTMLSelectElement): string[] {
  return [...select.querySelectorAll('option')].map((o) => (o.textContent ?? '').trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  loopListSpy.mockResolvedValue({ loops: [], warnings: [] });
});

// ---------------------------------------------------------------------------

describe('WorkOrderTemplateEditorRoot — create mode', () => {
  it('renders empty fields with an enabled name input', () => {
    const { container } = renderRoot(null);
    expect(field<HTMLInputElement>(container, 'name').value).toBe('');
    expect(field<HTMLInputElement>(container, 'name').disabled).toBe(false);
    expect(field<HTMLInputElement>(container, 'description').value).toBe('');
    // Provider/priority default to the "Use default" empty option.
    expect(field<HTMLSelectElement>(container, 'provider').value).toBe('');
    expect(field<HTMLSelectElement>(container, 'priority').value).toBe('');
    // Body seeds from the default skeleton, not empty.
    expect(field<HTMLTextAreaElement>(container, 'body').value).toContain('## Objective');
  });

  it('renders a 12-row body textarea with the imperative class', () => {
    const { container } = renderRoot(null);
    const body = field<HTMLTextAreaElement>(container, 'body');
    expect(body.rows).toBe(12);
    expect(body.classList.contains('specorator-wo-template-body-input')).toBe(true);
  });

  it('renders the provider option list (empty default + enabled provider ids)', () => {
    const { container } = renderRoot(null);
    expect(optionValues(field<HTMLSelectElement>(container, 'provider'))).toEqual(['', 'claude', 'codex']);
  });

  it('renders the priority option list with a "Use default" empty option', () => {
    const { container } = renderRoot(null);
    const priority = field<HTMLSelectElement>(container, 'priority');
    expect(optionValues(priority)).toEqual(['', '0 - urgent', '1 - high', '2 - normal', '3 - low']);
    expect(optionLabels(priority)[0]).toBe('Use default');
  });

  it('renders save + cancel affordances', () => {
    const { container } = renderRoot(null);
    expect(action(container, 'save')).toBeTruthy();
    expect(action(container, 'save').classList.contains('mod-cta')).toBe(true);
    expect(action(container, 'cancel')).toBeTruthy();
  });
});

describe('WorkOrderTemplateEditorRoot — edit mode', () => {
  it('seeds every field from the existing template and disables the name', () => {
    const existing = makeExistingTemplate();
    const { container } = renderRoot(existing);
    const name = field<HTMLInputElement>(container, 'name');
    expect(name.value).toBe('bug-fix');
    expect(name.disabled).toBe(true);
    expect(field<HTMLInputElement>(container, 'description').value).toBe('Fix a bug');
    expect(field<HTMLSelectElement>(container, 'provider').value).toBe('claude');
    expect(field<HTMLSelectElement>(container, 'model').value).toBe('claude-sonnet-4');
    expect(field<HTMLSelectElement>(container, 'priority').value).toBe('1 - high');
    expect(field<HTMLTextAreaElement>(container, 'body').value).toBe(existing.body);
  });
});

describe('WorkOrderTemplateEditorRoot — provider → model reset', () => {
  it('resets the model and repopulates model options when the provider changes', async () => {
    const existing = makeExistingTemplate({ provider: 'claude', model: 'claude-opus-4' });
    const { container } = renderRoot(existing);
    const model = field<HTMLSelectElement>(container, 'model');
    expect(model.value).toBe('claude-opus-4');

    await fireEvent.update(field<HTMLSelectElement>(container, 'provider'), 'codex');
    await nextTick();

    // Model reset to the provider default + option set now reflects codex.
    expect(model.value).toBe('');
    expect(optionValues(model)).toEqual(['', 'gpt-5']);
  });
});

describe('WorkOrderTemplateEditorRoot — async loop/agent options', () => {
  it('populates the loop select from LoopNoteStore.list after mount', async () => {
    loopListSpy.mockResolvedValue({
      loops: [{ id: 'my-loop', name: 'My Loop' }],
      warnings: [],
    });
    const { container } = renderRoot(null);
    const loop = field<HTMLSelectElement>(container, 'loop');
    // Static empty "No loop" option first, then the discovered loop.
    await waitFor(() => expect(optionLabels(loop)).toEqual(['No loop', 'My Loop']));
    expect(optionValues(loop)).toEqual(['', 'my-loop']);
  });

  it('populates the agent select from the roster and preserves an unknown stored id', async () => {
    const existing = makeExistingTemplate({ agent: 'roster:ghost' });
    const { container } = renderRoot(existing, {
      plugin: makePlugin([{ id: 'roster:debugger', name: 'Debugger' }]),
    });
    const agent = field<HTMLSelectElement>(container, 'agent');
    // Empty "Use default" + roster agent + the preserved unknown stored id.
    await waitFor(() =>
      expect(optionValues(agent)).toEqual(['', 'roster:debugger', 'roster:ghost']),
    );
    expect(agent.value).toBe('roster:ghost');
  });
});

describe('WorkOrderTemplateEditorRoot — icon picker lifecycle', () => {
  it('destroys the LucideIconPicker on unmount (no listener leak)', () => {
    const destroy = vi.spyOn(LucideIconPicker.prototype, 'destroy');
    const { unmount } = renderRoot(null);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    destroy.mockRestore();
  });
});

describe('WorkOrderTemplateEditorRoot — save validation', () => {
  it('shows a Notice and does not call onSave when the name is empty', async () => {
    const { container, onSave } = renderRoot(null);
    // Body seeds non-empty; name is empty in create mode.
    await fireEvent.click(action(container, 'save'));
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a Notice and does not call onSave when the body is empty', async () => {
    const { container, onSave } = renderRoot(null);
    await fireEvent.update(field<HTMLInputElement>(container, 'name'), 'My Template');
    await fireEvent.update(field<HTMLTextAreaElement>(container, 'body'), '   ');
    await fireEvent.click(action(container, 'save'));
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('WorkOrderTemplateEditorRoot — save payload', () => {
  it('builds the payload from a new template and closes after onSave', async () => {
    const { container, onSave, close } = renderRoot(null);
    await fireEvent.update(field<HTMLInputElement>(container, 'name'), '  My Template  ');
    await fireEvent.update(field<HTMLInputElement>(container, 'description'), 'A desc');
    await fireEvent.update(field<HTMLTextAreaElement>(container, 'body'), '# Body');
    await fireEvent.click(action(container, 'save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'My Template',
      description: 'A desc',
      icon: undefined,
      provider: undefined,
      model: undefined,
      priority: undefined,
      loop: undefined,
      agent: undefined,
      body: '# Body',
      originalPath: undefined,
    });
    await nextTick();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('carries every seeded field + originalPath when editing', async () => {
    const existing = makeExistingTemplate({ agent: 'roster:debugger' });
    const { container, onSave } = renderRoot(existing, {
      plugin: makePlugin([{ id: 'roster:debugger', name: 'Debugger' }]),
    });
    // Let the agent select populate so the seeded id round-trips.
    await nextTick();
    await nextTick();
    await fireEvent.click(action(container, 'save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({
      name: 'bug-fix',
      description: 'Fix a bug',
      icon: 'bug',
      provider: 'claude',
      model: 'claude-sonnet-4',
      priority: '1 - high',
      loop: 'my-loop',
      agent: 'roster:debugger',
      body: existing.body,
      originalPath: 'Agent Board/templates/bug-fix.md',
    });
  });

  it('shows a Notice and does not rethrow when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('disk full'));
    const { container, close } = renderRoot(null, { onSave });
    await fireEvent.update(field<HTMLInputElement>(container, 'name'), 'Valid');
    await fireEvent.click(action(container, 'save'));
    await nextTick();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledTimes(1);
    expect((Notice as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toContain('disk full');
    // A failed save keeps the modal open.
    expect(close).not.toHaveBeenCalled();
  });

  it('cancel closes without invoking onSave', async () => {
    const { container, onSave, close } = renderRoot(null);
    await fireEvent.click(action(container, 'cancel'));
    expect(onSave).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
