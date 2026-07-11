<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, inject, ref } from 'vue';

import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import { loadBoardConfig } from '../../config/BoardConfigStore';
import {
  type BoardConfig,
  type BoardLaneConfig,
  DEFAULT_BOARD_CONFIG,
} from '../../config/boardConfigTypes';
import { TASK_STATUSES } from '../../model/taskStateMachine';
import type { TaskStatus } from '../../model/taskTypes';
import { computeStatusOccurrences } from '../laneEditorOccurrences';
import LaneCriteriaField from './components/LaneCriteriaField.vue';
import SettingRow from './components/SettingRow.vue';
import { LANE_EDITOR_PLUGIN_KEY } from './laneEditorKeys';
import { mountLucide } from './mountLucide';

// Vue port of the imperative `renderAgentBoardLaneEditor` internals. The reactive
// `config` replaces the old rebuild-on-every-edit + `data-focus-key` focus
// restoration: edits mutate the array in place, Vue patches the DOM without
// destroying the focused control, so the focus-key machinery is gone. The persist
// cadence, rollback + Notice on failure, and live-queue re-read are preserved
// exactly.
const plugin = inject(LANE_EDITOR_PLUGIN_KEY);
if (!plugin) {
  throw new Error('LaneEditorRoot mounted without its inject keys');
}
const pluginRef = plugin;

function cloneConfig(config: BoardConfig): BoardConfig {
  return JSON.parse(JSON.stringify(config)) as BoardConfig;
}

const config = ref<BoardConfig>(
  cloneConfig(loadBoardConfig(asSettingsBag(pluginRef.settings)).config),
);

const occurrences = computed(() => computeStatusOccurrences(config.value));

// `persist` accepts the pre-mutation snapshot and rolls the editor's in-memory
// state back if `saveSettings` rejects, then surfaces a Notice. The lane editor
// owns lanes only; `queue.paused` is toggled from the Agent Board and can change
// while this pane is open, so re-read the live queue at both save and roll-back
// time — a pause set elsewhere must never be clobbered by the queue captured when
// the pane opened.
async function persist(snapshot: BoardConfig): Promise<boolean> {
  const liveQueue = loadBoardConfig(asSettingsBag(pluginRef.settings)).config.queue;
  config.value.queue = liveQueue;
  pluginRef.settings.agentBoardConfig = cloneConfig(config.value);
  try {
    await pluginRef.saveSettings();
    pluginRef.events.emit('task:board-config-changed');
    return true;
  } catch (error) {
    // Roll back the lanes but keep the live queue so a failed write does not
    // leave the live settings desynced from disk or revert an unrelated pause.
    config.value = { ...snapshot, queue: liveQueue };
    pluginRef.settings.agentBoardConfig = cloneConfig(config.value);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(t('tasks.board.laneSaveFailed', { error: message }));
    return false;
  }
}

function laneHeaderName(lane: BoardLaneConfig): string {
  return lane.title.trim().length > 0 ? lane.title : t('tasks.laneEditor.untitledLane');
}

// Non-null canonical title when this lane is a duplicate (non-first-visible)
// owner of `status`; null otherwise. Mirrors the imperative first-wins-among-
// visible check.
function statusDuplicateCanonical(
  lane: BoardLaneConfig,
  index: number,
  status: TaskStatus,
): string | null {
  if (!lane.statuses.includes(status) || !lane.visible) return null;
  const owners = occurrences.value.get(status) ?? [];
  if (owners.length > 1 && owners[0].laneIndex !== index) return owners[0].laneTitle;
  return null;
}

function laneConflicts(
  lane: BoardLaneConfig,
  index: number,
): Array<{ status: TaskStatus; canonicalTitle: string }> {
  const conflicts: Array<{ status: TaskStatus; canonicalTitle: string }> = [];
  for (const status of TASK_STATUSES) {
    const canonicalTitle = statusDuplicateCanonical(lane, index, status);
    if (canonicalTitle !== null) conflicts.push({ status, canonicalTitle });
  }
  return conflicts;
}

function conflictSummary(lane: BoardLaneConfig, index: number): string {
  return laneConflicts(lane, index)
    .map((entry) =>
      t('tasks.laneEditor.routedSummaryItem', { status: entry.status, lane: entry.canonicalTitle }),
    )
    .join(', ');
}

function onTitleInput(lane: BoardLaneConfig, event: Event): void {
  const snapshot = cloneConfig(config.value);
  lane.title = (event.target as HTMLInputElement).value;
  void persist(snapshot);
}

function onToggleVisible(lane: BoardLaneConfig): void {
  const snapshot = cloneConfig(config.value);
  lane.visible = !lane.visible;
  void persist(snapshot);
}

function onMoveUp(index: number): void {
  if (index === 0) return;
  const snapshot = cloneConfig(config.value);
  const lanes = config.value.lanes;
  [lanes[index - 1], lanes[index]] = [lanes[index], lanes[index - 1]];
  void persist(snapshot);
}

function onMoveDown(index: number): void {
  if (index >= config.value.lanes.length - 1) return;
  const snapshot = cloneConfig(config.value);
  const lanes = config.value.lanes;
  [lanes[index + 1], lanes[index]] = [lanes[index], lanes[index + 1]];
  void persist(snapshot);
}

function onRemoveLane(index: number): void {
  const snapshot = cloneConfig(config.value);
  config.value.lanes.splice(index, 1);
  void persist(snapshot);
}

