import type { Vault } from 'obsidian';

import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { AgentRosterStore } from '@/features/agents/roster/AgentRosterStore';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import { installMarketplaceItem, isItemInstalled, type MarketplaceInstallDeps } from '@/features/marketplace/MarketplaceInstaller';

function makeDeps(overrides: Partial<MarketplaceInstallDeps> = {}) {
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
    catalogUrl: 'https://catalog.test/',
    ...overrides,
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

  it('rejects a loop whose body names a different item than the manifest', async () => {
    const { deps, notes } = makeDeps();
    // The manifest entry is "Alpha" but the fetched body's frontmatter says "Beta"
    // — writing it at the Alpha slug would let the Library show Beta while the
    // Marketplace marks Alpha installed. Reject the mismatched payload.
    const item: MarketplaceItem = { id: 'loops/alpha', type: 'loop', name: 'Alpha', description: 'd', path: 'loops/alpha.md', tags: [] };
    const body = '---\ntype: specorator-loop\nschema_version: 1\nname: "Beta"\n---\n\n## Approach\n\na\n';
    await expect(installMarketplaceItem(item, body, deps, 1)).rejects.toThrow(/different item/i);
    expect(notes.size).toBe(0);
  });

  it('rejects a quick action whose body names a different item than the manifest', async () => {
    const { deps, qaFiles } = makeDeps();
    // The manifest entry is "Alpha" but the body's frontmatter names "Beta":
    // writing it at the Alpha slug would show Beta in the Library while the
    // Marketplace marks Alpha installed — the quick-action parallel of the
    // loop/template identity guard.
    const item: MarketplaceItem = { id: 'quick-actions/alpha', type: 'quick-action', name: 'Alpha', description: 'd', path: 'quick-actions/alpha.md', tags: [] };
    const body = '---\nname: "Beta"\n---\n\nDo the thing.';
    await expect(installMarketplaceItem(item, body, deps, 1)).rejects.toThrow(/different item/i);
    expect(qaFiles.size).toBe(0);
  });

  it('writes a quick action verbatim at its slug and dedups', async () => {
    const { deps, qaFiles } = makeDeps();
    const item: MarketplaceItem = { id: 'quick-actions/foo', type: 'quick-action', name: 'Foo bar', description: 'd', path: 'quick-actions/foo.md', tags: [] };
    expect(await installMarketplaceItem(item, 'prompt body', deps, 1)).toBe('installed');
    expect(qaFiles.get('Quick Actions/foo-bar.md')).toBe('prompt body');
    expect(await installMarketplaceItem(item, 'prompt body', deps, 1)).toBe('skipped');
  });

  it('refuses a quick-action install when the Quick Actions folder is unconfigured', async () => {
    // A blank folder means the feature is unconfigured (the rest of the app
    // preserves the blank with `??`). Writing to a default folder would report
    // success and mark the card installed while the Library — also unconfigured
    // — scans nothing, so the install is invisible. Fail visibly instead.
    const { deps, qaFiles } = makeDeps({ quickActionsFolder: '' });
    const item: MarketplaceItem = { id: 'quick-actions/foo', type: 'quick-action', name: 'Foo', description: 'd', path: 'quick-actions/foo.md', tags: [] };
    await expect(installMarketplaceItem(item, 'prompt body', deps, 1)).rejects.toThrow(/folder/i);
    expect(qaFiles.size).toBe(0);
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

  it('stamps catalog provenance onto an installed agent', async () => {
    const { deps, agents } = makeDeps();
    const body = '---\ntype: specorator-agent\nname: "Code Reviewer"\n---\n\nYou review changes.';
    const item: MarketplaceItem = {
      id: 'agents/code-reviewer',
      type: 'agent',
      name: 'Code Reviewer',
      description: 'x',
      path: 'agents/code-reviewer.md',
      tags: [],
      author: 'Specorator',
      license: 'MIT',
      source: 'https://example.test/agents',
      version: 3,
    };
    await installMarketplaceItem(item, body, deps, 1);
    // The installed roster JSON records where the agent came from — including
    // the catalog base URL it was fetched from, so installed-detection can scope
    // the catalog id to its source.
    expect(agents[0].catalog).toEqual({
      id: 'agents/code-reviewer',
      author: 'Specorator',
      license: 'MIT',
      source: 'https://example.test/agents',
      version: 3,
      catalogUrl: 'https://catalog.test/',
    });
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

  it('recognizes an installed agent by catalog id after a display-name rebrand', async () => {
    const { deps } = makeDeps();
    const body = '---\ntype: specorator-agent\nname: "Old Name"\n---\n\nPrompt.';
    const original: MarketplaceItem = { id: 'agents/x', type: 'agent', name: 'Old Name', description: 'd', path: 'agents/x.md', tags: [] };
    await installMarketplaceItem(original, body, deps, 1);
    expect(await isItemInstalled(original, deps)).toBe(true);

    // The catalog later rebrands the display name: the roster id (name slug) now
    // differs, but the stable catalog id still matches → still marked installed.
    const rebranded: MarketplaceItem = { ...original, name: 'New Name' };
    expect(await isItemInstalled(rebranded, deps)).toBe(true);
  });

  it('scopes the agent catalog-id match to the catalog source (fork id reuse)', async () => {
    const { deps } = makeDeps(); // catalogUrl https://catalog.test/
    const body = '---\ntype: specorator-agent\nname: "Reviewer"\n---\n\nPrompt.';
    const original: MarketplaceItem = { id: 'agents/reviewer', type: 'agent', name: 'Reviewer', description: 'd', path: 'agents/reviewer.md', tags: [] };
    await installMarketplaceItem(original, body, deps, 1);
    expect(await isItemInstalled(original, deps)).toBe(true);

    // A different catalog source reuses the SAME id for a DIFFERENTLY-named agent.
    // The roster-name fallback doesn't collide (different name), and the stored
    // catalog id belongs to the other source, so the fork's card is NOT installed
    // and keeps its Install action.
    const forkDeps = { ...deps, catalogUrl: 'https://fork.test/' };
    const forkItem: MarketplaceItem = { id: 'agents/reviewer', type: 'agent', name: 'Auditor', description: 'd', path: 'agents/reviewer.md', tags: [] };
    expect(await isItemInstalled(forkItem, forkDeps)).toBe(false);

    // Same source, rebranded display name → still recognized by the scoped catalog id.
    const rebranded: MarketplaceItem = { ...original, name: 'Reviewer Pro' };
    expect(await isItemInstalled(rebranded, deps)).toBe(true);
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
