import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ToolHandlerCtx } from './types';

/**
 * Resolve a vault-relative path, throwing if it lexically escapes the vault root.
 *
 * This is a LEXICAL guard, not a security boundary: it does not resolve symlinks, so a
 * symlinked dir inside the vault that points elsewhere is not detected. That is acceptable —
 * tools run full-trust with raw `node:fs`, so `ctx.vault` is a convenience guard against
 * accidental escapes, not a sandbox (see the spec's trust posture). Real isolation would need
 * Worker/vm, which is deferred.
 */
function safeResolve(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath);
  const rel = path.relative(root, resolved);
  // `rel === ''` means the path IS the vault root (e.g. list('')) — that's inside
  // the vault, not an escape. Only `..`-traversal and absolute paths are escapes.
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${relPath}" is outside the vault root`);
  }
  return resolved;
}

export function createVaultContext(vaultPath: string): ToolHandlerCtx['vault'] {
  return {
    async read(relPath) {
      return fs.readFile(safeResolve(vaultPath, relPath), 'utf8');
    },
    async write(relPath, content) {
      const abs = safeResolve(vaultPath, relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
    },
    async exists(relPath) {
      try {
        await fs.access(safeResolve(vaultPath, relPath));
        return true;
      } catch {
        return false;
      }
    },
    async list(relPath) {
      const entries = await fs.readdir(safeResolve(vaultPath, relPath), { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    },
  };
}
