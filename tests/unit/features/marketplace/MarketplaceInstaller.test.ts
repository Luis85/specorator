import type { Vault } from 'obsidian';

import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { AgentRosterStore } from '@/features/agents/roster/AgentRosterStore';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import { installMarketplaceItem, isItemInstalled, type MarketplaceInstallDeps } from '@/features/marketplace/MarketplaceInstaller';

function makeDeps() {
  const notes = new Map<string, string>();
  const folders = new Set<string>();
  const vault = {
    getAbstractFileByPath: (p: string) => (notes.has(p) || folders.has(p) ? { path: p } : null),
    createFolder: async (p: string) => {
      folders.add(p);
    },
    create: async (p: string, c: string) => {
      notes.set(p, c);
      return { path: p };
    },
  } as unknown as Vault;

  const qaFiles = new Map<string, string>();
  const adapter = {
    exists: async (p: string) => qaFiles.has(p),
    write: async (p: string, c: string) => {
      qaFiles.set(p, c);
    },
  } as unknown as VaultFileAdapter;

  const agents: RosterAgent[] = [];
  const rosterStore = {
    list: async () => agents.slice(),
    save: async (a: RosterAgent) => {
      agents.push(a);
    },
  } as unknown as AgentRosterStore;

  const deps: MarketplaceInstallDeps = {
    vault,
    adapter,
    rosterStore,
    loopFolder: 'Agent Board/loops',
    templateFolder: 'Agent Board/templates',
    quickActionsFolder: 'Quick Actions',
  };
  return { deps, notes, qaFiles, agents };
}

const loopItem: MarketplaceItem = {
  id: 'loops/ticket-to-pr-ready',
  type: 'loop',
  name: 'Ticket to PR-ready',
  description: 'd',
  path: 'loops/ticket-to-pr-ready.md',
  tags: [],
};
const loopBody = '---\ntype: specorator-loop\nschema_version: 1\nname: "Ticket to PR-ready"\n---\n\n## Approach\n\na\n';

