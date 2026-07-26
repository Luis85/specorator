import { createRosterAgent } from '@/features/agents/roster/rosterCapabilities';
import { isRosterAgentDirty } from '@/features/agents/roster/rosterDirty';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';

const base = () => ({ ...createRosterAgent('Reviewer', 1), prompt: 'p', skills: ['s1'], roles: ['worker' as const] });

describe('isRosterAgentDirty', () => {
  it('is false for an unchanged copy', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, skills: [...a.skills], roles: [...a.roles] })).toBe(false);
  });

  it('detects a scalar field change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, name: 'New' })).toBe(true);
    expect(isRosterAgentDirty(a, { ...a, prompt: 'changed' })).toBe(true);
    expect(isRosterAgentDirty(a, { ...a, color: 'var(--color-red)' })).toBe(true);
  });

  it('detects skills/roles set changes regardless of order', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, skills: ['s1', 's2'] })).toBe(true);
    expect(isRosterAgentDirty(a, { ...a, roles: ['worker', 'verifier'] })).toBe(true);
  });

  it('treats set fields as order-insensitive', () => {
    const a = { ...base(), skills: ['s1', 's2'] };
    expect(isRosterAgentDirty(a, { ...a, skills: ['s2', 's1'] })).toBe(false);
  });

  it('detects model selection add/remove/change', () => {
    const a = base();
    const withModel = { ...a, modelSelection: { modelId: 'm', providerId: 'claude' as const } };
    expect(isRosterAgentDirty(a, withModel)).toBe(true);
    expect(isRosterAgentDirty(withModel, a)).toBe(true);
    expect(isRosterAgentDirty(withModel, { ...withModel, modelSelection: { modelId: 'm2', providerId: 'claude' as const } })).toBe(true);
  });

  it('detects an icon change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, icon: 'wrench' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, icon: 'wrench' }, { ...a, icon: 'bug' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, icon: 'wrench' }, { ...a, icon: 'wrench' })).toBe(false);
  });

  it('detects a voice change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, voice: 'Warm and concise' })).toBe(true);
  });

  it('detects an avatarEmoji change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, avatarEmoji: '🔬' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, avatarEmoji: '🔬' }, { ...a, avatarEmoji: '🔬' })).toBe(false);
  });

  it('detects an avatarImage change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, avatarImage: 'avatars/a.png' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, avatarImage: 'avatars/a.png' }, { ...a, avatarImage: 'avatars/b.png' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, avatarImage: 'avatars/a.png' }, { ...a, avatarImage: 'avatars/a.png' })).toBe(false);
  });
});

function agent(over: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:a', name: 'A', description: '', prompt: '', disallowedTools: [], skills: [],
    roles: [], createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('isRosterAgentDirty tags', () => {
  it('is dirty when tags differ', () => {
    expect(isRosterAgentDirty(agent({ tags: ['x'] }), agent({ tags: ['y'] }))).toBe(true);
  });
  it('is clean when tags match (order-insensitive)', () => {
    expect(isRosterAgentDirty(agent({ tags: ['x', 'y'] }), agent({ tags: ['y', 'x'] }))).toBe(false);
  });
  it('treats undefined and empty as equal', () => {
    expect(isRosterAgentDirty(agent({ tags: undefined }), agent({ tags: [] }))).toBe(false);
  });
});
