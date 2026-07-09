import { type App, Notice } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { LibraryEditorModal } from '../../../shared/modals/LibraryEditorModal';
import { normalizeStringArray, setFrontmatterList } from '../../../utils/frontmatter';
import { createModalCodeArea, librarySlug, renameLibraryItemDir, renderModalField, renderModalFooter, renderModalLabel, renderModalTextField } from '../../../utils/libraryView';
import { refreshSkillCatalogBestEffort } from '../refreshSkillCatalogBestEffort';
import type { SkillLibraryRow } from '../skillLibraryRows';
import { resolveSkillVaultPath } from '../skillPaths';

/**
 * Edits a skill's `SKILL.md` in a modal. Skill files live under provider
 * dot-folders (e.g. `.claude/skills/`) that Obsidian's vault index ignores, so
 * an editor tab can't open them. This modal reads/writes through
 * `vaultFileAdapter`. Read-only rows (no `sourceFilePath`) are shown but not
 * editable.
 */
export class SkillEditorModal extends LibraryEditorModal {
  private contentArea: HTMLTextAreaElement | null = null;
  private nameEl: HTMLInputElement | null = null;
  private tagsEl: HTMLInputElement | null = null;

  constructor(
    app: App,
    private readonly plugin: SpecoratorPlugin,
    private row: SkillLibraryRow,
    private readonly onSaved: () => void,
  ) {
    super(app);
  }

  protected title(): string {
    return this.row.name;
  }

  protected async renderBody(root: HTMLElement): Promise<void> {
    const meta = root.createDiv({ cls: 'specorator-library-modal-meta' });
    renderModalField(meta, t('skillLibrary.provider'), this.row.providerDisplayName);
    if (this.row.description) {
      meta.createDiv({ cls: 'specorator-library-modal-hint', text: this.row.description });
    }

    // Non-vault skills surface a host-absolute `sourceFilePath`; resolve the
    // vault-relative path the adapter can actually read/write. Out-of-vault
    // (home-scope) skills resolve to null and stay read-only — writing them
    // would create a bogus in-vault `/.../.codex/skills/...` tree.
    const writePath = this.resolveWritePath();
    if (!this.row.editable || !writePath) {
      root.createDiv({ cls: 'specorator-library-modal-hint', text: t('skillLibrary.readonlyNotice') });
      renderModalFooter(root, { closeLabel: t('skillLibrary.close'), onClose: () => this.close() });
      return;
    }

    this.nameEl = renderModalTextField(root, t('skillLibrary.nameField'), this.row.name);
    this.tagsEl = renderModalTextField(root, t('library.tagsField'), (this.row.tags ?? []).join(', '));
    renderModalLabel(root, t('skillLibrary.content'));
    const content = await this.plugin.vaultFileAdapter.read(writePath).catch(() => '');
    this.contentArea = createModalCodeArea(root, content, t('skillLibrary.content'));

    this.renderSaveFooter(root, {
      saveLabel: t('skillLibrary.save'),
      closeLabel: t('skillLibrary.close'),
      failedMessage: t('skillLibrary.actionFailed'),
      onSave: () => this.save(),
      onError: (e) => this.plugin.logger.scope('skills').error('skill save failed', e),
    });
  }

  /**
   * Vault-relative path the adapter can write, or null when the skill lives
   * outside the vault (home-scope) and must stay read-only.
   */
  private resolveWritePath(): string | null {
    if (!this.row.sourceFilePath) return null;
    return resolveSkillVaultPath(this.plugin.app, this.row.sourceFilePath);
  }

  private async save(): Promise<void> {
    const oldPath = this.resolveWritePath();
    if (!this.contentArea || !oldPath) return;
    const adapter = this.plugin.vaultFileAdapter;
    const currentSlug = oldPath.split('/').slice(-2, -1)[0];
    const newName = this.nameEl?.value.trim() || this.row.name;
    const newSlug = librarySlug(newName) || currentSlug;
    const tags = normalizeStringArray(this.tagsEl?.value) ?? [];
    const content = setFrontmatterList(this.contentArea.value, 'tags', tags);
    if (newSlug === currentSlug) {
      await adapter.write(oldPath, content);
    } else {
      // root is the directory holding the per-skill folder, e.g. `.claude/skills`.
      const root = oldPath.split('/').slice(0, -2).join('/');
      const newPath = await renameLibraryItemDir(adapter, oldPath, root, newSlug, content);
      this.row = { ...this.row, name: newName, sourceFilePath: newPath };
    }
    // Provider skill dot-folders (`.claude/`, `.codex/`) are ignored by Obsidian's
    // vault watcher, so this direct write/rename bypasses the provider-catalog
    // save seam. Emit the change for the aggregator bucket AND force-reload the
    // owning provider's catalog — otherwise a provider with its own listing cache
    // (Codex's 5s `listSkills`) serves the stale pre-rename path to the re-render
    // below, dropping the renamed skill until the TTL. A Codex edit must not
    // invalidate Claude, so both are keyed to the owning provider.
    this.plugin.events.emit('vaultSkill.changed', { providerId: this.row.providerId });
    await refreshSkillCatalogBestEffort(this.plugin, this.row.providerId);
    this.onSaved();
    new Notice(t('skillLibrary.saved', { name: this.row.name }));
    this.close();
  }
}
