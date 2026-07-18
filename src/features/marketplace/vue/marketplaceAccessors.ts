import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { MarketplaceItem } from '../catalogTypes';

/** Feeds the shared list/search/filter engine (useLibraryList) over catalog items. */
export const marketplaceAccessors: LibraryItemAccessors<MarketplaceItem> = {
  getName: (item) => item.name,
  getDescription: (item) => item.description,
  getTags: (item) => item.tags,
  getUpdatedAt: (item) => item.version ?? 0,
};
