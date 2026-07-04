export const VIEW_TYPE_LIBRARY = 'specorator-library';

// 'quick-actions' lands as a real panel in the Quick Actions task; until then
// LibraryRoot's v-else fallback renders the Agents panel for it.
export type LibraryTab = 'agents' | 'skills' | 'loops' | 'quick-actions';
