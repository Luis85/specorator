import path from 'node:path';

import { resolveToolHostPaths } from '@/providers/claude/toolHost/toolHostPaths';

describe('resolveToolHostPaths', () => {
  it('joins vault + plugin dir for the host entry and the tools dir', () => {
    const r = resolveToolHostPaths({ vaultPath: '/vault', pluginDir: '.obsidian/plugins/specorator' });
    expect(r.hostEntry).toBe(path.join('/vault', '.obsidian/plugins/specorator', 'tool-host.mjs'));
    expect(r.toolsDir).toBe(path.join('/vault', '.specorator', 'tools'));
  });
});
