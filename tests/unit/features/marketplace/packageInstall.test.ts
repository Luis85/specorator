import type { MarketplaceItem, MarketplaceItemType } from '@/features/marketplace/catalogTypes';
import type { InstallOutcome } from '@/features/marketplace/installerTypes';
import { installPackage, type PackageInstallContext } from '@/features/marketplace/packageInstall';
import type { SkillInstallTarget } from '@/features/marketplace/skillInstallTargets';

function item(id: string, type: MarketplaceItemType): MarketplaceItem {
  return { id, type, name: id.split('/')[1], description: '', path: `${id}.md`, tags: [] };
}

const target: SkillInstallTarget = { provider: 'claude', scope: 'project' };

/** A context that records the order of every write, with per-item outcomes. */
function makeContext(outcomes: Record<string, InstallOutcome | Error> = {}) {
  const writes: string[] = [];
  const fetched: string[] = [];
  const boundSkillsFor: Record<string, string[]> = {};
  const settle = (id: string): Promise<InstallOutcome> => {
    const outcome = outcomes[id];
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(outcome ?? 'installed');
  };
  const ctx: PackageInstallContext = {
    fetchBody: async (member, source) => {
      fetched.push(`${member.id}@${source}`);
      return `BODY:${member.id}`;
    },
    installSkill: async (member, body, chosen) => {
      writes.push(`skill:${member.id}:${body}:${chosen.provider}/${chosen.scope}`);
      return settle(member.id);
    },
    installItem: async (member, body, options) => {
      writes.push(`item:${member.id}:${body}`);
      boundSkillsFor[member.id] = [...(options.boundSkills ?? [])];
      return settle(member.id);
    },
    boundSkills: (member) => (member.type === 'agent' ? ['brief', 'raid'] : []),
    requireSkillTarget: (chosen) => {
      if (!chosen) throw new Error('no target');
      return chosen;
    },
  };
  return { ctx, writes, fetched, boundSkillsFor };
}

describe('installPackage', () => {
  const agent = item('agents/pm', 'agent');
  const brief = item('skills/brief', 'skill');
  const raid = item('skills/raid', 'skill');

  it('writes every dependency before the item itself', async () => {
    const { ctx, writes } = makeContext();
    const result = await installPackage(agent, 'REVIEWED', [brief, raid], target, 'https://src/', ctx);
    expect(writes).toEqual([
      'skill:skills/brief:BODY:skills/brief:claude/project',
      'skill:skills/raid:BODY:skills/raid:claude/project',
      'item:agents/pm:REVIEWED',
    ]);
    expect(result).toEqual({
      outcome: 'installed',
      installed: 2,
      skipped: 0,
      written: ['skills/brief', 'skills/raid', 'agents/pm'],
    });
  });

  it('installs the REVIEWED body for the root and fetches each dependency from the snapshotted source', async () => {
    const { ctx, fetched, writes } = makeContext();
    await installPackage(agent, 'REVIEWED', [brief], target, 'https://snapshot/', ctx);
    // The root's body is never re-fetched (the "install what you reviewed" contract);
    // a dependency is listed but not previewed, so it IS fetched — from the source
    // the install snapshotted, so one package can't span two catalogs.
    expect(fetched).toEqual(['skills/brief@https://snapshot/']);
    expect(writes).toContain('item:agents/pm:REVIEWED');
  });

  it('counts dependencies that were already present as skipped', async () => {
    const { ctx } = makeContext({ 'skills/brief': 'skipped', 'agents/pm': 'skipped' });
    const result = await installPackage(agent, 'REVIEWED', [brief, raid], target, 'https://src/', ctx);
    expect(result).toMatchObject({ outcome: 'skipped', installed: 1, skipped: 1 });
  });

  it('grants the agent its package skills', async () => {
    const { ctx, boundSkillsFor } = makeContext();
    await installPackage(agent, 'REVIEWED', [brief, raid], target, 'https://src/', ctx);
    expect(boundSkillsFor['agents/pm']).toEqual(['brief', 'raid']);
  });

  it('fails BEFORE the item when a dependency fails, so it is never installed half-bound', async () => {
    const { ctx, writes } = makeContext({ 'skills/raid': new Error('network down') });
    await expect(
      installPackage(agent, 'REVIEWED', [brief, raid], target, 'https://src/', ctx),
    ).rejects.toThrow('network down');
    // brief landed (deliberately not rolled back — it is a valid vault item on its
    // own, and a retry skips it); the agent was never written.
    expect(writes.some((w) => w.startsWith('item:agents/pm'))).toBe(false);
    expect(writes.some((w) => w.startsWith('skill:skills/brief'))).toBe(true);
  });

  it('refuses a package containing skills when no target was chosen', async () => {
    const { ctx, writes } = makeContext();
    await expect(
      installPackage(agent, 'REVIEWED', [brief], undefined, 'https://src/', ctx),
    ).rejects.toThrow('no target');
    expect(writes).toEqual([]); // nothing written, not even the first dependency
  });
});
