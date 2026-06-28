/**
 * @jest-environment jsdom
 */
import '@test/setup/obsidianDom';

import { ModelLaunchModal, type ModelLaunchModalOptions } from '@/shared/modals/ModelLaunchModal';

jest.mock('obsidian', () => {
  class Modal {
    contentEl = document.createElement('div');
    modalEl = document.createElement('div');
    titleEl = document.createElement('div');
    scope = { register: jest.fn() };
    constructor(public app: unknown) {}
    open(): void { this.onOpen(); }
    close(): void { this.onClose(); }
    onOpen(): void {}
    onClose(): void {}
  }
  return { Modal };
});

jest.mock('@/i18n/i18n', () => {
  const en = jest.requireActual('@/i18n/locales/en.json') as Record<string, unknown>;
  const lookup = (key: string): string => {
    const parts = key.split('.');
    let cur: unknown = en;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else { return key; }
    }
    return typeof cur === 'string' ? cur : key;
  };
  return {
    t: (key: string, vars?: Record<string, string>) => {
      const template = lookup(key);
      if (!vars) return template;
      return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), template);
    },
  };
});

const TWO_PROVIDERS: ModelLaunchModalOptions['enabledProviders'] = [
  { id: 'claude', displayName: 'Claude', models: [
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-5', label: 'Opus 4.5' },
  ] },
  { id: 'codex', displayName: 'Codex', models: [
    { value: 'gpt-5-codex', label: 'gpt-5-codex' },
  ] },
];

function makeOptions(over: Partial<ModelLaunchModalOptions> = {}): ModelLaunchModalOptions {
  return {
    app: {} as never,
    title: 'Custom Title',
    presetProviderId: 'claude',
    presetModel: 'claude-sonnet-4-5',
    enabledProviders: [
      { id: 'claude', displayName: 'Claude', models: [
        { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
        { value: 'claude-opus-4-5', label: 'Opus 4.5' },
      ] },
    ],
    resolveDefaultModelForProvider: (id) => (id === 'claude' ? 'claude-sonnet-4-5' : 'gpt-5-codex'),
    onConfirm: jest.fn(),
    ...over,
  };
}

describe('ModelLaunchModal', () => {
  it('sets the title from options', () => {
    const modal = new ModelLaunchModal(makeOptions({ title: 'Pick a model' }));
    modal.open();
    expect(modal.titleEl.textContent).toBe('Pick a model');
  });

  it('Run fires onConfirm with the selected provider+model', () => {
    const opts = makeOptions();
    const modal = new ModelLaunchModal(opts);
    modal.open();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')!.click();
    expect(opts.onConfirm).toHaveBeenCalledWith({ providerId: 'claude', model: 'claude-sonnet-4-5' });
  });

  it('disables Run when no providers enabled', () => {
    const modal = new ModelLaunchModal(makeOptions({ enabledProviders: [] }));
    modal.open();
    expect(modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')!.disabled).toBe(true);
  });

  it('lists only enabled providers', () => {
    const modal = new ModelLaunchModal(makeOptions({ enabledProviders: TWO_PROVIDERS }));
    modal.open();
    const providerSelect = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="qa-provider"]')!;
    const ids = Array.from(providerSelect.options).map((o) => o.value);
    expect(ids).toEqual(['claude', 'codex']);
  });

  it('switching provider resets model to that provider default', () => {
    const modal = new ModelLaunchModal(makeOptions({ enabledProviders: TWO_PROVIDERS }));
    modal.open();
    const providerSelect = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="qa-provider"]')!;
    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="qa-model"]')!;
    providerSelect.value = 'codex';
    providerSelect.dispatchEvent(new Event('change'));
    expect(modelSelect.value).toBe('gpt-5-codex');
  });

  it('shows fallback notice when present', () => {
    const modal = new ModelLaunchModal(makeOptions({
      fallbackNotice: { storedProviderLabel: 'Codex', storedModelLabel: 'gpt-5-codex' },
    }));
    modal.open();
    const notice = modal.contentEl.querySelector('[data-testid="qa-fallback-notice"]');
    expect(notice?.textContent).toContain('Codex');
    expect(notice?.textContent).toContain('gpt-5-codex');
  });

  it('hides fallback notice when absent', () => {
    const modal = new ModelLaunchModal(makeOptions());
    modal.open();
    expect(modal.contentEl.querySelector('[data-testid="qa-fallback-notice"]')).toBeNull();
  });

  it('Cancel does not fire onConfirm', () => {
    const opts = makeOptions();
    const modal = new ModelLaunchModal(opts);
    modal.open();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-cancel"]')!.click();
    expect(opts.onConfirm).not.toHaveBeenCalled();
  });
});
