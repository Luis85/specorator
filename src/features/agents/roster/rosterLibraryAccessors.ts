import { t } from '../../../i18n/i18n';
import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { RosterAgent } from './rosterTypes';

/** Localized display label for a roster role chip / filter tag. */
export function rosterRoleLabel(role: 'worker' | 'verifier'): string {
  return role === 'verifier' ? t('agentRoster.roleVerifier') : t('agentRoster.roleWorker');
}

/**
 * Search/sort/tag accessors shared by the legacy AgentRosterView and the Vue
 * Agents panel so both surfaces rank and filter agents identically. Role
 * labels count as filterable tags alongside the user's freeform tags.
 */
export const rosterLibraryAccessors: LibraryItemAccessors<RosterAgent> = {
  getName: (a) => a.name,
  getDescription: (a) => a.description,
  getTags: (a) => [...a.roles.map(rosterRoleLabel), ...(a.tags ?? [])],
  getUpdatedAt: (a) => a.updatedAt,
};
