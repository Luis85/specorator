import type { RosterAgent } from './rosterTypes';

export function slugifyRosterName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function rosterIdFromSlug(slug: string): string {
  return `roster:${slug}`;
}

/**
 * Returns `baseId` if free, otherwise the first `baseId-<n>` (n>=2) not in
 * `existingIds`. Prevents two same-named new agents from overwriting one file.
 */
export function dedupeRosterId(baseId: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  if (!taken.has(baseId)) return baseId;
  let n = 2;
  while (taken.has(`${baseId}-${n}`)) n += 1;
  return `${baseId}-${n}`;
}

export function createRosterAgent(name: string, now: number): RosterAgent {
  const slug = slugifyRosterName(name) || 'agent';
  return {
    id: rosterIdFromSlug(slug),
    name,
    description: '',
    prompt: '',
    disallowedTools: [],
    skills: [],
    roles: ['worker'],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Clone an agent with a probed `"<name> copy[ n]"` display name and a deduped
 * id. The name probe matters because the roster/search/chat chrome shows
 * `agent.name` — a second clone must not be indistinguishable from the first.
 * Shared by the legacy roster view and the Vue roster store; pure (caller
 * persists the result).
 */
export function cloneRosterAgent(agent: RosterAgent, existing: RosterAgent[], now: number): RosterAgent {
  const existingNames = new Set(existing.map((a) => a.name));
  let cloneName = `${agent.name} copy`;
  for (let n = 2; existingNames.has(cloneName); n += 1) {
    cloneName = `${agent.name} copy ${n}`;
  }
  const base = createRosterAgent(cloneName, now);
  return {
    ...agent,
    id: dedupeRosterId(base.id, existing.map((a) => a.id)),
    name: cloneName,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * In-memory new-agent draft with id/name dedupe against the existing roster.
 * NOT persisted: the editor's first Save (or Start chat) writes it, so an
 * abandoned editor leaves no orphan file.
 */
export function draftRosterAgent(label: string, existing: RosterAgent[], now: number): RosterAgent {
  const agent = createRosterAgent(label, now);
  const uniqueId = dedupeRosterId(agent.id, existing.map((a) => a.id));
  if (uniqueId !== agent.id) {
    agent.id = uniqueId;
    agent.name = `${label} ${uniqueId.split('-').pop() ?? ''}`;
  }
  return agent;
}
