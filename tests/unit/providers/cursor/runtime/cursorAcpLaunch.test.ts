import { buildCursorAcpLaunchSpec } from '@/providers/cursor/runtime/cursorAcpLaunch';

describe('buildCursorAcpLaunchSpec', () => {
  it('appends the acp subcommand to the resolved cursor launch', () => {
    const spec = buildCursorAcpLaunchSpec('/home/u/.local/bin/cursor-agent', '/vault', { PATH: '/usr/bin' });

    // resolveCursorLaunch may resolve a node-entry or fall back to the raw
    // path depending on what's on disk (CI has neither) — the acp subcommand
    // is always the last arg either way.
    expect(spec.args[spec.args.length - 1]).toBe('acp');
    expect(spec.cwd).toBe('/vault');
    expect(spec.env.PATH).toBe('/usr/bin');
  });
});
