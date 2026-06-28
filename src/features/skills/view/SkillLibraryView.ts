import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { renderLibraryNav } from '../../../shared/libraryNav';
import { LibraryListController } from '../../../shared/libraryToolbar';
import { promptReason } from '../../../shared/modals/PromptModal';
import { withErrorNotice } from '../../../shared/uiAction';
import { extractStringArray, parseFrontmatter } from '../../../utils/frontmatter';
import { createLibraryCard, librarySlug, renderLibraryEmptyState, renderLibraryLoading, renderLibraryShell, uniqueChildDir } from '../../../utils/libraryView';
import { runVaultSkill } from '../../quickActions/skills/runVaultSkill';
import type { SkillTabEntry } from '../../quickActions/skills/types';
import { type SkillLibraryRow, toSkillLibraryRows } from '../skillLibraryRows';
import { SkillEditorModal } from './SkillEditorModal';

export const VIEW_TYPE_SKILL_LIBRARY = 'specorator-skill-library';

// Canonical vault skill location (Claude-compatible). Kept local so the view
// stays in the features layer rather than importing provider storage.
const SKILLS_DIR = '.claude/skills';

function skillTemplate(name: string): string {
  return `---
description: Describe what this skill does and when to use it.
---

# ${name}

Write the skill instructions here.
`;
}

export class SkillLibraryView extends ItemView {
  private readonly controller = new LibraryListController<SkillLibraryRow>({
    getName: (r) => r.name,
    getDescription: (r) => r.description,
    getTags: (r) => r.tags ?? [],
    getUpdatedAt: () => 0, // skills have no in-app mtime; "recently updated" falls back to name order
  });
  private entryById = new Map<string, SkillTabEntry>();

  constructor(leaf: WorkspaceLeaf, private plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_SKILL_LIBRARY; }
  getDisplayText(): string { return t('skillLibrary.title'); }
  getIcon(): string { return 'book-open'; }

  async onOpen(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    const { actions, toolbar, list } = renderLibraryShell(this.contentEl, t('skillLibrary.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_SKILL_LIBRARY));
    const newBtn = actions.createEl('button', { cls: 'mod-cta', text: t('skillLibrary.newSkill') });
    newBtn.onclick = () => this.createSkillSafely();

    renderLibraryLoading(list, t('common.loading'));
    const entries = (await this.plugin.vaultSkillAggregator?.listAll()) ?? [];
    this.entryById = new Map(entries.map((e) => [e.id, e]));
    const tagsById = await this.loadSkillTags(entries);
    list.empty();
    const rows = toSkillLibraryRows(entries, tagsById);
    if (rows.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'book-open',
        message: t('skillLibrary.empty'),
        actionLabel: t('skillLibrary.newSkill'),
        onAction: () => this.createSkillSafely(),
      });
      return;
    }

    this.controller.setItems(rows);
    this.controller.renderToolbar(toolbar, {
      searchPlaceholder: t('library.searchPlaceholder'),
      sortLabel: t('library.sortLabel'),
      sortName: t('library.sortName'),
      sortUpdated: t('library.sortUpdated'),
      resetFilters: t('library.resetFilters'),
    }, () => this.renderRows(list));
    this.renderRows(list);
  }

  /** Read frontmatter `tags` for vault-file skills. Home/abs paths fail the
   * vault read and yield no tags (documented limitation). */
  private async loadSkillTags(entries: SkillTabEntry[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    await Promise.all(entries.map(async (e) => {
      if (!e.sourceFilePath) return;
      try {
        const content = await this.plugin.vaultFileAdapter.read(e.sourceFilePath);
        const parsed = parseFrontmatter(content);
        const tags = parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
        if (tags && tags.length > 0) out.set(e.id, tags);
      } catch { /* home-scope/abs path or missing → no tags */ }
    }));
    return out;
  }

  private renderRows(list: HTMLElement): void {
    list.empty();
    const rows = this.controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const row of rows) this.renderSkillCard(list, row);
  }

  private renderSkillCard(list: HTMLElement, row: SkillLibraryRow): void {
    const { nameRow, body, actions } = createLibraryCard(list, row.name, {
      interactive: { onActivate: () => this.openEditor(row), ariaLabel: row.name },
    });
    nameRow.createSpan({ cls: 'specorator-library-chip specorator-library-chip-muted', text: row.providerDisplayName });
    if (!row.editable) {
      // Outline (not filled) so the read-only marker reads as distinct from
      // the adjacent filled provider chip rather than merging into one gray pair.
      nameRow.createSpan({ cls: 'specorator-library-chip specorator-library-chip-outline', text: t('skillLibrary.readOnlyNote') });
    }
    body.createDiv({ cls: 'specorator-library-card-desc', text: row.description });
    const caps = body.createDiv({ cls: 'specorator-roster-card-caps' });
    for (const tag of row.tags ?? []) caps.createSpan({ cls: 'specorator-library-chip', text: tag });

    const promptBtn = actions.createEl('button', { cls: 'mod-cta', text: t('skillLibrary.prompt') });
    promptBtn.onclick = (e) => {
      e.stopPropagation();
      const entry = this.entryById.get(row.id);
      if (entry) void runVaultSkill(this.plugin, entry, null);
    };
    const cloneBtn = actions.createEl('button', {
      cls: 'specorator-library-card-icon',
      attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
    });
    setIcon(cloneBtn, 'copy');
    cloneBtn.onclick = (e) => { e.stopPropagation(); void this.cloneSkill(row); };
  }

  private async cloneSkill(row: SkillLibraryRow): Promise<void> {
    if (!row.sourceFilePath) { new Notice(t('skillLibrary.readonlyNotice')); return; }
    const adapter = this.plugin.vaultFileAdapter;
    const root = row.sourceFilePath.split('/').slice(0, -2).join('/'); // `.claude/skills`
    const content = await adapter.read(row.sourceFilePath).catch(() => '');
    const dir = await uniqueChildDir(adapter, root, `${librarySlug(row.name)}-copy`);
    const path = `${dir}/SKILL.md`;
    await adapter.write(path, content);
    this.plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    new Notice(t('skillLibrary.created', { path }));
    await this.render();
  }

  private createSkillSafely(): void {
    void withErrorNotice(
      () => this.createSkill(),
      t('skillLibrary.actionFailed'),
      (e) => this.plugin.logger.scope('skills').error('skill library action failed', e),
    );
  }

  private openEditor(row: SkillLibraryRow): void {
    new SkillEditorModal(this.plugin.app, this.plugin, row, () => void this.render()).open();
  }

  private async createSkill(): Promise<void> {
    const name = await promptReason(this.plugin.app, t('skillLibrary.namePrompt'));
    if (!name) return;
    const dir = await uniqueChildDir(this.plugin.vaultFileAdapter, SKILLS_DIR, librarySlug(name) || 'skill');
    const path = `${dir}/SKILL.md`;
    await this.plugin.vaultFileAdapter.write(path, skillTemplate(name));
    // `.claude/` is a dot-folder Obsidian's vault watcher ignores, so this direct
    // write bypasses the provider-catalog event seam. Invalidate the aggregator's
    // 'claude' bucket explicitly so the re-render below re-fetches the new skill.
    this.plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    new Notice(t('skillLibrary.created', { path }));
    await this.render();
    this.openEditor({
      id: `skill-${dir.split('/').pop()}`,
      name,
      description: '',
      providerDisplayName: t('skillLibrary.providerVault'),
      sourceFilePath: path,
      editable: true,
    });
  }
}
