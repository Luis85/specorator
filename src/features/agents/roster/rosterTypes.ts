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
  color?: string;
  initials?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}
