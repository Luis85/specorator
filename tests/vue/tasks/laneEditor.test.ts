import { fireEvent, render, waitFor } from '@testing-library/vue';
import { Notice } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { BoardConfig } from '@/features/tasks/config/boardConfigTypes';
import { DEFAULT_BOARD_CONFIG } from '@/features/tasks/config/boardConfigTypes';
import { TASK_STATUSES } from '@/features/tasks/model/taskStateMachine';
import { renderAgentBoardLaneEditor } from '@/features/tasks/ui/AgentBoardLaneEditor';
import { LANE_EDITOR_PLUGIN_KEY } from '@/features/tasks/ui/vue/laneEditorKeys';
import LaneEditorRoot from '@/features/tasks/ui/vue/LaneEditorRoot.vue';

// ---- fixtures -------------------------------------------------------------

interface LaneSeed {
  id: string;
  title: string;
  statuses: string[];
  visible?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  definitionOfReady?: string[];
  definitionOfDone?: string[];
}

function makePlugin(lanes: LaneSeed[]): {
  plugin: any;
  save: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  const save = vi.fn().mockResolvedValue(undefined);
  const emit = vi.fn();
  const config: BoardConfig = {
    schemaVersion: 1,
    lanes: lanes.map((lane) => ({
      id: lane.id,
      title: lane.title,
      statuses: lane.statuses as BoardConfig['lanes'][number]['statuses'],
      visible: lane.visible ?? true,
      definitionOfReady: lane.definitionOfReady ?? [],
      definitionOfDone: lane.definitionOfDone ?? [],
      collapsible: lane.collapsible ?? false,
      collapsed: lane.collapsed ?? false,
    })),
  };
  const plugin = {
    settings: { agentBoardConfig: config },
    saveSettings: save,
    events: { emit },
  };
  return { plugin, save, emit };
}

function renderEditor(lanes: LaneSeed[]) {
  const { plugin, save, emit } = makePlugin(lanes);
  const utils = render(LaneEditorRoot, {
    global: { provide: { [LANE_EDITOR_PLUGIN_KEY as symbol]: plugin } },
  });
  return { ...utils, plugin, save, emit };
}

type Container = ReturnType<typeof renderEditor>['container'];

function laneBlocks(container: Container): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.specorator-lane-editor-lane')];
}

function statusCheckbox(lane: HTMLElement, status: string): HTMLInputElement {
  const labels = [...lane.querySelectorAll<HTMLElement>('.specorator-lane-editor-status')];
  for (const label of labels) {
    const matches = [...label.querySelectorAll('span')].some(
      (span) => span.textContent?.trim() === status,
    );
    if (matches) return label.querySelector('input') as HTMLInputElement;
  }
  throw new Error(`status checkbox ${status} not found`);
}

function storedLanes(plugin: any): BoardConfig['lanes'] {
  return (plugin.settings.agentBoardConfig as BoardConfig).lanes;
}

beforeEach(() => {
  (Notice as unknown as ReturnType<typeof vi.fn>).mockClear();
});

// ---- tests ----------------------------------------------------------------

