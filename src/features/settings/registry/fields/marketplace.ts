import { t } from '../../../../i18n/i18n';
import type { SettingsRegistry } from '../SettingsRegistry';

export function registerMarketplaceTabFields(r: SettingsRegistry): void {
  r.registerTab({
    id: 'marketplace',
    label: t('marketplace.settings.tab'),
    order: 75,
    visible: () => true,
  });

  r.registerSection({
    id: 'network',
    tabId: 'marketplace',
    label: t('marketplace.settings.networkSection'),
    order: 10,
  });

  r.registerField({
    id: 'marketplaceNetworkEnabled',
    tabId: 'marketplace',
    sectionId: 'network',
    label: t('marketplace.settings.enable.name'),
    description: t('marketplace.settings.enable.desc'),
    type: { kind: 'toggle' },
    default: false,
  });

  r.registerField({
    id: 'marketplaceSourceUrl',
    tabId: 'marketplace',
    sectionId: 'network',
    label: t('marketplace.settings.source.name'),
    description: t('marketplace.settings.source.desc'),
    type: { kind: 'text', placeholder: 'https://raw.githubusercontent.com/...' },
    default: '',
    visible: (s) => s.marketplaceNetworkEnabled === true,
  });
}
