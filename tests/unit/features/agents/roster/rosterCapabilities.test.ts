import {
  cloneRosterAgent,
  createRosterAgent,
  dedupeRosterId,
  rosterIdFromSlug,
  slugifyRosterName,
} from '@/features/agents/roster/rosterCapabilities';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';

describe('rosterCapabilities', () => {
  it('slugifies a name and forms a roster id', () => {
    expect(slugifyRosterName('My Cool Agent!')).toBe('my-cool-agent');
    expect(rosterIdFromSlug('my-cool-agent')).toBe('roster:my-cool-agent');
  });

  it('creates a default agent with required fields', () => {
    const a = createRosterAgent('Reviewer', 1000);
    expect(a.id).toBe('roster:reviewer');
    expect(a.name).toBe('Reviewer');
    expect(a.roles).toEqual(['worker']);
    expect(a.skills).toEqual([]);
    expect(a.createdAt).toBe(1000);
    expect(a.updatedAt).toBe(1000);
  });

  it('dedupes a roster id against existing ids', () => {
    expect(dedupeRosterId('roster:new-agent', [])).toBe('roster:new-agent');
    expect(dedupeRosterId('roster:new-agent', ['roster:new-agent'])).toBe('roster:new-agent-2');
    expect(
      dedupeRosterId('roster:new-agent', ['roster:new-agent', 'roster:new-agent-2']),
    ).toBe('roster:new-agent-3');
  });

  it('clones an agent with a fresh id/name and drops catalog provenance', () => {
    const original: RosterAgent = {
      ...createRosterAgent('Reviewer', 1000),
      catalog: { id: 'agents/reviewer', author: 'Specorator', license: 'MIT' },
    };
    const clone = cloneRosterAgent(original, [original], 2000);

    expect(clone.id).not.toBe(original.id);
    expect(clone.name).toBe('Reviewer copy');
    // A clone is user-owned, not the catalog item — provenance must not carry over,
    // or it would shadow the original in the Marketplace's installed detection
    // (installedAgentKeys matches on catalog id) after the original is deleted.
    expect(clone.catalog).toBeUndefined();
  });
});