describe('LaneEditorRoot', () => {
  it('renders one lane block per configured lane', () => {
    const { container } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
      { id: 'l2', title: 'Lane 2', statuses: ['running'] },
    ]);
    expect(laneBlocks(container)).toHaveLength(2);
  });

  it('persists a title edit: settings updated, saveSettings called, event emitted', async () => {
    const { container, plugin, save, emit } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
    ]);
    const input = laneBlocks(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!;
    await fireEvent.update(input, 'Renamed lane');

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)[0].title).toBe('Renamed lane');
    expect(emit).toHaveBeenCalledWith('task:board-config-changed');
  });

  it('toggles lane visibility', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'], visible: true },
    ]);
    const toggle = laneBlocks(container)[0].querySelector<HTMLElement>('.checkbox-container')!;
    await fireEvent.click(toggle);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)[0].visible).toBe(false);
  });

  it('reorders lanes with the move-up control', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'First', statuses: ['inbox'] },
      { id: 'l2', title: 'Second', statuses: ['running'] },
    ]);
    const up = laneBlocks(container)[1].querySelector<HTMLButtonElement>(
      'button[aria-label="Move up"]',
    )!;
    await fireEvent.click(up);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin).map((lane) => lane.id)).toEqual(['l2', 'l1']);
  });

  it('removes a lane', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'First', statuses: ['inbox'] },
      { id: 'l2', title: 'Second', statuses: ['running'] },
    ]);
    const remove = laneBlocks(container)[0].querySelector<HTMLButtonElement>(
      'button[aria-label="Remove lane"]',
    )!;
    await fireEvent.click(remove);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin).map((lane) => lane.id)).toEqual(['l2']);
  });

  it('clears collapsed when Collapsible is turned off', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'], collapsible: true, collapsed: true },
    ]);
    const checkbox = laneBlocks(container)[0].querySelector<HTMLInputElement>(
      '.specorator-lane-editor-collapsible input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    await fireEvent.change(checkbox);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)[0].collapsible).toBe(false);
    expect(storedLanes(plugin)[0].collapsed).toBe(false);
  });

  it('toggles a status and reactively surfaces the duplicate-owner hint', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Ready lane', statuses: ['ready'] },
      { id: 'l2', title: 'Combo lane', statuses: ['needs_input'] },
    ]);
    // No duplicate before the second lane also claims `ready`.
    expect(
      container.querySelectorAll('.specorator-lane-editor-status--duplicate'),
    ).toHaveLength(0);

    const lane2 = laneBlocks(container)[1];
    const readyBox = statusCheckbox(lane2, 'ready');
    readyBox.checked = true;
    await fireEvent.change(readyBox);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)[1].statuses).toEqual(['needs_input', 'ready']);

    await nextTick();
    const duplicate = laneBlocks(container)[1].querySelector(
      '.specorator-lane-editor-status--duplicate',
    );
    expect(duplicate).not.toBeNull();
    const hint = laneBlocks(container)[1].querySelector('.specorator-lane-editor-status-hint');
    expect(hint).not.toBeNull();
    expect(hint!.getAttribute('role')).toBe('note');
    expect(hint!.textContent).toContain('Ready lane');
  });

  it('splits, trims, and filters the Definition-of-ready textarea into an array', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
    ]);
    // The first textarea is Definition of ready, the second Definition of done.
    const textarea = laneBlocks(container)[0].querySelector<HTMLTextAreaElement>('textarea')!;
    await fireEvent.update(textarea, '  first  \n\n  second  \n');

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)[0].definitionOfReady).toEqual(['first', 'second']);
  });

  it('appends a lane with Add lane', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
    ]);
    const add = container.querySelector<HTMLButtonElement>('button[data-action="add-lane"]')!;
    await fireEvent.click(add);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)).toHaveLength(2);
    expect(storedLanes(plugin)[1].title).toBe('New lane');
  });

  it('resets the board to DEFAULT_BOARD_CONFIG', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Only lane', statuses: ['ready'] },
    ]);
    const reset = container.querySelector<HTMLButtonElement>('button[data-action="reset-default"]')!;
    await fireEvent.click(reset);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(storedLanes(plugin)).toHaveLength(TASK_STATUSES.length);
    expect(storedLanes(plugin).map((lane) => lane.statuses)).toEqual(
      DEFAULT_BOARD_CONFIG.lanes.map((lane) => lane.statuses),
    );
  });

  it('rolls back the config and surfaces a Notice when saveSettings rejects', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
      { id: 'l2', title: 'Lane 2', statuses: ['needs_input'] },
    ]);
    save.mockRejectedValueOnce(new Error('disk full'));

    const box = statusCheckbox(laneBlocks(container)[1], 'ready');
    box.checked = true;
    await fireEvent.change(box);

    await waitFor(() =>
      expect((Notice as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled(),
    );
    // Persistence failed → the stored config must reflect the pre-mutation snapshot.
    expect(storedLanes(plugin)[1].statuses).toEqual(['needs_input']);
    expect((Notice as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('disk full');
  });
});

