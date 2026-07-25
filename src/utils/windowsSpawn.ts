// Windows refuses to spawn `.cmd`/`.bat` batch shims without a shell (Node's
// CVE-2024-27980 fix, 18.20.2+/20.12.2+), throwing `spawn EINVAL`. Batch commands
// must run through cmd.exe with verbatim, manually-quoted arguments. Shared by the
// Codex app-server and Cursor CLI spawn paths.

const WINDOWS_CMD_ARGUMENT_CHARS = /[\s"&<>|{}^=;!'+,`~()%@]/u;

export function requiresWindowsShellQuoting(value: string): boolean {
  return WINDOWS_CMD_ARGUMENT_CHARS.test(value)
    || value.includes('[')
    || value.includes(']');
}

export function quoteWindowsShellArgument(value: string): string {
  if (!value.length) {
    return '""';
  }

  if (!requiresWindowsShellQuoting(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

export interface WindowsCmdShim {
  command: string;
  args: string[];
  windowsVerbatimArguments: true;
  /**
   * Entries the child's environment MUST carry — the command line references
   * them. Empty unless some value contained `%`; see {@link wrapWindowsCmdShim}.
   */
  env: Record<string, string>;
}

/**
 * Wraps a batch command and its args to run through cmd.exe with verbatim,
 * manually-quoted arguments. Callers decide *when* to wrap (which command
 * extensions count as batch shims on their platform); this owns the *how*.
 */
export interface BatchAwareSpawnSpec {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
  /**
   * Entries the child's environment must carry when the command was wrapped
   * through cmd.exe. Always present (empty when nothing needed indirection), so
   * a caller cannot silently skip it by never seeing the field.
   */
  env: Record<string, string>;
}

/**
 * Resolves the command/args to hand `spawn()` when the command MIGHT be a Windows
 * batch shim: `.cmd`/`.bat` are wrapped through cmd.exe, and everything else
 * passes through unchanged — every non-Windows platform, `.exe` and native
 * binaries, and a bare command name the OS still has to resolve itself.
 *
 * Promoted out of `providers/cursor/runtime/cursorWindowsSpawn` (which now
 * delegates) when the OpenCode ACP launch needed the same treatment: an
 * npm-installed CLI on Windows IS a `.cmd`, so a provider that spawns a
 * user-pinned path without this hits `spawn EINVAL`.
 */
export function resolveBatchAwareSpawnSpec(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): BatchAwareSpawnSpec {
  const trimmed = command.trim();
  if (!trimmed || platform !== 'win32') {
    return { command, args, env: {} };
  }

  const lower = trimmed.toLowerCase();
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return wrapWindowsCmdShim(trimmed, args);
  }

  return { command, args, env: {} };
}

/**
 * Prefix for the env entries that carry a `%`-bearing value out of the command
 * line. Namespaced so it cannot collide with anything the CLI reads.
 */
const CMD_INDIRECT_ARG_PREFIX = 'SPECORATOR_CMD_ARG_';

export function wrapWindowsCmdShim(command: string, args: readonly string[]): WindowsCmdShim {
  const env: Record<string, string> = {};
  const shellCommand = [command, ...args]
    .map((value, index) => indirectIfVolatile(value, index, env))
    .join(' ');

  return {
    command: process.env.ComSpec || process.env.comspec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${shellCommand}"`],
    windowsVerbatimArguments: true,
    env,
  };
}

/**
 * Keeps a `%`-bearing value literal by moving it OFF the command line.
 *
 * cmd.exe expands `%NAME%` on its command line even inside double quotes, and
 * quoting cannot stop it — so a vault path like `C:\notes\%TEMP%\vault` reaches
 * the CLI as a different directory, and the agent silently works in the wrong
 * workspace. Escaping is not an option either: `%%` is a batch-FILE escape, not a
 * command-line one.
 *
 * So the value travels in the environment instead, and the command line carries
 * only a reference to it. Expansion is a single left-to-right pass — cmd does not
 * re-scan what it substituted — so whatever `%` sequences the value contains
 * arrive intact. Values without `%` are quoted inline exactly as before, which
 * keeps the common case byte-identical.
 */
function indirectIfVolatile(value: string, index: number, env: Record<string, string>): string {
  if (!value.includes('%')) {
    return quoteWindowsShellArgument(value);
  }
  const name = `${CMD_INDIRECT_ARG_PREFIX}${index}`;
  env[name] = value;
  return `"%${name}%"`;
}
