import type SpecoratorPlugin from '../../../main';
import {
  installPresetNotes,
  type InstallPresetNotesResult,
  noticePresetInstall,
} from '../shared/installPresetNotes';
import { LoopNoteStore } from './LoopNoteStore';
import { PRESET_LOOPS } from './presetLoops';

export type InstallPresetLoopsResult = InstallPresetNotesResult;

export function installPresetLoops(plugin: SpecoratorPlugin): Promise<InstallPresetLoopsResult> {
  const store = new LoopNoteStore();
  return installPresetNotes(
    plugin.app.vault,
    plugin.settings.agentBoardLoopFolder || 'Agent Board/loops',
    PRESET_LOOPS,
    (folder, name) => store.getFilePathForName(folder, name),
    (preset) => store.build(preset),
  );
}

/** Installs the preset loops and surfaces the installed/skipped summary as a Notice. */
export async function installPresetLoopsWithNotice(plugin: SpecoratorPlugin): Promise<void> {
  const result = await installPresetLoops(plugin);
  noticePresetInstall(
    result,
    'settings.agentBoard.commonLoops',
    'settings.agentBoard.commonLoopsEmpty',
    'loops',
  );
}