describe('LaneEditorRoot — queue preservation', () => {
  // The lane editor owns lanes only; queue.paused is toggled from the Agent
  // Board and can change while the settings pane is open. persist() re-reads the
  // live queue at save AND rollback so an externally-set pause is never clobbered.
  it('re-reads the live queue on save so an externally-toggled pause survives', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
    ]);
    // Agent Board pauses the queue while this pane is open (external mutation).
    (plugin.settings.agentBoardConfig as BoardConfig).queue = { paused: true };

    const input = laneBlocks(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!;
    await fireEvent.update(input, 'Renamed');
    await waitFor(() => expect(save).toHaveBeenCalled());

    // The stored config carries the live pause, not a stale queue from pane-open.
    expect((plugin.settings.agentBoardConfig as BoardConfig).queue?.paused).toBe(true);
  });

  it('keeps the live queue pause when a lane save fails and rolls back', async () => {
    const { container, plugin, save } = renderEditor([
      { id: 'l1', title: 'Lane 1', statuses: ['ready'] },
    ]);
    (plugin.settings.agentBoardConfig as BoardConfig).queue = { paused: true };
    save.mockRejectedValueOnce(new Error('disk full'));

    const input = laneBlocks(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!;
    await fireEvent.update(input, 'Renamed');
    await waitFor(() => expect(Notice).toHaveBeenCalled());

    // Lanes rolled back to the pre-edit title, but the live pause is preserved.
    expect((plugin.settings.agentBoardConfig as BoardConfig).queue?.paused).toBe(true);
    expect(storedLanes(plugin)[0].title).toBe('Lane 1');
  });
});

describe('renderAgentBoardLaneEditor — Settings-host mount/unmount lifecycle', () => {
  it('mounts into the container and unmounts when the host detaches from the document', async () => {
    const { plugin } = makePlugin([{ id: 'l1', title: 'Lane 1', statuses: ['ready'] }]);
    // The two Settings hosts nest the field host under a tab-content ancestor;
    // `display()`/`hide()` empties that ancestor, detaching the mount point.
    const host = document.createElement('div');
    const container = document.createElement('div');
    host.appendChild(container);
    document.body.appendChild(host);

    renderAgentBoardLaneEditor(container, plugin);
    expect(container.querySelector('.specorator-lane-editor')).not.toBeNull();

    // Detach the host from the document — the MutationObserver on <body> fires.
    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Vue's app.unmount() cleared the island's rendered DOM from the container.
    expect(container.querySelector('.specorator-lane-editor')).toBeNull();
  });

  it('preserves pre-existing sibling settings in the container (mounts into a child, not the container)', async () => {
    // The legacy AgentBoardSettingsSection host passes a shared container that
    // already holds other settings + the "Board lanes" heading. Vue's
    // app.mount(el) clears el.textContent, so mounting into the container itself
    // would wipe those siblings — the editor must mount into a child.
    const { plugin } = makePlugin([{ id: 'l1', title: 'Lane 1', statuses: ['ready'] }]);
    const container = document.createElement('div');
    const heading = document.createElement('h4');
    heading.textContent = 'Board lanes';
    const priorSetting = document.createElement('div');
    priorSetting.className = 'setting-item';
    container.append(heading, priorSetting);
    document.body.appendChild(container);

    renderAgentBoardLaneEditor(container, plugin);
    await nextTick();

    // Siblings survive, and the editor mounted alongside them.
    expect(heading.isConnected).toBe(true);
    expect(priorSetting.isConnected).toBe(true);
    expect(container.contains(heading)).toBe(true);
    expect(container.querySelector('.specorator-lane-editor')).not.toBeNull();

    container.remove();
  });
});
