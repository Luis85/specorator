import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVaultContext } from '@/tool-host/vaultContext';

describe('createVaultContext', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'vault-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writes then reads a vault-relative file, creating parent dirs', async () => {
    const vault = createVaultContext(root);
    await vault.write('a/b/note.md', 'hello');
    expect(await vault.exists('a/b/note.md')).toBe(true);
    expect(await vault.read('a/b/note.md')).toBe('hello');
  });

  it('lists files in a folder', async () => {
    const vault = createVaultContext(root);
    await vault.write('dir/one.md', '1');
    await vault.write('dir/two.md', '2');
    expect((await vault.list('dir')).sort()).toEqual(['one.md', 'two.md']);
  });

  it('rejects a traversal path that escapes the root', async () => {
    const vault = createVaultContext(root);
    await expect(vault.read('../escape.md')).rejects.toThrow(/outside the vault/i);
    await expect(vault.write('../../x', 'y')).rejects.toThrow(/outside the vault/i);
  });

  it('rejects an absolute path', async () => {
    const vault = createVaultContext(root);
    await expect(vault.read('/etc/passwd')).rejects.toThrow(/outside the vault/i);
  });
});
