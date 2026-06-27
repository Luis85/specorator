import { Notice, type TFile, type TFolder } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import {
  buildSelectionSeed,
  createWorkOrder,
  createWorkOrderFromSeed,
  type CreateWorkOrderOptions,
  type WorkOrderSeed,
} from '../commands/taskCommands';
import { chooseWorkOrderTemplate } from './WorkOrderTemplatePickerModal';

export async function createWorkOrderInteractive(
  plugin: SpecoratorPlugin,
  source?: TFile | TFolder | null,
  options?: CreateWorkOrderOptions,
): Promise<TFile | null> {
  const picked = await chooseWorkOrderTemplate(plugin);
  if (picked.cancelled) {
    return null;
  }
  return createWorkOrder(plugin, source ?? null, { ...options, template: picked.template });
}

/**
 * Surface a just-created work order in the detail modal instead of the raw note.
 * `reveal: 'none'` keeps the note from opening; the board (revealed by
 * `plugin.openWorkOrderInBoard`) provides the modal's full action wiring.
 * No-ops on `null` (cancelled creation).
 */
async function openCreatedInBoard(
  plugin: SpecoratorPlugin,
  created: TFile | null,
): Promise<TFile | null> {
  if (!created) {
    return null;
  }
  await plugin.openWorkOrderInBoard(created);
  return created;
}

/**
 * Create a work order from a file/folder source and open it in the detail modal
 * (the file/folder right-click "Create work order" + the command-palette
 * "Create work order"). Mirrors the Agent Board's own "+" flow. Returns the
 * created file, or null when the template picker is cancelled.
 */
export async function createWorkOrderAndOpenModal(
  plugin: SpecoratorPlugin,
  source?: TFile | TFolder | null,
): Promise<TFile | null> {
  return openCreatedInBoard(
    plugin,
    await createWorkOrderInteractive(plugin, source ?? null, { status: 'inbox', reveal: 'none' }),
  );
}

/** Create a work order seeded from the active note and open the detail modal. */
export async function createWorkOrderFromCurrentNoteAndOpenModal(plugin: SpecoratorPlugin): Promise<TFile | null> {
  const active = plugin.app.workspace.getActiveFile();
  if (!active) {
    new Notice(t('tasks.create.noActiveNote'));
    return null;
  }
  return createWorkOrderAndOpenModal(plugin, active);
}

/** Read the active editor selection into a work-order seed, or notice + null. */
function readSelectionSeed(plugin: SpecoratorPlugin): WorkOrderSeed | null {
  const editor = plugin.app.workspace.activeEditor?.editor;
  const selection = editor?.getSelection() ?? '';
  if (!selection.trim()) {
    new Notice(t('tasks.create.noSelection'));
    return null;
  }
  const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? null;
  return buildSelectionSeed({ selectionText: selection, sourcePath });
}

export async function createWorkOrderFromSelectionInteractive(plugin: SpecoratorPlugin): Promise<TFile | null> {
  const seed = readSelectionSeed(plugin);
  if (!seed) {
    return null;
  }
  const picked = await chooseWorkOrderTemplate(plugin);
  if (picked.cancelled) {
    return null;
  }
  return createWorkOrderFromSeed(plugin, seed, { template: picked.template });
}

/** As `createWorkOrderFromSelectionInteractive`, but opens the detail modal. */
export async function createWorkOrderFromSelectionAndOpenModal(plugin: SpecoratorPlugin): Promise<TFile | null> {
  const seed = readSelectionSeed(plugin);
  if (!seed) {
    return null;
  }
  const picked = await chooseWorkOrderTemplate(plugin);
  if (picked.cancelled) {
    return null;
  }
  return openCreatedInBoard(
    plugin,
    await createWorkOrderFromSeed(plugin, seed, { template: picked.template, reveal: 'none' }),
  );
}
