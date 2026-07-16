import { Notice } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { t } from '../../../../i18n/i18n';
import { filterValidPaths, findConflictingPath, isDuplicatePath, isValidDirectoryPath, validateDirectoryPath } from '../../../../utils/externalContext';
import { expandHomePath, normalizePathForFilesystem } from '../../../../utils/path';

interface ElectronOpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface ElectronRemoteApi {
  dialog: {
    showOpenDialog(options: { properties: string[]; title: string }): Promise<ElectronOpenDialogResult>;
  };
}

export type AddExternalContextResult =
  | { success: true; normalizedPath: string }
  | { success: false; error: string };

/**
 * Engine object owning the external-context path list + persistent set. The
 * Vue `ExternalContextSelector.vue` renders from the projected store and fires
 * callbacks back into this object; the imperative DOM-render layer was removed
 * in the Phase 2 toolbar cutover. Every public method the engine calls
 * (`InputController` `/add-dir`, `ConversationController` history restore,
 * folder picker, remove, persistence toggle) stays intact.
 */
export class ExternalContextSelector {
  /**
   * Current external context paths. May contain:
   * - Persistent paths only (new sessions via clearExternalContexts)
   * - Restored session paths (loaded sessions via setExternalContexts)
   * - Mixed paths during active sessions
   */
  private externalContextPaths: string[] = [];
  /** Paths that persist across all sessions (stored in settings). */
  private persistentPaths: Set<string> = new Set();
  private onChangeCallback: ((paths: string[]) => void) | null = null;
  private onPersistenceChangeCallback: ((paths: string[]) => void) | null = null;

  setOnChange(callback: (paths: string[]) => void): void {
    this.onChangeCallback = callback;
  }

  setOnPersistenceChange(callback: (paths: string[]) => void): void {
    this.onPersistenceChangeCallback = callback;
  }

  getExternalContexts(): string[] {
    return [...this.externalContextPaths];
  }

  getPersistentPaths(): string[] {
    return [...this.persistentPaths];
  }

  setPersistentPaths(paths: string[]): void {
    // Validate paths - remove non-existent directories
    const validPaths = filterValidPaths(paths);
    const invalidPaths = paths.filter(p => !validPaths.includes(p));

    this.persistentPaths = new Set(validPaths);
    // Merge persistent paths into external context paths
    this.mergePersistentPaths();

    // If invalid paths were removed, notify user and save updated list
    if (invalidPaths.length > 0) {
      const pathNames = invalidPaths.map(p => this.shortenPath(p)).join(', ');
      new Notice(t('chat.externalContext.invalidRemoved', { count: invalidPaths.length, paths: pathNames }), 5000);
      this.onPersistenceChangeCallback?.([...this.persistentPaths]);
    }
  }

  togglePersistence(path: string): void {
    if (this.persistentPaths.has(path)) {
      this.persistentPaths.delete(path);
    } else {
      // Validate path still exists before persisting
      if (!isValidDirectoryPath(path)) {
        new Notice(t('chat.externalContext.persistFailed', { path: this.shortenPath(path) }), 4000);
        return;
      }
      this.persistentPaths.add(path);
    }
    this.onPersistenceChangeCallback?.([...this.persistentPaths]);
  }

  private mergePersistentPaths(): void {
    const pathSet = new Set(this.externalContextPaths);
    for (const path of this.persistentPaths) {
      pathSet.add(path);
    }
    this.externalContextPaths = [...pathSet];
  }

  /**
   * Restore exact external context paths from a saved conversation.
   * Does NOT merge with persistent paths - preserves the session's historical state.
   * Use clearExternalContexts() for new sessions to start with current persistent paths.
   */
  setExternalContexts(paths: string[]): void {
    this.externalContextPaths = [...paths];
  }

  /**
   * Remove a path from external contexts (and persistent paths if applicable).
   * Exposed for testing the remove button behavior.
   */
  removePath(pathStr: string): void {
    this.externalContextPaths = this.externalContextPaths.filter(p => p !== pathStr);
    // Also remove from persistent paths if it was persistent
    if (this.persistentPaths.has(pathStr)) {
      this.persistentPaths.delete(pathStr);
      this.onPersistenceChangeCallback?.([...this.persistentPaths]);
    }
    this.onChangeCallback?.(this.externalContextPaths);
  }

