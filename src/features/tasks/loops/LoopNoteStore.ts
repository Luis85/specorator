import type { App, Vault } from 'obsidian';

import { extractString, extractStringArray, parseFrontmatter } from '../../../utils/frontmatter';
import {
  deleteNote,
  extractSection,
  fileBaseName,
  listNoteDefinitions,
  noteFilePathForName,
  saveNote,
  slugify,
} from '../shared/noteStoreShared';
import type { LoopDefinition, SaveLoopInput } from './loopTypes';

const SECTION_HEADINGS = Object.freeze({
  useWhen: 'Use when',
  approach: 'Approach',
  steps: 'Steps',
  verify: 'Verify',
  notes: 'Notes',
});

export class LoopNoteStore {
  parse(path: string, content: string): LoopDefinition {
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      throw new Error('Missing YAML frontmatter');
    }
    if (parsed.frontmatter.type !== 'specorator-loop') {
      throw new Error('Invalid loop type');
    }
    if (parsed.frontmatter.schema_version !== 1) {
      throw new Error('Unsupported loop schema_version');
    }

    const name = extractString(parsed.frontmatter, 'name') ?? fileBaseName(path);
    return {
      path,
      id: slugify(name) || fileBaseName(path),
      name,
      description: extractString(parsed.frontmatter, 'description'),
      icon: extractString(parsed.frontmatter, 'icon'),
      tags: extractStringArray(parsed.frontmatter, 'tags'),
      useWhen: extractSection(parsed.body, SECTION_HEADINGS.useWhen),
      approach: extractSection(parsed.body, SECTION_HEADINGS.approach),
      steps: extractSection(parsed.body, SECTION_HEADINGS.steps),
      verify: extractSection(parsed.body, SECTION_HEADINGS.verify),
      notes: extractSection(parsed.body, SECTION_HEADINGS.notes),
    };
  }

  build(input: SaveLoopInput): string {
    const lines: string[] = [
      '---',
      'type: specorator-loop',
      'schema_version: 1',
      `name: ${JSON.stringify(input.name)}`,
    ];
    if (input.description) lines.push(`description: ${JSON.stringify(input.description)}`);
    if (input.icon) lines.push(`icon: ${JSON.stringify(input.icon)}`);
    if (input.tags && input.tags.length > 0) {
      lines.push(`tags: [${input.tags.map((tag) => JSON.stringify(tag)).join(', ')}]`);
    }
    lines.push('---', '');
    const section = (heading: string, value: string): void => {
      if (value.trim()) lines.push(`## ${heading}`, '', value.trim(), '');
    };
    section(SECTION_HEADINGS.useWhen, input.useWhen);
    section(SECTION_HEADINGS.approach, input.approach);
    section(SECTION_HEADINGS.steps, input.steps);
    section(SECTION_HEADINGS.verify, input.verify);
    section(SECTION_HEADINGS.notes, input.notes);
    return lines.join('\n');
  }

  async list(vault: Vault, folder: string): Promise<{ loops: LoopDefinition[]; warnings: string[] }> {
    const { items, warnings } = await listNoteDefinitions(vault, folder, (path, content, file) => {
      const def = this.parse(path, content);
      def.updatedAt = file.stat?.mtime;
      return def;
    });
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { loops: items, warnings };
  }

  getFilePathForName(folder: string, name: string): string {
    return noteFilePathForName(folder, name, 'loop');
  }

  save(vault: Vault, folder: string, input: SaveLoopInput, originalPath?: string): Promise<string> {
    return saveNote(
      vault,
      folder,
      this.build(input),
      (normalized) => this.getFilePathForName(normalized, input.name),
      originalPath,
    );
  }

  delete(app: App, path: string): Promise<void> {
    return deleteNote(app, path);
  }
}
