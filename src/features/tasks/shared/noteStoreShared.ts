import type { App, Vault } from 'obsidian';
import { normalizePath, TFile } from 'obsidian';

const SECTION_HEADING_PATTERN = /^##\s+(.+?)\s*$/;

export function fileBaseName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/i, '');
}

export function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '');
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reads the body of a `## Heading` section, stopping at the next `##` heading. */
export function extractSection(body: string, heading: string): string {
  const sectionLines: string[] = [];
  let inSection = false;
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(SECTION_HEADING_PATTERN);
    if (match) {
      if (inSection) break;
      inSection = match[1] === heading;
      continue;
    }
    if (inSection) sectionLines.push(line);
  }
  return sectionLines.join('\n').trim();
}

export function noteFilePathForName(folder: string, name: string, fallbackSlug: string): string {
  const slug = slugify(name) || fallbackSlug;
  // folder + name are user-/settings-derived; normalize before any vault call.
  return normalizePath(`${normalizeFolder(folder)}/${slug}.md`);
}

/** Parses every Markdown note under `folder`, collecting parse failures as warnings. */
export async function listNoteDefinitions<T>(
  vault: Vault,
  folder: string,
  parse: (path: string, content: string, file: TFile) => T,
): Promise<{ items: T[]; warnings: string[] }> {
  const normalized = normalizeFolder(folder);
  const items: T[] = [];
  const warnings: string[] = [];
  const files = vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${normalized}/`));
  for (const file of files) {
    try {
      items.push(parse(file.path, await vault.read(file), file));
    } catch (error) {
      warnings.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { items, warnings };
}

/** Writes a note: modifies `originalPath` if it still exists, else creates under `folder`. */
export async function saveNote(
  vault: Vault,
  folder: string,
  content: string,
  filePathForFolder: (normalizedFolder: string) => string,
  originalPath?: string,
): Promise<string> {
  if (originalPath) {
    const existing = vault.getAbstractFileByPath(originalPath);
    if (existing instanceof TFile) {
      await vault.modify(existing, content);
      return originalPath;
    }
  }
  const normalized = normalizePath(normalizeFolder(folder));
  if (!vault.getAbstractFileByPath(normalized)) {
    await vault.createFolder(normalized);
  }
  const filePath = filePathForFolder(normalized);
  await vault.create(filePath, content);
  return filePath;
}

export async function deleteNote(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file) {
    await app.fileManager.trashFile(file);
  }
}
