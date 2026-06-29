import { type App, Modal } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { t } from '@/i18n/i18n';

export interface ModelLaunchModelOption { value: string; label: string }

export interface ModelLaunchProvider {
  id: ProviderId;
  displayName: string;
  models: ModelLaunchModelOption[];
}

export interface ModelLaunchModalOptions {
  app: App;
  title: string;
  presetProviderId: ProviderId;
  presetModel: string;
  enabledProviders: ModelLaunchProvider[];
  resolveDefaultModelForProvider: (providerId: ProviderId) => string;
  fallbackNotice?: { storedProviderLabel: string; storedModelLabel: string };
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/**
 * Provider+model confirmation modal shared by quick-action and loop prompting.
 * The per-consumer text is the `title` option; the chrome strings (Provider /
 * Model / Run / Cancel / fallback notice / "no providers") are intentionally
 * shared and live in the `quickActions.launchModal.*` i18n bucket because they
 * are generic across consumers. If a future consumer needs different chrome
 * copy, add an optional `labels` bag then — not before.
 *
 * The DOM classes and `data-testid`s retain the legacy `specorator-qa-*` prefix
 * (this modal was extracted from `QuickActionLaunchModal`) so existing CSS and
 * tests stay green across all consumers; the prefix is a shared token, not a
 * quick-action coupling — same rationale as the shared i18n bucket above.
 */
export class ModelLaunchModal extends Modal {
  private readonly options: ModelLaunchModalOptions;
  private providerSelect: HTMLSelectElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;

  constructor(options: ModelLaunchModalOptions) {
    super(options.app);
    this.options = options;
  }

  onOpen(): void {
    this.modalEl?.addClass?.('specorator-qa-launch-modal');
    const root = this.contentEl;
    root.empty();

    this.scope?.register?.([], 'Enter', (event) => {
      if (this.options.enabledProviders.length === 0) return;
      event.preventDefault();
      this.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')?.click();
    });

    this.titleEl.setText(this.options.title);

    if (this.options.fallbackNotice) {
      const notice = root.createDiv({
        cls: 'specorator-qa-launch-notice',
        attr: { 'data-testid': 'qa-fallback-notice', role: 'alert' },
      });
      notice.setText(t('quickActions.launchModal.fallbackNotice', {
        provider: this.options.fallbackNotice.storedProviderLabel,
        model: this.options.fallbackNotice.storedModelLabel,
      }));
    }

    if (this.options.enabledProviders.length === 0) {
      const emptyId = 'specorator-qa-empty-' + Math.random().toString(36).slice(2, 9);
      const empty = root.createDiv({
        cls: 'specorator-qa-launch-empty',
        attr: { id: emptyId, 'data-testid': 'qa-empty', 'aria-live': 'polite' },
      });
      empty.setText(t('quickActions.launchModal.noProvidersEnabled'));
      this.renderActions(root, /* runDisabled */ true, emptyId);
      return;
    }

    this.renderProviderRow(root);
    this.renderModelRow(root);
    this.renderActions(root, /* runDisabled */ false);
    this.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')?.focus();
  }

  onClose(): void {
    this.modalEl?.removeClass?.('specorator-qa-launch-modal');
    this.contentEl.empty();
    this.providerSelect = null;
    this.modelSelect = null;
  }

  private renderProviderRow(root: HTMLElement): void {
    const selectId = 'specorator-qa-provider-' + Math.random().toString(36).slice(2, 9);
    const row = root.createDiv({ cls: 'specorator-qa-launch-row' });
    row.createEl('label', { text: t('quickActions.launchModal.providerLabel'), attr: { for: selectId } });
    const select = row.createEl('select', { attr: { id: selectId, 'data-testid': 'qa-provider' } });
    for (const provider of this.options.enabledProviders) {
      const opt = select.createEl('option', { text: provider.displayName });
      opt.value = provider.id;
      if (provider.id === this.options.presetProviderId) opt.selected = true;
    }
    select.addEventListener('change', () => {
      const next = select.value;
      this.renderModelOptions(next, this.options.resolveDefaultModelForProvider(next));
      this.modelSelect?.focus();
    });
    this.providerSelect = select;
  }

  private renderModelRow(root: HTMLElement): void {
    const selectId = 'specorator-qa-model-' + Math.random().toString(36).slice(2, 9);
    const row = root.createDiv({ cls: 'specorator-qa-launch-row' });
    row.createEl('label', { text: t('quickActions.launchModal.modelLabel'), attr: { for: selectId } });
    const select = row.createEl('select', { attr: { id: selectId, 'data-testid': 'qa-model' } });
    this.modelSelect = select;
    this.renderModelOptions(this.options.presetProviderId, this.options.presetModel);
  }

  private renderModelOptions(providerId: ProviderId, selectedValue: string): void {
    if (!this.modelSelect) return;
    this.modelSelect.empty();
    const models = this.options.enabledProviders.find((p) => p.id === providerId)?.models ?? [];
    for (const model of models) {
      const opt = this.modelSelect.createEl('option', { text: model.label });
      opt.value = model.value;
      if (model.value === selectedValue) opt.selected = true;
    }
    if (this.modelSelect.value !== selectedValue && models.length > 0) {
      this.modelSelect.value = models[0].value;
    }
  }

  private renderActions(root: HTMLElement, runDisabled: boolean, describedById?: string): void {
    const actions = root.createDiv({ cls: 'specorator-qa-launch-actions' });
    const cancel = actions.createEl('button', {
      text: t('quickActions.launchModal.cancelButton'),
      attr: { 'data-testid': 'qa-cancel', type: 'button' },
    });
    cancel.addEventListener('click', () => this.close());

    const run = actions.createEl('button', {
      text: t('quickActions.launchModal.runButton'),
      attr: { 'data-testid': 'qa-run', type: 'button' },
    });
    run.addClass('mod-cta');
    run.disabled = runDisabled;
    if (runDisabled && describedById) run.setAttribute('aria-describedby', describedById);
    run.addEventListener('click', () => {
      if (!this.providerSelect || !this.modelSelect) return;
      this.options.onConfirm({ providerId: this.providerSelect.value, model: this.modelSelect.value });
      this.close();
    });
  }
}
