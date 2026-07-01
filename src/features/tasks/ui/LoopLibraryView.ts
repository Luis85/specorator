import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { renderLibraryNav } from '../../../shared/libraryNav';
import { LibraryListController, mountLibraryList, renderCloneButton, renderLibraryCardTags } from '../../../shared/libraryToolbar';
import { confirm } from '../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../shared/uiAction';
import { createLibraryCard, renderLibraryEmptyState, renderLibraryLoading, renderLibraryShell } from '../../../utils/libraryView';
import { launchLoopPrompt } from '../../quickActions/launchLoopPrompt';
import { installPresetLoopsWithNotice } from '../loops/installPresetLoops';
import { LoopNoteStore } from '../loops/LoopNoteStore';
import type { LoopDefinition } from '../loops/loopTypes';
import { LoopEditorModal } from './LoopEditorModal';

export const VIEW_TYPE_LOOP_LIBRARY = 'specorator-loop-library';

export class LoopLibraryView extends ItemView {
  private readonly store = new LoopNoteStore();
  private readonly controller = new LibraryListController<LoopDefinition>({
    getName: (l) => l.name,
    getDescription: (l) => `${l.description ?? ''} ${l.useWhen ?? ''}`,
    getTags: (l) => l.tags ?? [],
    getUpdatedAt: (l) => l.updatedAt ?? 0,
  });

  constructor(leaf: WorkspaceLeaf, private plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_LOOP_LIBRARY; }
  getDisplayText(): string { return t('loopLibrary.title'); }
  getIcon(): string { return 'repeat'; }

  async onOpen(): Promise<void> {
    await this.render();
  }

  private folder(): string {
    return this.plugin.settings.agentBoardLoopFolder || 'Agent Board/loops';
  }

  private async render(): Promise<void> {
    const { actions, toolbar, list } = renderLibraryShell(this.contentEl, t('loopLibrary.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_LOOP_LIBRARY));
    const newBtn = actions.createEl('button', { cls: 'mod-cta', text: t('loopLibrary.newLoop') });
    newBtn.onclick = () => this.openEditorSafely(null);
    const installBtn = actions.createEl('button', { text: t('loopLibrary.installStarter') });
    installBtn.onclick = () => void withErrorNotice(() => this.installStarters(), t('loopLibrary.actionFailed'), (e) => this.fail(e));

    renderLibraryLoading(list, t('common.loading'));
    const { loops } = await this.store.list(this.plugin.app.vault, this.folder());
    list.empty();
    if (loops.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'repeat',
        message: t('loopLibrary.empty'),
        actionLabel: t('loopLibrary.newLoop'),
        onAction: () => this.openEditorSafely(null),
      });
      return;
    }

    mountLibraryList({ controller: this.controller, items: loops, toolbar, list, renderCard: (l, lp) => this.renderLoopCard(l, lp) });
  }

  private renderLoopCard(list: HTMLElement, loop: LoopDefinition): void {
    const { body, actions: cardActions } = createLibraryCard(list, loop.name, {
      interactive: { onActivate: () => this.openEditorSafely(loop), ariaLabel: loop.name },
    });
    if (loop.description) {
      body.createDiv({ cls: 'specorator-library-card-desc', text: loop.description });
    }
    if (loop.useWhen) {
      body.createDiv({ cls: 'specorator-library-card-desc', text: `${t('loopLibrary.useWhenLabel')} ${loop.useWhen}` });
    }
    renderLibraryCardTags(body, loop.tags ?? []);

    const promptBtn = cardActions.createEl('button', { cls: 'mod-cta', text: t('loopLibrary.prompt') });
    promptBtn.onclick = (e) => { e.stopPropagation(); launchLoopPrompt(this.plugin, loop); };

    renderCloneButton(cardActions, (e) => { e.stopPropagation(); void withErrorNotice(() => this.cloneLoop(loop), t('loopLibrary.actionFailed'), (err) => this.fail(err)); });

    const deleteBtn = cardActions.createEl('button', { cls: 'specorator-library-card-delete', text: t('loopLibrary.delete') });
    deleteBtn.onclick = (e) => { e.stopPropagation(); void withErrorNotice(() => this.deleteLoop(loop), t('loopLibrary.actionFailed'), (err) => this.fail(err)); };
  }

  private async cloneLoop(loop: LoopDefinition): Promise<void> {
    const vault = this.plugin.app.vault;
    const folder = this.folder();
    let cloneName = `${loop.name} copy`;
    for (let n = 2; vault.getAbstractFileByPath(this.store.getFilePathForName(folder, cloneName)); n += 1) {
      cloneName = `${loop.name} copy ${n}`;
    }
    await this.store.save(vault, folder, { ...loop, name: cloneName });
    await this.render();
  }

  private async installStarters(): Promise<void> {
    await installPresetLoopsWithNotice(this.plugin);
    await this.render();
  }

  private openEditorSafely(existing: LoopDefinition | null): void {
    new LoopEditorModal(this.plugin.app, existing, async (payload) => {
      await this.store.save(this.plugin.app.vault, this.folder(), payload, payload.originalPath);
      await this.render();
    }).open();
  }

  private async deleteLoop(loop: LoopDefinition): Promise<void> {
    const ok = await confirm(
      this.plugin.app,
      t('loopLibrary.deleteConfirm', { name: loop.name }),
      t('loopLibrary.delete'),
    );
    if (!ok) return;
    await this.store.delete(this.plugin.app, loop.path);
    new Notice(t('loopLibrary.deleted', { name: loop.name }));
    await this.render();
  }

  private fail(error: unknown): void {
    this.plugin.logger.scope('tasks').error('loop library action failed', error);
  }
}
