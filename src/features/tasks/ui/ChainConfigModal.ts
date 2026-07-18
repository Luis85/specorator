import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { type ChainTrigger, DEFAULT_CHAIN_TRIGGER, type WorkOrderChainConfig } from '../model/workOrderChain';
import { TemplateNoteStore } from '../templates/TemplateNoteStore';

/** Resolves to the new config, `null` to clear the chain, or `undefined` when cancelled. */
export type ChainConfigResult = WorkOrderChainConfig | null | undefined;

/** The modal's editable field set — plain strings so a blank field round-trips through `<input>`/`<textarea>` cleanly. */
export interface ChainConfigForm {
  template: string;
  title: string;
  objective: string;
  trigger: ChainTrigger;
}

/**
 * Config → form direction: seed the modal's fields from an existing chain (edit),
 * or blank fields + the default trigger when there is none (create). Exported
 * (pure, no DOM) so the prefill mapping — including the trigger — is covered
 * without exercising the `Modal` subclass.
 */
export function initialChainForm(current: WorkOrderChainConfig | undefined): ChainConfigForm {
  return {
    template: current?.template ?? '',
    title: current?.title ?? '',
    objective: current?.objective ?? '',
    trigger: current?.trigger ?? DEFAULT_CHAIN_TRIGGER,
  };
}

/**
 * Form → config direction: blank/whitespace-only fields collapse to `undefined`;
 * an all-blank form clears the chain. Exported (pure, no DOM) per the sibling
 * `initialChainForm` above, so both directions of the trigger mapping — and the
 * all-blank-clears-the-chain rule — are covered without exercising the `Modal`.
 */
export function buildChainConfig(form: ChainConfigForm): WorkOrderChainConfig | null {
  const template = form.template.trim() || undefined;
  const title = form.title.trim() || undefined;
  const objective = form.objective.trim() || undefined;
  if (!template && !title && !objective) return null;
  return { template, title, objective, trigger: form.trigger };
}

/**
 * Edits a work order's successor `WorkOrderChainConfig` (mirrors `LoopEditorModal`;
 * Obsidian-native per ADR 0006). Save resolves the collected config (or `null` when
 * every field is blank); Clear always resolves `null` regardless of the form state;
 * Cancel/close resolves `undefined`.
 */
export class ChainConfigModal extends Modal {
  private settled = false;
  private closed = false;

  constructor(
    app: App,
    private readonly plugin: SpecoratorPlugin,
    private readonly current: WorkOrderChainConfig | undefined,
    private readonly resolve: (result: ChainConfigResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t('tasks.chainConfig.title'));
    this.modalEl.addClass('specorator-sp-modal', 'specorator-chain-config-modal');
    this.contentEl.createEl('p', { text: t('tasks.chainConfig.lead') });

    const seed = initialChainForm(this.current);
    let template = seed.template;
    let title = seed.title;
    let objective = seed.objective;
    let trigger: ChainTrigger = seed.trigger;

    // Reserve the Template row's position with a placeholder container: the row
    // itself renders in once the async template list resolves, so it can't land
    // after the Save/Clear/Cancel buttons appended synchronously below.
    const templateRowEl = this.contentEl.createDiv();
    void this.renderTemplateRow(templateRowEl, template, (value) => { template = value; });

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.titleLabel'))
      .addText((tc) => tc
        .setPlaceholder(t('tasks.chainConfig.titlePlaceholder'))
        .setValue(title)
        .onChange((value) => { title = value; }));

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.objectiveLabel'))
      .addTextArea((ta) => {
        ta.setPlaceholder(t('tasks.chainConfig.objectivePlaceholder')).setValue(objective).onChange((value) => { objective = value; });
        ta.inputEl.rows = 3;
      });

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.triggerLabel'))
      .addDropdown((dd) => dd
        .addOption('done', t('tasks.chainConfig.triggerDone'))
        .addOption('review', t('tasks.chainConfig.triggerReview'))
        .setValue(trigger)
        .onChange((value) => { trigger = value === 'review' ? 'review' : 'done'; }));

    new Setting(this.contentEl)
      .addButton((btn) => btn
        .setButtonText(t('tasks.chainConfig.save'))
        .setCta()
        .onClick(() => this.settle(buildChainConfig({ template, title, objective, trigger }))))
      .addButton((btn) => btn
        .setButtonText(t('tasks.chainConfig.clear'))
        .setWarning()
        .onClick(() => this.settle(null)))
      .addButton((btn) => btn.setButtonText(t('tasks.chainConfig.cancel')).onClick(() => this.close()));
  }

  onClose(): void {
    this.closed = true;
    this.contentEl.empty();
    // Defer the cancel fallback so a synchronous Save/Clear choice in the same tick wins.
    window.setTimeout(() => {
      if (!this.settled) this.resolve(undefined);
    }, 0);
  }

  private async renderTemplateRow(
    container: HTMLElement,
    current: string,
    onChange: (value: string) => void,
  ): Promise<void> {
    const folder = this.plugin.settings.agentBoardTemplateFolder || 'Agent Board/templates';
    const { templates } = await new TemplateNoteStore().list(this.plugin.app.vault, folder);
    if (this.closed) return;
    new Setting(container)
      .setName(t('tasks.chainConfig.templateLabel'))
      .addDropdown((dd) => {
        dd.addOption('', t('tasks.chainConfig.templateNone'));
        for (const tpl of templates) dd.addOption(tpl.name, tpl.name);
        dd.setValue(current).onChange(onChange);
      });
  }

  private settle(result: ChainConfigResult): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(result);
    this.close();
  }
}

export function chooseChainConfig(
  plugin: SpecoratorPlugin,
  current: WorkOrderChainConfig | undefined,
): Promise<ChainConfigResult> {
  return new Promise((resolve) => new ChainConfigModal(plugin.app, plugin, current, resolve).open());
}
