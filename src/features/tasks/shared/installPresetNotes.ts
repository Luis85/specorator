import type { Vault } from 'obsidian';
import { normalizePath, Notice } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type { TranslationKey } from '../../../i18n/types';
import { normalizeFolder } from './noteStoreShared';

export interface InstallPresetNotesResult {
  installed: number;
  skipped: number;
  folder: string;
}

/** Creates each preset note under `folder` unless a same-named note already exists. */
export async function installPresetNotes<T extends { name: string }>(
  vault: Vault,
  folder: string,
  presets: readonly T[],
  getFilePathForName: (folder: string, name: string) => string,
  build: (preset: T) => string,
): Promise<InstallPresetNotesResult> {
  // Settings-derived folder feeds vault.createFolder/getAbstractFileByPath below.
  const normalized = normalizePath(normalizeFolder(folder));
  if (!vault.getAbstractFileByPath(normalized)) {
    await vault.createFolder(normalized);
  }

  let installed = 0;
  let skipped = 0;
  for (const preset of presets) {
    const path = getFilePathForName(normalized, preset.name);
    if (vault.getAbstractFileByPath(path)) {
      skipped += 1;
      continue;
    }
    await vault.create(path, build(preset));
    installed += 1;
  }
  return { installed, skipped, folder: normalized };
}

/** Surfaces an install result as a Notice using the provided i18n keys. */
export function noticePresetInstall(
  result: InstallPresetNotesResult,
  summaryKey: TranslationKey,
  emptyKey: TranslationKey,
  summaryParam: string,
): void {
  const parts: string[] = [];
  if (result.installed > 0) parts.push(`installed ${result.installed}`);
  if (result.skipped > 0) parts.push(`skipped ${result.skipped} already present`);
  const summary = parts.join(', ');
  new Notice(summary ? t(summaryKey, { [summaryParam]: summary }) : t(emptyKey));
}
