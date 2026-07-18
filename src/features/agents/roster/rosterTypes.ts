import type { ProviderId } from '../../../core/providers/types';

export interface RosterAgentModelSelection {
  modelId: string;
  providerId: ProviderId;
}

export interface RosterAgent {
  id: string;                 // `roster:<slug>`
  name: string;
  description: string;        // routing blurb
  prompt: string;             // system prompt
  disallowedTools: string[];
  skills: string[];           // skill names from the skill catalog
  providerOverride?: ProviderId;
  modelSelection?: RosterAgentModelSelection;
  permissionMode?: string;
  roles: Array<'worker' | 'verifier'>;
  /** Freeform user tags for search + filtering in the roster. */
  tags?: string[];
  color?: string;
  initials?: string;
  icon?: string;
  /**
   * Set only on agents installed from the Marketplace (absent on hand-authored
   * ones). Records where the agent came from; `id` is the stable catalog id,
   * which survives a catalog-side display-name rebrand.
   */
  catalog?: {
    id: string;
    source?: string;
    author?: string;
    license?: string;
    version?: number;
  };
  createdAt: number;
  updatedAt: number;
}
