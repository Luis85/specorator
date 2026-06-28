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
    resolveDefaultModelForProvider: () => 'claude-sonnet-4-5',
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
});
