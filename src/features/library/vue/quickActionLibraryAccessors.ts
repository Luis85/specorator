import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { QuickAction } from '../../quickActions/types';

/** getUpdatedAt() reads the vault file mtime QuickActionStorage.loadAll
 * attaches; 0 only for unstat-able files (they sink to the bottom of the
 * "Recently updated" sort). */
export const quickActionLibraryAccessors: LibraryItemAccessors<QuickAction> = {
  getName: (a) => a.name,
  getDescription: (a) => a.description,
  getTags: (a) => a.tags ?? [],
  getUpdatedAt: (a) => a.mtime ?? 0,
};
