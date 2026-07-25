import {
  quoteWindowsShellArgument,
  requiresWindowsShellQuoting,
  wrapWindowsCmdShim,
} from '@/utils/windowsSpawn';

describe('requiresWindowsShellQuoting', () => {
  it('is false for plain tokens', () => {
    expect(requiresWindowsShellQuoting('cursor-agent')).toBe(false);
    expect(requiresWindowsShellQuoting('--resume')).toBe(false);
  });

  it('is true for whitespace, brackets, and cmd metacharacters', () => {
    expect(requiresWindowsShellQuoting('a b')).toBe(true);
    expect(requiresWindowsShellQuoting('C:\\Program Files\\x')).toBe(true);
    expect(requiresWindowsShellQuoting('arr[0]')).toBe(true);
    expect(requiresWindowsShellQuoting('a&b')).toBe(true);
    expect(requiresWindowsShellQuoting('a|b')).toBe(true);
  });
});

describe('quoteWindowsShellArgument', () => {
  it('quotes the empty string explicitly', () => {
    expect(quoteWindowsShellArgument('')).toBe('""');
  });

  it('leaves quoting-free tokens untouched', () => {
    expect(quoteWindowsShellArgument('plain')).toBe('plain');
  });

  it('wraps tokens needing quoting and doubles embedded quotes', () => {
    expect(quoteWindowsShellArgument('a b')).toBe('"a b"');
    expect(quoteWindowsShellArgument('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('wrapWindowsCmdShim', () => {
  const originalComSpec = process.env.ComSpec;
  const originalComspec = process.env.comspec;

  afterEach(() => {
    if (originalComSpec === undefined) delete process.env.ComSpec;
    else process.env.ComSpec = originalComSpec;
    if (originalComspec === undefined) delete process.env.comspec;
    else process.env.comspec = originalComspec;
  });

  it('routes through ComSpec with the verbatim cmd.exe flags', () => {
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
    const spec = wrapWindowsCmdShim('cursor.cmd', ['--resume', 'session id']);
    expect(spec.command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(spec.args[0]).toBe('/d');
    expect(spec.args[1]).toBe('/s');
    expect(spec.args[2]).toBe('/c');
    expect(spec.windowsVerbatimArguments).toBe(true);
  });

  it('quotes each token inside the single /c argument', () => {
    process.env.ComSpec = 'cmd.exe';
    const spec = wrapWindowsCmdShim('C:\\Program Files\\cli.cmd', ['plain', 'a b']);
    expect(spec.args[3]).toBe('""C:\\Program Files\\cli.cmd" plain "a b""');
  });

  it('carries a %-bearing value in the environment, not on the command line', () => {
    // cmd.exe expands `%NAME%` on its command line even inside double quotes, and
    // there is no command-line escape for it (`%%` is a batch-FILE escape). A
    // vault path like `C:\\notes\\%TEMP%\\vault` would reach the CLI as a
    // different directory and the agent would work in the wrong workspace.
    process.env.ComSpec = 'cmd.exe';
    const spec = wrapWindowsCmdShim('cli.cmd', ['--cwd=C:\\notes\\%TEMP%\\vault']);

    expect(spec.args[3]).toBe('"cli.cmd "%SPECORATOR_CMD_ARG_1%""');
    // Expansion is a single pass, so the `%TEMP%` inside the VALUE is not
    // re-scanned — it arrives literally.
    expect(spec.env).toEqual({ SPECORATOR_CMD_ARG_1: '--cwd=C:\\notes\\%TEMP%\\vault' });
  });

  it('indirects the command itself when IT holds a percent', () => {
    process.env.ComSpec = 'cmd.exe';
    const spec = wrapWindowsCmdShim('C:\\%APPDATA%\\cli.cmd', ['plain']);

    expect(spec.args[3]).toBe('""%SPECORATOR_CMD_ARG_0%" plain"');
    expect(spec.env.SPECORATOR_CMD_ARG_0).toBe('C:\\%APPDATA%\\cli.cmd');
  });

  it('leaves the common case byte-identical — no percent, no environment', () => {
    // The indirection must not become the default path: every existing Windows
    // launch has to keep spawning exactly the command line it did before.
    process.env.ComSpec = 'cmd.exe';
    const spec = wrapWindowsCmdShim('C:\\Program Files\\cli.cmd', ['plain', 'a b']);

    expect(spec.args[3]).toBe('""C:\\Program Files\\cli.cmd" plain "a b""');
    expect(spec.env).toEqual({});
  });

  it('falls back to cmd.exe when ComSpec is unset', () => {
    delete process.env.ComSpec;
    delete process.env.comspec;
    expect(wrapWindowsCmdShim('x.cmd', []).command).toBe('cmd.exe');
  });
});
