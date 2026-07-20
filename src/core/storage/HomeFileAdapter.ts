import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { VaultFileAdapter } from './VaultFileAdapter';

/**
 * Filesystem adapter rooted at the user's home directory.
 * Implements the same interface as VaultFileAdapter so storage
 * classes (like CodexSkillStorage) can scan home-level paths.
 */
export class HomeFileAdapter implements Pick<VaultFileAdapter,
  'exists' | 'read' | 'write' | 'delete' | 'deleteFolder' | 'deleteFolderRecursive' | 'listFiles' | 'listFolders' | 'ensureFolder'
> {
  private readonly root: string;

  constructor(root: string = os.homedir()) {
    this.root = root;
  }

  private resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  /**
   * Host-absolute path for a home-relative path. Mirrors
   * `VaultFileAdapter.getAbsolutePath` so callers can surface a real filesystem
   * path (e.g. a skill's `sourceFilePath`) that the vault adapter will correctly
   * recognize as out-of-vault and treat read-only.
   */
  getAbsolutePath(relativePath: string): string {
    return this.resolve(relativePath);
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(p));
      return true;
    } catch {
      return false;
    }
  }

  async read(p: string): Promise<string> {
    return fs.promises.readFile(this.resolve(p), 'utf-8');
  }

  async write(p: string, content: string): Promise<void> {
    const full = this.resolve(p);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, content, 'utf-8');
  }

  async delete(p: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolve(p));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async deleteFolder(p: string): Promise<void> {
    try {
      await fs.promises.rmdir(this.resolve(p));
    } catch {
      // Non-critical
    }
  }

  /**
   * Removes a folder tree (native recursive rm). Mirrors
   * `VaultFileAdapter.deleteFolderRecursive` for deliberate whole-folder deletes
   * (e.g. cleaning up a partially-written skill dir). Refuses root-ish paths so a
   * caller bug can't wipe the home root; a no-op when the path is absent (`force`).
   */
  async deleteFolderRecursive(p: string): Promise<void> {
    const trimmed = p.replace(/\/+$/, '');
    if (!trimmed || trimmed === '.') {
      throw new Error(`deleteFolderRecursive refuses root-ish path "${p}"`);
    }
    await fs.promises.rm(this.resolve(trimmed), { recursive: true, force: true });
  }

  async listFiles(folder: string): Promise<string[]> {
    return this.listEntries(folder, (e) => e.isFile());
  }

  async listFolders(folder: string): Promise<string[]> {
    return this.listEntries(folder, (e) => e.isDirectory());
  }

  private async listEntries(
    folder: string,
    predicate: (entry: fs.Dirent) => boolean,
  ): Promise<string[]> {
    const full = this.resolve(folder);
    try {
      const entries = await fs.promises.readdir(full, { withFileTypes: true });
      return entries
        .filter(predicate)
        .map(e => `${folder}/${e.name}`);
    } catch {
      return [];
    }
  }

  async ensureFolder(p: string): Promise<void> {
    await fs.promises.mkdir(this.resolve(p), { recursive: true });
  }
}
