import type { Vault } from 'obsidian';

import type { HomeFileAdapter } from '@/core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { AgentRosterStore } from '@/features/agents/roster/AgentRosterStore';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import {
  installMarketplaceItem,
  installSkillItem,
  isItemInstalled,
  isSkillInstalledAt,
  type MarketplaceInstallDeps,
} from '@/features/marketplace/MarketplaceInstaller';
import type { SkillInstallTarget } from '@/features/marketplace/skillInstallTargets';

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

  // `exists` is folder-aware: a directory "exists" when any file lives under it
  // (mirrors real adapters), so the installer's pre-existing-folder guard can be
  // exercised by seeding a non-SKILL file.
  const dirAware = (files: Map<string, string>) => async (p: string) =>
    files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`));

  const qaFiles = new Map<string, string>();
  const adapter = {
    exists: dirAware(qaFiles),
    write: async (p: string, c: string) => {
      qaFiles.set(p, c);
    },
  } as unknown as VaultFileAdapter;

  // Home adapter for user-scope skill installs — a separate in-memory map so
  // tests can assert vault vs. home routing.
  const homeFiles = new Map<string, string>();
  const homeAdapter = {
    exists: dirAware(homeFiles),
    write: async (p: string, c: string) => {
      homeFiles.set(p, c);
    },
  } as unknown as HomeFileAdapter;

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
    homeAdapter,
    rosterStore,
    loopFolder: 'Agent Board/loops',
    templateFolder: 'Agent Board/templates',
    quickActionsFolder: 'Quick Actions',
    catalogUrl: 'https://catalog.test/',
    ...overrides,
  };
  return { deps, notes, qaFiles, homeFiles, agents };
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

  it('is false for a quick action when the folder is unconfigured (badge false-positive)', async () => {
    const { deps, qaFiles } = makeDeps({ quickActionsFolder: '' });
    const item: MarketplaceItem = { id: 'quick-actions/foo', type: 'quick-action', name: 'Foo', description: 'd', path: 'quick-actions/foo.md', tags: [] };
    // A blank folder derives a vault-root path; an unrelated root note with that
    // filename must NOT make the card read installed (install is refused too).
    qaFiles.set('foo.md', 'unrelated');
    qaFiles.set('/foo.md', 'unrelated');
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

const skillItem: MarketplaceItem = {
  id: 'skills/project-setup',
  type: 'skill',
  name: 'project-setup',
  description: 'Use when setting up a project.',
  path: 'skills/project-setup/SKILL.md',
  files: [
    'skills/project-setup/SKILL.md',
    'skills/project-setup/references/a.md',
    'skills/project-setup/scripts/run.mjs',
  ],
  tags: [],
};

/** A minimal valid SKILL.md (name + description frontmatter) for a given skill name. */
const validSkillMd = (name: string): string =>
  `---\nname: ${name}\ndescription: Use when doing the thing.\n---\n\nDo the thing.`;

/** The in-skill file map the store hands the installer (keys are folder-relative). */
function skillFiles(): Map<string, string> {
  return new Map<string, string>([
    ['SKILL.md', validSkillMd('project-setup')],
    ['references/a.md', 'ref a'],
    ['scripts/run.mjs', 'run'],
  ]);
}

describe('installSkillItem', () => {
  it('writes the whole folder under the vault provider root at project scope', async () => {
    const { deps, qaFiles, homeFiles } = makeDeps();
    const outcome = await installSkillItem(skillItem, skillFiles(), { provider: 'claude', scope: 'project' }, deps);
    expect(outcome).toBe('installed');
    expect(qaFiles.get('.claude/skills/project-setup/SKILL.md')).toBe(validSkillMd('project-setup'));
    expect(qaFiles.get('.claude/skills/project-setup/references/a.md')).toBe('ref a');
    expect(qaFiles.get('.claude/skills/project-setup/scripts/run.mjs')).toBe('run');
    expect(homeFiles.size).toBe(0); // project scope never touches home
  });

  it('writes to the home adapter at user scope, under the codex root', async () => {
    const { deps, qaFiles, homeFiles } = makeDeps();
    await installSkillItem(skillItem, skillFiles(), { provider: 'codex', scope: 'user' }, deps);
    expect(homeFiles.get('.codex/skills/project-setup/SKILL.md')).toBe(validSkillMd('project-setup'));
    expect(homeFiles.get('.codex/skills/project-setup/scripts/run.mjs')).toBe('run');
    expect(qaFiles.size).toBe(0); // user scope writes to home only
  });

  it('maps each provider to its own skill root', async () => {
    const { deps, qaFiles } = makeDeps();
    await installSkillItem(skillItem, skillFiles(), { provider: 'cursor', scope: 'project' }, deps);
    expect(qaFiles.has('.cursor/skills/project-setup/SKILL.md')).toBe(true);
  });

  it('installs by NAME so distinct-name items sharing a path parent get distinct folders', async () => {
    // The install folder + dedup key must agree (both name-based). Two differently
    // named items that share one `<folder>/SKILL.md` parent (only reachable via a
    // custom manifest) must install to DISTINCT dirs, not collide — else installing
    // one would mark both installed and block the other.
    const { deps, qaFiles } = makeDeps();
    const target: SkillInstallTarget = { provider: 'claude', scope: 'project' };
    const alpha: MarketplaceItem = { id: 'skills/alpha', type: 'skill', name: 'alpha', description: 'd', path: 'skills/shared/SKILL.md', files: [], tags: [] };
    const beta: MarketplaceItem = { id: 'skills/beta', type: 'skill', name: 'beta', description: 'd', path: 'skills/shared/SKILL.md', files: [], tags: [] };
    await installSkillItem(alpha, new Map([['SKILL.md', validSkillMd('alpha')]]), target, deps);
    await installSkillItem(beta, new Map([['SKILL.md', validSkillMd('beta')]]), target, deps);
    expect(qaFiles.get('.claude/skills/alpha/SKILL.md')).toBe(validSkillMd('alpha'));
    expect(qaFiles.get('.claude/skills/beta/SKILL.md')).toBe(validSkillMd('beta'));
    // ...and their installed-state is independent.
    expect(await isSkillInstalledAt(alpha, target, deps)).toBe(true);
    expect(await isSkillInstalledAt(beta, target, deps)).toBe(true);
  });

  it('skips when the target already holds the skill', async () => {
    const { deps } = makeDeps();
    const target: SkillInstallTarget = { provider: 'claude', scope: 'project' };
    expect(await installSkillItem(skillItem, skillFiles(), target, deps)).toBe('installed');
    expect(await installSkillItem(skillItem, skillFiles(), target, deps)).toBe('skipped');
  });

  it('slugifies a slashed / spaced / uppercase name to one safe provider-valid segment', async () => {
    // A messy custom-catalog name normalizes to the same [a-z0-9-] slug
    // parseManifest dedups on — one segment, no nesting, resolvable as a command.
    const { deps, qaFiles } = makeDeps();
    const messy: MarketplaceItem = { ...skillItem, name: 'Foo/Bar Baz' };
    await installSkillItem(messy, new Map([['SKILL.md', validSkillMd('foo-bar-baz')]]), { provider: 'claude', scope: 'project' }, deps);
    expect(qaFiles.get('.claude/skills/foo-bar-baz/SKILL.md')).toBe(validSkillMd('foo-bar-baz'));
    expect(qaFiles.has('.claude/skills/Foo/Bar Baz/SKILL.md')).toBe(false);
  });

  it('refuses a name that normalizes to an empty slug', async () => {
    const { deps } = makeDeps();
    const empty: MarketplaceItem = { ...skillItem, name: '!!!' };
    await expect(
      installSkillItem(empty, new Map([['SKILL.md', 'x']]), { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/invalid/i);
  });

  it('refuses a pre-existing folder that lacks SKILL.md (protects existing content)', async () => {
    const { deps, qaFiles } = makeDeps();
    // A hand-made / half-installed folder holding a user file, no SKILL.md.
    qaFiles.set('.claude/skills/project-setup/notes.md', 'user content');
    await expect(
      installSkillItem(skillItem, skillFiles(), { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/already exists/i);
    // Nothing was overwritten and no SKILL.md was written.
    expect(qaFiles.get('.claude/skills/project-setup/notes.md')).toBe('user content');
    expect(qaFiles.has('.claude/skills/project-setup/SKILL.md')).toBe(false);
  });

  it('refuses a file map without SKILL.md', async () => {
    const { deps } = makeDeps();
    const noSkillMd = new Map<string, string>([['references/a.md', 'x']]);
    await expect(
      installSkillItem(skillItem, noSkillMd, { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/SKILL\.md/);
  });

  it('refuses a SKILL.md with no name/description frontmatter (would install an unloadable skill)', async () => {
    const { deps, qaFiles } = makeDeps();
    const noFrontmatter = new Map<string, string>([
      ['SKILL.md', 'just a body, no frontmatter'],
      ['scripts/run.mjs', 'run'],
    ]);
    await expect(
      installSkillItem(skillItem, noFrontmatter, { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/name.*description/i);
    expect(qaFiles.size).toBe(0); // rejected before any write
  });

  it('refuses a SKILL.md with valid frontmatter but no instruction body (would install an empty skill)', async () => {
    const { deps, qaFiles } = makeDeps();
    const noBody = new Map<string, string>([
      ['SKILL.md', '---\nname: project-setup\ndescription: Use when doing the thing.\n---\n\n   \n'],
    ]);
    await expect(
      installSkillItem(skillItem, noBody, { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/no instructions/i);
    expect(qaFiles.size).toBe(0); // rejected before any write
  });

  it('refuses a SKILL.md whose name identifies a different skill than the catalog entry', async () => {
    const { deps } = makeDeps();
    const mismatched = new Map<string, string>([['SKILL.md', validSkillMd('something-else')]]);
    await expect(
      installSkillItem(skillItem, mismatched, { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/different skill/i);
  });

  it('refuses an unsafe in-skill path (traversal) and writes nothing', async () => {
    const { deps, qaFiles } = makeDeps();
    const evil = new Map<string, string>([
      ['SKILL.md', validSkillMd('project-setup')],
      ['../evil.md', 'pwn'],
    ]);
    await expect(
      installSkillItem(skillItem, evil, { provider: 'claude', scope: 'project' }, deps),
    ).rejects.toThrow(/unsafe/);
    // SKILL.md is written last, and the traversal file is rejected before it, so
    // nothing lands — no dedup marker to block a corrected re-install.
    expect(qaFiles.size).toBe(0);
  });

  it('writes SKILL.md last so a mid-write failure leaves no dedup marker', async () => {
    const { deps } = makeDeps();
    const order: string[] = [];
    jest.spyOn(deps.adapter, 'write').mockImplementation(async (p: string) => {
      order.push(p);
    });
    await installSkillItem(skillItem, skillFiles(), { provider: 'claude', scope: 'project' }, deps);
    expect(order[order.length - 1]).toBe('.claude/skills/project-setup/SKILL.md');
  });
});

describe('skill installed checks', () => {
  it('isItemInstalled reports installed when present in ANY root', async () => {
    const { deps } = makeDeps();
    expect(await isItemInstalled(skillItem, deps)).toBe(false);
    await installSkillItem(skillItem, skillFiles(), { provider: 'codex', scope: 'user' }, deps);
    expect(await isItemInstalled(skillItem, deps)).toBe(true); // found in codex/user
  });

  it('isSkillInstalledAt reflects the SPECIFIC target only', async () => {
    const { deps } = makeDeps();
    await installSkillItem(skillItem, skillFiles(), { provider: 'codex', scope: 'user' }, deps);
    expect(await isSkillInstalledAt(skillItem, { provider: 'codex', scope: 'user' }, deps)).toBe(true);
    expect(await isSkillInstalledAt(skillItem, { provider: 'claude', scope: 'project' }, deps)).toBe(false);
  });
});
