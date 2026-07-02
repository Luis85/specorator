export const VIEW_TYPE_LIBRARY = 'specorator-library';

export type LibraryTab = 'agents' | 'skills' | 'loops';

/** Maps each legacy standalone library view type to its unified-view tab. */
export const LEGACY_VIEW_TYPE_TO_TAB: Readonly<Record<string, LibraryTab>> = {
  'specorator-agent-roster': 'agents',
  'specorator-skill-library': 'skills',
  'specorator-loop-library': 'loops',
};

/** Inverse of the above — used by the flag-off rollback redirect. */
export const TAB_TO_LEGACY_VIEW_TYPE: Readonly<Record<LibraryTab, string>> = {
  agents: 'specorator-agent-roster',
  skills: 'specorator-skill-library',
  loops: 'specorator-loop-library',
};
