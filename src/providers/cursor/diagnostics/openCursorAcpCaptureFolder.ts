import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Notice } from 'obsidian';

import { SPECORATOR_STORAGE_PATH } from '../../../core/bootstrap/StoragePaths';
import type { PluginContext } from '../../../core/types/PluginContext';
import { t } from '../../../i18n/i18n';
import { getVaultPath } from '../../../utils/path';

interface ElectronShellApi {
  showItemInFolder(fullPath: string): void;
}

/** `<vault>/.specorator/captures/cursor` — the same baseDir `CursorChatRuntime` writes captures under. */
export function cursorAcpCaptureBaseDir(plugin: PluginContext): string | null {
  const vaultPath = getVaultPath(plugin.app);
  if (!vaultPath) return null;
  return path.join(vaultPath, SPECORATOR_STORAGE_PATH, 'captures', 'cursor');
}

/**
 * Reveals the Cursor ACP capture folder in the OS file manager, creating it
 * first if no capture has run yet so the command is never a silent no-op.
 * `shell.showItemInFolder` is Electron's common `shell` module — available
 * directly in Obsidian's renderer without `remote`.
 */
export async function openCursorAcpCaptureFolder(plugin: PluginContext): Promise<void> {
  const baseDir = cursorAcpCaptureBaseDir(plugin);
  if (!baseDir) {
    new Notice(t('provider.cursor.capture.folderUnavailable'));
    return;
  }
  try {
    await fs.mkdir(baseDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron's shell module is exposed only at runtime in Obsidian's renderer.
    const { shell } = require('electron') as { shell?: ElectronShellApi };
    if (!shell) {
      throw new Error('Electron shell API is unavailable');
    }
    shell.showItemInFolder(baseDir);
  } catch (error) {
    new Notice(
      t('provider.cursor.capture.openFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