// Turning Collapsible OFF clears `collapsed` so the board can't strand a
// non-collapsible lane in the collapsed strip variant.
function onToggleCollapsible(lane: BoardLaneConfig, event: Event): void {
  const snapshot = cloneConfig(config.value);
  lane.collapsible = (event.target as HTMLInputElement).checked;
  if (!lane.collapsible) lane.collapsed = false;
  void persist(snapshot);
}

function onToggleStatus(lane: BoardLaneConfig, status: TaskStatus, event: Event): void {
  const snapshot = cloneConfig(config.value);
  if ((event.target as HTMLInputElement).checked) {
    if (!lane.statuses.includes(status)) lane.statuses.push(status);
  } else {
    lane.statuses = lane.statuses.filter((value) => value !== status);
  }
  void persist(snapshot);
}

function onCriteriaCommit(
  lane: BoardLaneConfig,
  field: 'definitionOfReady' | 'definitionOfDone',
  lines: string[],
): void {
  const snapshot = cloneConfig(config.value);
  lane[field] = lines;
  void persist(snapshot);
}

function onAddLane(): void {
  const snapshot = cloneConfig(config.value);
  config.value.lanes.push({
    id: `lane-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    title: t('tasks.laneEditor.newLaneTitle'),
    statuses: [],
    visible: true,
    definitionOfReady: [],
    definitionOfDone: [],
    collapsible: false,
    collapsed: false,
  });
  void persist(snapshot);
}

function onResetToDefault(): void {
  const snapshot = cloneConfig(config.value);
  config.value = cloneConfig(DEFAULT_BOARD_CONFIG);
  void persist(snapshot);
}
</script>

<template>
  <div class="specorator-lane-editor">
    <div
      v-for="(lane, index) in config.lanes"
      :key="lane.id"
      class="specorator-lane-editor-lane"
      :data-lane-id="lane.id"
    >
      <SettingRow
        :name="laneHeaderName(lane)"
        :desc="t('tasks.laneEditor.laneDesc')"
      >
        <input
          type="text"
          :value="lane.title"
          @input="onTitleInput(lane, $event)"
        >
        <div
          class="checkbox-container"
          :class="{ 'is-enabled': lane.visible }"
          @click="onToggleVisible(lane)"
        >
          <input
            type="checkbox"
            tabindex="0"
            :checked="lane.visible"
          >
        </div>
        <button
          :ref="(el) => mountLucide(el as Element, 'arrow-up')"
          class="clickable-icon"
          :aria-label="t('tasks.laneEditor.moveUp')"
          @click="onMoveUp(index)"
        />
        <button
          :ref="(el) => mountLucide(el as Element, 'arrow-down')"
          class="clickable-icon"
          :aria-label="t('tasks.laneEditor.moveDown')"
          @click="onMoveDown(index)"
        />
        <button
          :ref="(el) => mountLucide(el as Element, 'trash-2')"
          class="clickable-icon"
          :aria-label="t('tasks.laneEditor.removeLane')"
          @click="onRemoveLane(index)"
        />
      </SettingRow>

      <div class="specorator-lane-editor-collapsible">
        <label class="specorator-lane-editor-collapsible-label">
          <input
            type="checkbox"
            :checked="lane.collapsible"
            @change="onToggleCollapsible(lane, $event)"
          >
          <span>{{ t('tasks.laneEditor.collapsible') }}</span>
        </label>
      </div>

      <div class="specorator-lane-editor-statuses">
        <label
          v-for="status in TASK_STATUSES"
          :key="status"
          class="specorator-lane-editor-status"
          :class="{
            'specorator-lane-editor-status--duplicate':
              statusDuplicateCanonical(lane, index, status) !== null,
          }"
          :title="
            statusDuplicateCanonical(lane, index, status) !== null
              ? t('tasks.laneEditor.routedTo', {
                title: statusDuplicateCanonical(lane, index, status) ?? '',
              })
              : undefined
          "
        >
          <input
            type="checkbox"
            :checked="lane.statuses.includes(status)"
            @change="onToggleStatus(lane, status, $event)"
          >
          <span>{{ status }}</span>
        </label>
      </div>

      <div
        v-if="laneConflicts(lane, index).length > 0"
        class="specorator-lane-editor-status-hint"
        role="note"
      >
        {{ t('tasks.laneEditor.routedElsewhere', { summary: conflictSummary(lane, index) }) }}
      </div>

      <LaneCriteriaField
        :label="t('tasks.laneEditor.definitionOfReady')"
        :lines="lane.definitionOfReady"
        @commit="onCriteriaCommit(lane, 'definitionOfReady', $event)"
      />
      <LaneCriteriaField
        :label="t('tasks.laneEditor.definitionOfDone')"
        :lines="lane.definitionOfDone"
        @commit="onCriteriaCommit(lane, 'definitionOfDone', $event)"
      />
    </div>

    <div class="setting-item">
      <div class="setting-item-info" />
      <div class="setting-item-control">
        <button
          data-action="add-lane"
          @click="onAddLane"
        >
          {{ t('tasks.laneEditor.addLane') }}
        </button>
        <button
          class="mod-warning"
          data-action="reset-default"
          @click="onResetToDefault"
        >
          {{ t('tasks.laneEditor.resetToDefault') }}
        </button>
      </div>
    </div>
  </div>
</template>
