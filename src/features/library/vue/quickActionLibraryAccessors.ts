import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { QuickAction } from '../../quickActions/types';

/** getUpdatedAt() returns 0: QuickAction carries no mtime; the "updated" sort
 * degrades to stable order. */
export const quickActionLibraryAccessors: LibraryItemAccessors<QuickAction> = {
  getName: (a) => a.name,
  getDescription: (a) => a.description,
  getTags: (a) => a.tags ?? [],
  getUpdatedAt: () => 0,
};
