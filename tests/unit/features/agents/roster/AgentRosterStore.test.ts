import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { AgentRosterStore, ROSTER_DIR } from '@/features/agents/roster/AgentRosterStore';
import { createRosterAgent } from '@/features/agents/roster/rosterCapabilities';

function makeAdapter(files: Record<string, string>) {
  return {
    ensureFolder: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn(async (dir: string) =>
      Object.keys(files).filter((p) => p.startsWith(`${dir}/`)),
    ),
    read: jest.fn(async (p: string) => files[p]),
    write: jest.fn(async (p: string, c: string) => { files[p] = c; }),
    writeAtomic: jest.fn(async (p: string, c: string) => { files[p] = c; }),
    exists: jest.fn(async (p: string) => p in files),
    delete: jest.fn(async (p: string) => { delete files[p]; }),
  } as unknown as VaultFileAdapter;
}

describe('AgentRosterStore', () => {
  it('saves an agent as JSON under the roster dir', async () => {
    const files: Record<string, string> = {};
    const adapter = makeAdapter(files);
    const store = new AgentRosterStore(adapter);
    const agent = createRosterAgent('Reviewer', 1);

    await store.save(agent);

    expect(adapter.writeAtomic).toHaveBeenCalledWith(
      `${ROSTER_DIR}/reviewer.json`,
      expect.stringContaining('"name": "Reviewer"'),
    );
    expect(files[`${ROSTER_DIR}/reviewer.json`]).toContain('"name": "Reviewer"');
  });

  it('lists saved agents', async () => {
    const agent = createRosterAgent('Reviewer', 1);
    const files = { [`${ROSTER_DIR}/reviewer.json`]: JSON.stringify(agent) };
    const store = new AgentRosterStore(makeAdapter(files));

    const all = await store.list();

    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('roster:reviewer');
  });

  it('round-trips catalog provenance on save/list', async () => {
    const files: Record<string, string> = {};
    const store = new AgentRosterStore(makeAdapter(files));
    const agent = {
      ...createRosterAgent('Reviewer', 1),
      catalog: {
        id: 'agents/reviewer',
        source: 'https://example.test/agents',
        author: 'Specorator',
        license: 'MIT',
        version: 2,
      },
    };

    await store.save(agent);
    const [listed] = await store.list();

    // The store serializes the whole object (no field allowlist), so provenance
    // added to RosterAgent survives a save → list round-trip.
    expect(listed.catalog).toEqual({
      id: 'agents/reviewer',
      source: 'https://example.test/agents',
      author: 'Specorator',
      license: 'MIT',
      version: 2,
    });
  });

  it('skips malformed json files', async () => {
    const files = { [`${ROSTER_DIR}/bad.json`]: '{not json' };
    const store = new AgentRosterStore(makeAdapter(files));
    await expect(store.list()).resolves.toEqual([]);
  });

  it('deletes an agent by id', async () => {
    const agent = createRosterAgent('Reviewer', 1);
    const files = { [`${ROSTER_DIR}/reviewer.json`]: JSON.stringify(agent) };
    const adapter = makeAdapter(files);
    const store = new AgentRosterStore(adapter);

    await store.delete('roster:reviewer');

    expect(adapter.delete).toHaveBeenCalledWith(`${ROSTER_DIR}/reviewer.json`);
  });

  it('does not delete or emit when the agent is absent', async () => {
    const adapter = makeAdapter({});
    const emit = jest.fn();
    const store = new AgentRosterStore(adapter, { emit } as never);

    await store.delete('roster:ghost');

    expect(adapter.delete).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  describe('get', () => {
    it('reads and parses an existing agent by id', async () => {
      const agent = createRosterAgent('Reviewer', 1);
      const files = { [`${ROSTER_DIR}/reviewer.json`]: JSON.stringify(agent) };
      const store = new AgentRosterStore(makeAdapter(files));

      const got = await store.get('roster:reviewer');

      expect(got?.id).toBe('roster:reviewer');
    });

    it('returns null for a genuinely absent agent', async () => {
      const store = new AgentRosterStore(makeAdapter({}));

      await expect(store.get('roster:ghost')).resolves.toBeNull();
    });

    // Round-60 (ROOT): exists() used to run OUTSIDE get()'s try/catch, so a vault-I/O error
    // REJECTED — surfacing one call site at a time (send R58, steer R59, auto-dequeue). get() is
    // now TOTAL: an I/O error reads as "not found" (null) so every caller's removed-agent handling
    // runs, and nothing escapes as an unhandled rejection.
    it('returns null (does not reject) and reports via onError when exists() throws', async () => {
      const adapter = {
        exists: jest.fn().mockRejectedValue(new Error('vault io')),
        read: jest.fn(),
      } as unknown as VaultFileAdapter;
      const onError = jest.fn();
      const store = new AgentRosterStore(adapter, undefined, onError);

      await expect(store.get('roster:reviewer')).resolves.toBeNull();
      expect(onError).toHaveBeenCalledWith(`${ROSTER_DIR}/reviewer.json`, expect.any(Error));
      expect(adapter.read).not.toHaveBeenCalled(); // short-circuited by the throwing exists()
    });

    it('returns null and reports via onError when read() throws', async () => {
      const adapter = {
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockRejectedValue(new Error('read fail')),
      } as unknown as VaultFileAdapter;
      const onError = jest.fn();
      const store = new AgentRosterStore(adapter, undefined, onError);

      await expect(store.get('roster:reviewer')).resolves.toBeNull();
      expect(onError).toHaveBeenCalledWith(`${ROSTER_DIR}/reviewer.json`, expect.any(Error));
    });
  });

  // Round-63: get() is deliberately TOTAL (null-on-uncertain) for the removed-agent guards,
  // but that conflates "genuinely gone" with "transient I/O error" — fatal for the two IDENTITY
  // resolvers (resolveBoundAgent / resolveTeamChatAgentProvider), which would then run under the
  // WRONG identity. getStrict() is the identity-safe read: null ONLY on genuine absence, THROW on
  // any exists/read/parse error, so the caller blocks + retries instead of proceeding unbound.
  describe('getStrict', () => {
    it('reads and parses an existing agent by id', async () => {
      const agent = createRosterAgent('Reviewer', 1);
      const files = { [`${ROSTER_DIR}/reviewer.json`]: JSON.stringify(agent) };
      const store = new AgentRosterStore(makeAdapter(files));

      const got = await store.getStrict('roster:reviewer');

      expect(got?.id).toBe('roster:reviewer');
    });

    it('returns null for a genuinely absent agent (exists() === false)', async () => {
      const store = new AgentRosterStore(makeAdapter({}));

      await expect(store.getStrict('roster:ghost')).resolves.toBeNull();
    });

    it('THROWS (does not swallow) when exists() throws', async () => {
      const adapter = {
        exists: jest.fn().mockRejectedValue(new Error('vault io')),
        read: jest.fn(),
      } as unknown as VaultFileAdapter;
      const store = new AgentRosterStore(adapter);

      await expect(store.getStrict('roster:reviewer')).rejects.toThrow('vault io');
      expect(adapter.read).not.toHaveBeenCalled();
    });

    it('THROWS when read() throws', async () => {
      const adapter = {
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockRejectedValue(new Error('read fail')),
      } as unknown as VaultFileAdapter;
      const store = new AgentRosterStore(adapter);

      await expect(store.getStrict('roster:reviewer')).rejects.toThrow('read fail');
    });

    it('THROWS when the stored json is malformed (parse error)', async () => {
      const files = { [`${ROSTER_DIR}/reviewer.json`]: '{not json' };
      const store = new AgentRosterStore(makeAdapter(files));

      await expect(store.getStrict('roster:reviewer')).rejects.toThrow();
    });
  });
});
