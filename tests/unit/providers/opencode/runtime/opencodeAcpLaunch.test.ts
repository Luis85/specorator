import { startOpencodeAcpProcess } from '@/providers/opencode/runtime/OpencodeLaunchArtifacts';

const constructed: Array<Record<string, unknown>> = [];

jest.mock('@/providers/acp', () => ({
  AcpSubprocess: jest.fn().mockImplementation((spec: Record<string, unknown>) => {
    constructed.push(spec);
    return {
      start: jest.fn(),
      stdout: {},
      stdin: {},
      onClose: jest.fn(),
    };
  }),
  AcpJsonRpcTransport: jest.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  constructed.length = 0;
});

/**
 * An npm-installed OpenCode on Windows IS `opencode.cmd`, which is exactly what a
 * user pins through the setup view's manual-path field — and Windows refuses to
 * spawn a batch shim without a shell (Node's CVE-2024-27980 fix). The Codex and
 * Cursor launches already wrap; this one didn't.
 */
describe('startOpencodeAcpProcess', () => {
  it('spawns the command directly when it is not a batch shim', () => {
    startOpencodeAcpProcess({
      command: '/usr/local/bin/opencode',
      cwd: '/vault',
      env: {},
    });

    expect(constructed[0]).toMatchObject({
      command: '/usr/local/bin/opencode',
      args: ['acp', '--cwd=/vault'],
    });
    expect(constructed[0].windowsVerbatimArguments).toBeUndefined();
  });

  it('routes a Windows .cmd shim through cmd.exe with verbatim arguments', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      startOpencodeAcpProcess({
        command: 'C:\\Users\\me\\AppData\\Roaming\\npm\\opencode.cmd',
        cwd: 'C:\\vault',
        env: {},
      });
    } finally {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    }

    const spec = constructed[0];
    expect(String(spec.command).toLowerCase()).toContain('cmd.exe');
    expect(spec.windowsVerbatimArguments).toBe(true);
    expect((spec.args as string[]).slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect((spec.args as string[])[3]).toContain('opencode.cmd');
    expect((spec.args as string[])[3]).toContain('acp');
  });
});