  /**
   * Add an external context path programmatically (e.g., from /add-dir command).
   * Validates the path and handles duplicates/conflicts.
   * @param pathInput - Path string (supports ~/ expansion)
   * @returns Result with success status and normalized path, or error message on failure
   */
  addExternalContext(pathInput: string): AddExternalContextResult {
    const trimmed = pathInput?.trim();
    if (!trimmed) {
      return { success: false, error: 'No path provided. Usage: /add-dir /absolute/path' };
    }

    // Strip surrounding quotes if present (e.g., "/path/with spaces")
    let cleanPath = trimmed;
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
      cleanPath = cleanPath.slice(1, -1);
    }

    // Expand home directory and normalize path
    const expandedPath = expandHomePath(cleanPath);
    const normalizedPath = normalizePathForFilesystem(expandedPath);

    if (!path.isAbsolute(normalizedPath)) {
      return { success: false, error: 'Path must be absolute. Usage: /add-dir /absolute/path' };
    }

    // Validate path exists and is a directory with specific error messages
    const validation = validateDirectoryPath(normalizedPath);
    if (!validation.valid) {
      return { success: false, error: `${validation.error}: ${pathInput}` };
    }

    // Check for duplicate (normalized comparison for cross-platform support)
    if (isDuplicatePath(normalizedPath, this.externalContextPaths)) {
      return { success: false, error: 'This folder is already added as an external context.' };
    }

    // Check for nested/overlapping paths
    const conflict = findConflictingPath(normalizedPath, this.externalContextPaths);
    if (conflict) {
      return { success: false, error: this.formatConflictMessage(normalizedPath, conflict) };
    }

    // Add the path
    this.externalContextPaths = [...this.externalContextPaths, normalizedPath];
    this.onChangeCallback?.(this.externalContextPaths);

    return { success: true, normalizedPath };
  }

  /**
   * Clear session-only external context paths (call on new conversation).
   * Uses persistent paths from settings if provided, otherwise falls back to local cache.
   * Validates paths before using them (silently filters invalid during session init).
   */
  clearExternalContexts(persistentPathsFromSettings?: string[]): void {
    // Use settings value if provided (most up-to-date), otherwise use local cache
    if (persistentPathsFromSettings) {
      // Validate paths - silently filter during session initialization (not user action)
      const validPaths = filterValidPaths(persistentPathsFromSettings);
      this.persistentPaths = new Set(validPaths);
    }
    this.externalContextPaths = [...this.persistentPaths];
  }

  async openFolderPicker(): Promise<void> {
    try {
      // Access Electron's dialog through remote
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron remote is exposed only at runtime in Obsidian's renderer.
      const { remote } = require('electron') as { remote?: ElectronRemoteApi };
      if (!remote) {
        throw new Error('Electron remote API is unavailable');
      }
      const result = await remote.dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select External Context',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];

        // Check for duplicate (normalized comparison for cross-platform support)
        if (isDuplicatePath(selectedPath, this.externalContextPaths)) {
          new Notice(t('chat.externalContext.duplicate'), 3000);
          return;
        }

        // Check for nested/overlapping paths
        const conflict = findConflictingPath(selectedPath, this.externalContextPaths);
        if (conflict) {
          new Notice(this.formatConflictMessage(selectedPath, conflict), 5000);
          return;
        }

        this.externalContextPaths = [...this.externalContextPaths, selectedPath];
        this.onChangeCallback?.(this.externalContextPaths);
      }
    } catch {
      new Notice(t('chat.externalContext.pickerFailed'), 5000);
    }
  }

  /** Formats a conflict error message for display. */
  private formatConflictMessage(newPath: string, conflict: { path: string; type: 'parent' | 'child' }): string {
    const shortNew = this.shortenPath(newPath);
    const shortExisting = this.shortenPath(conflict.path);
    return conflict.type === 'parent'
      ? `Cannot add "${shortNew}" - it's inside existing path "${shortExisting}"`
      : `Cannot add "${shortNew}" - it contains existing path "${shortExisting}"`;
  }

  /** Shorten path for display (replace home dir with ~) */
  private shortenPath(fullPath: string): string {
    try {
      const homeDir = os.homedir();
      const normalize = (value: string) => value.replace(/\\/g, '/');
      const normalizedFull = normalize(fullPath);
      const normalizedHome = normalize(homeDir);
      const compareFull = process.platform === 'win32'
        ? normalizedFull.toLowerCase()
        : normalizedFull;
      const compareHome = process.platform === 'win32'
        ? normalizedHome.toLowerCase()
        : normalizedHome;
      if (compareFull.startsWith(compareHome)) {
        // Use normalized path length and normalize the result for consistent display
        const remainder = normalizedFull.slice(normalizedHome.length);
        return '~' + remainder;
      }
    } catch {
      // Fall through to return full path
    }
    return fullPath;
  }
}
