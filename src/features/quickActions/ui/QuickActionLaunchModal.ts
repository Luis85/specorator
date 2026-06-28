import type { App } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { t } from '@/i18n/i18n';
import {
  ModelLaunchModal,
  type ModelLaunchModelOption,
  type ModelLaunchProvider,
} from '@/shared/modals/ModelLaunchModal';

import type { QuickAction } from '../types';

// Back-compat re-exports for existing importers/tests.
export type QuickActionLaunchModelOption = ModelLaunchModelOption;
export type QuickActionLaunchProvider = ModelLaunchProvider;

export interface QuickActionLaunchModalOptions {
  app: App;
  action: QuickAction;
  presetProviderId: ProviderId;
  presetModel: string;
  enabledProviders: ModelLaunchProvider[];
  resolveDefaultModelForProvider: (providerId: ProviderId) => string;
  fallbackNotice?: { storedProviderLabel: string; storedModelLabel: string };
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/** Quick-action-flavored launch modal: derives the title from the action name. */
export class QuickActionLaunchModal extends ModelLaunchModal {
  constructor(options: QuickActionLaunchModalOptions) {
    const rawName = options.action.name?.trim();
    const name = rawName && rawName.length > 0 ? rawName : t('quickActions.launchModal.untitledFallback');
    super({ ...options, title: t('quickActions.launchModal.title', { name }) });
  }
}
