import { t } from '../../../i18n/i18n';
import type { MarketplaceItemType } from '../catalogTypes';

/**
 * Localized label per catalog item type. Built at call time (not module scope)
 * so a locale switch is reflected per mount — shared by the card's type badge
 * and the browse type-filter facet so the two can't drift. Record keys keep the
 * map exhaustive over the catalog's item types.
 */
export function marketplaceTypeLabels(): Record<MarketplaceItemType, string> {
  return {
    'quick-action': t('marketplace.type.quickAction'),
    agent: t('marketplace.type.agent'),
    loop: t('marketplace.type.loop'),
    template: t('marketplace.type.template'),
    skill: t('marketplace.type.skill'),
  };
}
