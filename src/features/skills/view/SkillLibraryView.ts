import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';

import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { renderLibraryNav } from '../../../shared/libraryNav';
import { LibraryListController, mountLibraryList, renderCloneButton, renderLibraryCardTags } from '../../../shared/libraryToolbar';
import { promptReason } from '../../../shared/modals/PromptModal';
import { withErrorNotice } from '../../../shared/uiAction';
import { extractStringArray, parseFrontmatter } from '../../../utils/frontmatter';
import { createLibraryCard, librarySlug, renderLibraryEmptyState, renderLibraryLoading, renderLibraryShell, uniqueChildDir } from '../../../utils/libraryView';
import { VIEW_TYPE_LIBRARY } from '../../library/viewType';
import { runVaultSkill } from '../../quickActions/skills/runVaultSkill';
import type { SkillTabEntry } from '../../quickActions/skills/types';
import { isCloneableSkillPath, SKILLS_DIR, skillTemplate, writeSkillClone } from '../skillCloning';
import { skillLibraryAccessors, type SkillLibraryRow, toSkillLibraryRows } from '../skillLibraryRows';
import { resolveSkillVaultPath } from '../skillPaths';
import { SkillEditorModal } from './SkillEditorModal';

export const VIEW_TYPE_SKILL_LIBRARY = 'specorator-skill-library';

export class SkillLibraryView extends ItemView {
  // mtime is populated by loadSkillTags; the accessor defers the lookup, so the
  // field-initialization order (skillMtime declared below) is safe.
  private readonly controller = new LibraryListController<SkillLibraryRow>(
    skillLibraryAccessors((id) => this.skillMtime.get(id) ?? 0),
  );
  private entryById = new Map<string, SkillTabEntry>();
  private skillMtime = new Map<string, number>();

  constructor(leaf: WorkspaceLeaf, private plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_SKILL_LIBRARY; }
  getDisplayText(): string { return t('skillLibrary.title'); }
  getIcon(): string { return 'book-open'; }

  async onOpen(): Promise<void> {
    if (this.plugin.settings.useVueLibrary) {
      await this.leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true, state: { tab: 'skills' } });
      return;
    }
    await this.render();
  }

  private resolveSkillReadPath(sourceFilePath: string): string | null {
    return resolveSkillVaultPath(this.plugin.app, sourceFilePath);
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

    mountLibraryList({ controller: this.controller, items: rows, toolbar, list, renderCard: (l, r) => this.renderSkillCard(l, r) });
  }

  /** Read frontmatter `tags` and file mtime for vault-file skills. Non-vault
   * skills surface a host-absolute `sourceFilePath`; `resolveSkillVaultPath`
   * relativizes an in-vault one so the adapter can read it — otherwise the
   * skill loses tags + sorts as `updated=0`. Genuinely out-of-vault
   * (home-scope) paths still fail and yield no tags/mtime. */
  private async loadSkillTags(entries: SkillTabEntry[]): Promise<Map<string, string[]>> {
    this.skillMtime.clear();
    const out = new Map<string, string[]>();
    await Promise.all(entries.map(async (e) => {
      if (!e.sourceFilePath) return;
      const readPath = this.resolveSkillReadPath(e.sourceFilePath);
      if (!readPath) return; // out-of-vault (home-scope) path → no tags/mtime
      try {
        const content = await this.plugin.vaultFileAdapter.read(readPath);
        const parsed = parseFrontmatter(content);
        const tags = parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
        if (tags && tags.length > 0) out.set(e.id, tags);
        const st = await this.plugin.vaultFileAdapter.stat(readPath);
        if (st) this.skillMtime.set(e.id, st.mtime);
      } catch { /* out-of-vault path or missing → no tags/mtime */ }
    }));
    return out;
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
    renderLibraryCardTags(body, row.tags ?? []);

    const promptBtn = actions.createEl('button', { cls: 'mod-cta', text: t('skillLibrary.prompt') });
    promptBtn.onclick = (e) => {
      e.stopPropagation();
      const entry = this.entryById.get(row.id);
      if (entry) {
        void runVaultSkill(this.plugin, entry, null);
      } else {
        // Rows derive from entries, so this is unreachable unless the entry map
        // desyncs — surface it instead of leaving a dead button.
        new Notice(t('skillLibrary.actionFailed'));
        this.plugin.logger.scope('skills').warn('skill prompt: no entry for row', row.id);
      }
    };
    if (isCloneableSkillPath(row.sourceFilePath)) {
      renderCloneButton(actions, (e) => { e.stopPropagation(); void this.cloneSkill(row); });
    }
  }

  private async cloneSkill(row: SkillLibraryRow): Promise<void> {
    if (!isCloneableSkillPath(row.sourceFilePath)) { new Notice(t('skillLibrary.readonlyNotice')); return; }
    const path = await writeSkillClone(this.plugin.vaultFileAdapter, row.sourceFilePath, row.name);
    // writeSkillClone keeps the clone under the SOURCE root (`.codex/skills/`
    // for Codex rows), so invalidate the owning provider — a catalog with its
    // own listing cache (Codex, 5s) must also force-reload or the re-render
    // below misses the clone until the TTL.
    this.plugin.events.emit('vaultSkill.changed', { providerId: row.providerId });
    await ProviderWorkspaceRegistry.getCommandCatalog(row.providerId)?.refresh();
    new Notice(t('skillLibrary.created', { path }));
    await this.render();
    // A skill's display name is its folder basename, so the clone is named after
    // its fresh `<slug>-copy` dir. Open the editor on that name (not the source
    // row's) so its fields match the file just written instead of the original.
    const cloneSlug = path.split('/').at(-2) ?? `${librarySlug(row.name)}-copy`;
    this.openEditor({
      id: `skill-${cloneSlug}`,
      name: cloneSlug,
      description: row.description,
      providerId: row.providerId,
      providerDisplayName: row.providerDisplayName,
      sourceFilePath: path,
      editable: true,
      tags: row.tags,
    });
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
      // New skills are created under `.claude/skills/` (SKILLS_DIR).
      providerId: 'claude',
      providerDisplayName: t('skillLibrary.providerVault'),
      sourceFilePath: path,
      editable: true,
    });
  }
}
