import type { App, Vault } from 'obsidian';

import { extractString, parseFrontmatter } from '../../../utils/frontmatter';
import type { TaskPriority } from '../model/taskTypes';
import { chainConfigFrontmatterLines, parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';
import {
  deleteNote,
  fileBaseName,
  listNoteDefinitions,
  noteFilePathForName,
  saveNote,
} from '../shared/noteStoreShared';
import type { WorkOrderTemplate } from './templateTypes';

const VALID_PRIORITIES: ReadonlySet<TaskPriority> = new Set<TaskPriority>(['0 - urgent', '1 - high', '2 - normal', '3 - low']);

/** Append the `chain_*` frontmatter lines when a default successor is configured; a no-op otherwise. Extracted so `build` stays under the fallow complexity ratchet. */
function appendChainLines(lines: string[], chain: WorkOrderChainConfig | undefined): void {
  if (!chain) return;
  for (const line of chainConfigFrontmatterLines(chain)) lines.push(line);
}

export interface SaveTemplateInput {
  name: string;
  description?: string;
  icon?: string;
  provider?: string;
  model?: string;
  priority?: TaskPriority;
  loop?: string;
  agent?: string;
  /** Default successor chain to persist; inherited by work orders created from this template. */
  chain?: WorkOrderChainConfig;
  body: string;
}

export class TemplateNoteStore {
  parse(path: string, content: string): WorkOrderTemplate {
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      throw new Error('Missing YAML frontmatter');
    }
    if (parsed.frontmatter.type !== 'specorator-work-order-template') {
      throw new Error('Invalid template type');
    }
    if (parsed.frontmatter.schema_version !== 1) {
      throw new Error('Unsupported template schema_version');
    }

    const rawPriority = extractString(parsed.frontmatter, 'priority');
    const priority = rawPriority && VALID_PRIORITIES.has(rawPriority as TaskPriority) ? (rawPriority as TaskPriority) : undefined;

    return {
      path,
      name: extractString(parsed.frontmatter, 'name') ?? fileBaseName(path),
      description: extractString(parsed.frontmatter, 'description'),
      icon: extractString(parsed.frontmatter, 'icon'),
      provider: extractString(parsed.frontmatter, 'provider'),
      model: extractString(parsed.frontmatter, 'model'),
      priority,
      loop: extractString(parsed.frontmatter, 'loop'),
      agent: extractString(parsed.frontmatter, 'agent'),
      chain: parseChainConfig(parsed.frontmatter) ?? undefined,
      body: parsed.body.trim(),
    };
  }

  async list(vault: Vault, folder: string): Promise<{ templates: WorkOrderTemplate[]; warnings: string[] }> {
    const { items, warnings } = await listNoteDefinitions(vault, folder, (path, content) =>
      this.parse(path, content),
    );
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { templates: items, warnings };
  }

  build(input: SaveTemplateInput): string {
    const lines: string[] = [
      '---',
      'type: specorator-work-order-template',
      'schema_version: 1',
      `name: ${JSON.stringify(input.name)}`,
    ];
    if (input.description) lines.push(`description: ${JSON.stringify(input.description)}`);
    if (input.icon) lines.push(`icon: ${JSON.stringify(input.icon)}`);
    if (input.provider) lines.push(`provider: ${JSON.stringify(input.provider)}`);
    if (input.model) lines.push(`model: ${JSON.stringify(input.model)}`);
    if (input.priority) lines.push(`priority: ${input.priority}`);
    if (input.loop) lines.push(`loop: ${JSON.stringify(input.loop)}`);
    if (input.agent) lines.push(`agent: ${JSON.stringify(input.agent)}`);
    appendChainLines(lines, input.chain);
    lines.push('---', '', input.body.trim(), '');
    return lines.join('\n');
  }

  getFilePathForName(folder: string, name: string): string {
    return noteFilePathForName(folder, name, 'template');
  }

  save(
    vault: Vault,
    folder: string,
    input: SaveTemplateInput,
    originalPath?: string,
  ): Promise<string> {
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
