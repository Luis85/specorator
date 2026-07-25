const constructed: Array<Record<string, unknown>> = [];

jest.mock('@/utils/cliBinaryLocator', () => ({
  executableCandidateNames: jest.fn((base: string) => [`${base}.exe`, `${base}.cmd`]),
  findBinaryOnPath: jest.fn(() => null),
}));

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

import { startOpencodeAcpProcess } from '@/providers/opencode/runtime/OpencodeLaunchArtifacts';
import { findBinaryOnPath } from '@/utils/cliBinaryLocator';

/** Runs `body` with `process.platform` forced, restoring it afterwards. */
function onPlatform(platform: NodeJS.Platform, body: () => void): void {
  const previous = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    body();
  } finally {
    Object.defineProperty(process, 'platform', { value: previous, configurable: true });
  }
}

beforeEach(() => {
  constructed.length = 0;
  jest.mocked(findBinaryOnPath).mockReset().mockReturnValue(null);
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
    onPlatform('win32', () => startOpencodeAcpProcess({
      command: 'C:\\Users\\me\\AppData\\Roaming\\npm\\opencode.cmd',
      cwd: 'C:\\vault',
      env: {},
    }));

    const spec = constructed[0];
    expect(String(spec.command).toLowerCase()).toContain('cmd.exe');
    expect(spec.windowsVerbatimArguments).toBe(true);
    expect((spec.args as string[]).slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect((spec.args as string[])[3]).toContain('opencode.cmd');
    expect((spec.args as string[])[3]).toContain('acp');
  });

  it('resolves a BARE command on Windows before wrapping it', () => {
    // No pin: the runtime falls back to `opencode`, whose Windows entry point is
    // an npm `.cmd`. Neither libuv nor CreateProcess can execute a batch file, and
    // an extension-based wrap cannot fire on a name with no extension — so the
    // bare name has to become a real path first. The PATH searched is the
    // runtime's own, not the host's.
    jest.mocked(findBinaryOnPath).mockReturnValue('C:\\npm\\opencode.cmd');

    onPlatform('win32', () => startOpencodeAcpProcess({
      command: 'opencode',
      cwd: 'C:\\vault',
      env: { PATH: 'C:\\npm' },
    }));

    expect(findBinaryOnPath).toHaveBeenCalledWith(['opencode.exe', 'opencode.cmd'], 'C:\\npm');
    const spec = constructed[0];
    expect(String(spec.command).toLowerCase()).toContain('cmd.exe');
    expect((spec.args as string[])[3]).toContain('opencode.cmd');
  });

  it('leaves a bare command alone when nothing resolves, so the OS still gets its chance', () => {
    onPlatform('win32', () => startOpencodeAcpProcess({
      command: 'opencode',
      cwd: 'C:\\vault',
      env: {},
    }));

    expect(constructed[0]).toMatchObject({ command: 'opencode' });
  });

  it('does not touch a bare command off Windows, where the OS resolves it correctly', () => {
    onPlatform('linux', () => startOpencodeAcpProcess({
      command: 'opencode',
      cwd: '/vault',
      env: {},
    }));

    expect(findBinaryOnPath).not.toHaveBeenCalled();
    expect(constructed[0]).toMatchObject({ command: 'opencode' });
  });
});
