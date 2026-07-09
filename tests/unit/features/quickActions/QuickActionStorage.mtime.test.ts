import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { QuickActionStorage } from '@/features/quickActions/QuickActionStorage';
import type { QuickAction } from '@/features/quickActions/types';

function note(name: string): string {
  return `---\ntype: quick-action\nname: ${name}\n---\n\nBody of ${name}.\n`;
}

function makeAdapter(
  files: Map<string, string>,
  stats: Map<string, { mtime: number; size: number }>,
) {
  return {
    read: jest.fn(async (p: string) => files.get(p) ?? ''),
    write: jest.fn(async (p: string, c: string) => { files.set(p, c); }),
    ensureFolder: jest.fn(async () => undefined),
    listFilesRecursive: jest.fn(async () => Array.from(files.keys())),
    stat: jest.fn(async (p: string) => stats.get(p) ?? null),
  } as unknown as jest.Mocked<VaultFileAdapter>;
}

describe('QuickActionStorage mtime', () => {
  // The Library's "Recently updated" sort reads QuickAction.mtime. Without it
  // the sort silently no-ops (accessor returned a constant 0), so loadAll must
  // surface each note's vault file mtime alongside the parsed frontmatter.
  it('loadAll attaches each file mtime from adapter.stat', async () => {
    const files = new Map([
      ['Quick Actions/alpha.md', note('Alpha')],
      ['Quick Actions/beta.md', note('Beta')],
    ]);
    const stats = new Map([
      ['Quick Actions/alpha.md', { mtime: 1111, size: 10 }],
      ['Quick Actions/beta.md', { mtime: 2222, size: 20 }],
    ]);
    const adapter = makeAdapter(files, stats);
    const storage = new QuickActionStorage(adapter, () => 'Quick Actions');

    const actions = await storage.loadAll();

    expect(actions.map((a) => [a.name, a.mtime])).toEqual([
      ['Alpha', 1111],
      ['Beta', 2222],
    ]);
  });

  it('loadAll leaves mtime undefined when stat returns null', async () => {
    const files = new Map([['Quick Actions/alpha.md', note('Alpha')]]);
    const adapter = makeAdapter(files, new Map());
    const storage = new QuickActionStorage(adapter, () => 'Quick Actions');

    const actions = await storage.loadAll();

    expect(actions).toHaveLength(1);
    expect(actions[0].mtime).toBeUndefined();
    expect('mtime' in actions[0] && actions[0].mtime !== undefined).toBe(false);
  });

  it('save never serializes mtime into the note frontmatter', async () => {
    const files = new Map<string, string>();
    const adapter = makeAdapter(files, new Map());
    const storage = new QuickActionStorage(adapter, () => 'Quick Actions');
    const action: QuickAction = {
      id: 'alpha',
      name: 'Alpha',
      description: 'Alpha',
      prompt: 'Body.',
      filePath: 'Quick Actions/alpha.md',
      mtime: 12345,
    };

    await storage.save(action);

    const written = files.get('Quick Actions/alpha.md')!;
    // mtime is a load-time projection of the vault file stat, never a
    // frontmatter field — persisting it would drift from the real file stat.
    expect(written).not.toContain('mtime');
    expect(written).not.toContain('12345');
  });
});
