import type SpecoratorPlugin from '../../../main';
import {
  installPresetNotes,
  type InstallPresetNotesResult,
  noticePresetInstall,
} from '../shared/installPresetNotes';
import { PRESET_TEMPLATES } from './presetTemplates';
import { TemplateNoteStore } from './TemplateNoteStore';

export type InstallPresetTemplatesResult = InstallPresetNotesResult;

export function installPresetTemplates(plugin: SpecoratorPlugin): Promise<InstallPresetTemplatesResult> {
  const store = new TemplateNoteStore();
  return installPresetNotes(
    plugin.app.vault,
    plugin.settings.agentBoardTemplateFolder || 'Agent Board/templates',
    PRESET_TEMPLATES,
    (folder, name) => store.getFilePathForName(folder, name),
    (preset) => store.build(preset),
  );
}

/** Installs the preset templates and surfaces the installed/skipped summary as a Notice. */
export async function installPresetTemplatesWithNotice(plugin: SpecoratorPlugin): Promise<void> {
  const result = await installPresetTemplates(plugin);
  noticePresetInstall(
    result,
    'settings.agentBoard.commonTemplates',
    'settings.agentBoard.commonTemplatesEmpty',
    'templates',
  );
}