describe('installMarketplaceItem', () => {
  it('writes a loop verbatim at the slug path and dedups on re-install', async () => {
    const { deps, notes } = makeDeps();
    expect(await installMarketplaceItem(loopItem, loopBody, deps, 1)).toBe('installed');
    expect(notes.get('Agent Board/loops/ticket-to-pr-ready.md')).toBe(loopBody);
    expect(await installMarketplaceItem(loopItem, loopBody, deps, 1)).toBe('skipped');
  });

  it('writes a template verbatim', async () => {
    const { deps, notes } = makeDeps();
    const item: MarketplaceItem = { id: 'templates/bug-fix', type: 'template', name: 'Bug fix', description: 'd', path: 'templates/bug-fix.md', tags: [] };
    const templateBody = '---\ntype: specorator-work-order-template\nschema_version: 1\nname: "Bug fix"\n---\n\nObjective.\n';
    expect(await installMarketplaceItem(item, templateBody, deps, 1)).toBe('installed');
    expect(notes.get('Agent Board/templates/bug-fix.md')).toBe(templateBody);
  });

  it('rejects a malformed note body instead of reporting installed', async () => {
    const { deps } = makeDeps();
    // A loop body its own store can't parse (no frontmatter) must not install as
    // "installed" only to vanish from the Library on the next list().
    const loop: MarketplaceItem = { id: 'loops/bad', type: 'loop', name: 'Bad Loop', description: 'd', path: 'loops/bad.md', tags: [] };
    await expect(installMarketplaceItem(loop, 'no frontmatter here', deps, 1)).rejects.toThrow(/malformed/i);

    const wrongType = '---\ntype: specorator-work-order-template\nschema_version: 1\nname: "X"\n---\n\nx';
    const loop2: MarketplaceItem = { id: 'loops/x', type: 'loop', name: 'X', description: 'd', path: 'loops/x.md', tags: [] };
    await expect(installMarketplaceItem(loop2, wrongType, deps, 1)).rejects.toThrow(/malformed/i);

    const qa: MarketplaceItem = { id: 'quick-actions/empty', type: 'quick-action', name: 'Empty', description: 'd', path: 'quick-actions/empty.md', tags: [] };
    await expect(installMarketplaceItem(qa, '', deps, 1)).rejects.toThrow(/malformed/i);
  });

  it('writes a quick action verbatim at its slug and dedups', async () => {
    const { deps, qaFiles } = makeDeps();
    const item: MarketplaceItem = { id: 'quick-actions/foo', type: 'quick-action', name: 'Foo bar', description: 'd', path: 'quick-actions/foo.md', tags: [] };
    expect(await installMarketplaceItem(item, 'prompt body', deps, 1)).toBe('installed');
    expect(qaFiles.get('Quick Actions/foo-bar.md')).toBe('prompt body');
    expect(await installMarketplaceItem(item, 'prompt body', deps, 1)).toBe('skipped');
  });

  it('maps an agent onto a RosterAgent and dedups by id', async () => {
    const { deps, agents } = makeDeps();
    const body = [
      '---',
      'type: specorator-agent',
      'name: "Code Reviewer"',
      'description: "Reviews changes."',
      'icon: "shield-check"',
      'color: "var(--color-purple)"',
      'initials: "CR"',
      'roles: ["verifier"]',
      '---',
      '',
      'You review changes.',
    ].join('\n');
    const item: MarketplaceItem = { id: 'agents/code-reviewer', type: 'agent', name: 'Code Reviewer', description: 'x', path: 'agents/code-reviewer.md', tags: [] };
    expect(await installMarketplaceItem(item, body, deps, 42)).toBe('installed');
    expect(agents).toHaveLength(1);
    const agent = agents[0];
    expect(agent.id).toBe('roster:code-reviewer');
    expect(agent.name).toBe('Code Reviewer');
    expect(agent.roles).toEqual(['verifier']);
    expect(agent.prompt).toBe('You review changes.');
    expect(agent.initials).toBe('CR');
    expect(agent.createdAt).toBe(42);
    expect(await installMarketplaceItem(item, body, deps, 42)).toBe('skipped');
  });

  it('defaults an agent with no valid roles to worker', async () => {
    const { deps, agents } = makeDeps();
    const body = '---\ntype: specorator-agent\nname: "Planner"\ndescription: "d"\n---\n\nPrompt.';
    const item: MarketplaceItem = { id: 'agents/planner', type: 'agent', name: 'Planner', description: 'x', path: 'agents/planner.md', tags: [] };
    await installMarketplaceItem(item, body, deps, 1);
    expect(agents[0].roles).toEqual(['worker']);
  });

  it('rejects a malformed agent body (wrong type or empty prompt) before saving', async () => {
    const { deps, agents } = makeDeps();
    const item: MarketplaceItem = { id: 'agents/bad', type: 'agent', name: 'Bad', description: 'd', path: 'agents/bad.md', tags: [] };
    // Wrong marker type — the roster would otherwise save whatever text as a prompt.
    const wrongType = '---\ntype: specorator-loop\nname: "Bad"\n---\n\nPrompt.';
    await expect(installMarketplaceItem(item, wrongType, deps, 1)).rejects.toThrow(/malformed/i);
    // Right type but no prompt body — an empty roster entry.
    const emptyPrompt = '---\ntype: specorator-agent\nname: "Bad"\n---\n\n   \n';
    await expect(installMarketplaceItem(item, emptyPrompt, deps, 1)).rejects.toThrow(/malformed/i);
    // Neither malformed body reached the store.
    expect(agents).toHaveLength(0);
  });

  it('throws for a skill (not yet installable)', async () => {
    const { deps } = makeDeps();
    const item: MarketplaceItem = { id: 'skills/x', type: 'skill', name: 'x', description: 'd', path: 'skills/x/SKILL.md', tags: [] };
    await expect(installMarketplaceItem(item, 'body', deps, 1)).rejects.toThrow();
  });
});

describe('isItemInstalled', () => {
  it('is false before install and true after', async () => {
    const { deps } = makeDeps();
    expect(await isItemInstalled(loopItem, deps)).toBe(false);
    await installMarketplaceItem(loopItem, loopBody, deps, 1);
    expect(await isItemInstalled(loopItem, deps)).toBe(true);
  });

  it('is false for skills', async () => {
    const { deps } = makeDeps();
    const item: MarketplaceItem = { id: 'skills/x', type: 'skill', name: 'x', description: 'd', path: 'skills/x/SKILL.md', tags: [] };
    expect(await isItemInstalled(item, deps)).toBe(false);
  });

  it('keys agent identity on the manifest name so the check matches after install (badge regression)', async () => {
    const { deps } = makeDeps();
    // Body frontmatter name deliberately differs from the manifest item name.
    const body = '---\ntype: specorator-agent\nname: "Frontmatter Name"\n---\n\nPrompt.';
    const item: MarketplaceItem = { id: 'agents/x', type: 'agent', name: 'Manifest Name', description: 'd', path: 'agents/x.md', tags: [] };
    expect(await isItemInstalled(item, deps)).toBe(false);
    await installMarketplaceItem(item, body, deps, 1);
    // isItemInstalled only has the manifest item; it must still see it installed.
    expect(await isItemInstalled(item, deps)).toBe(true);
  });

  it('honors a precomputed roster id set instead of scanning the store', async () => {
    const { deps } = makeDeps();
    const item: MarketplaceItem = { id: 'agents/p', type: 'agent', name: 'Planner', description: 'd', path: 'agents/p.md', tags: [] };
    const listSpy = jest.spyOn(deps.rosterStore, 'list');
    expect(await isItemInstalled(item, deps, new Set(['roster:planner']))).toBe(true);
    expect(await isItemInstalled(item, deps, new Set(['roster:other']))).toBe(false);
    expect(listSpy).not.toHaveBeenCalled();
  });
});
