import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { LoopDefinition } from './loopTypes';

/**
 * Search/sort/tag accessors shared by the legacy LoopLibraryView and the Vue
 * Loops panel so both surfaces rank and filter loops identically.
 */
export const loopLibraryAccessors: LibraryItemAccessors<LoopDefinition> = {
  getName: (l) => l.name,
  getDescription: (l) => `${l.description ?? ''} ${l.useWhen ?? ''}`,
  getTags: (l) => l.tags ?? [],
  getUpdatedAt: (l) => l.updatedAt ?? 0,
};
