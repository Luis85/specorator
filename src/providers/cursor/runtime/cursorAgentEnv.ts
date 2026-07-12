import * as fs from 'fs';
import * as path from 'path';

import {
  buildFullSubprocessEnvironment,
  pickEnvValueCaseInsensitive,
} from '../../../core/providers/subprocessEnvironmentAllowlist';
import type { PluginContext } from '../../../core/types/PluginContext';
import { getEnhancedPath } from '../../../utils/env';

function windowsSystemRoot(): string | undefined {
  return process.env.SystemRoot || process.env.SYSTEMROOT || process.env.WINDIR;
}

function ensureWindowsCursorAgentPath(pathValue: string): string {
  const systemRoot = windowsSystemRoot();
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const prepends = systemRoot
    ? [
      path.win32.join(systemRoot, 'System32'),
      path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    ]
    : [];
  // Appended, not prepended: these exist so GUI hosts with a minimal PATH can
  // find git/bash at all — a git already on the user's PATH must keep winning.
  const appends = [
    path.win32.join(programFiles, 'Git', 'cmd'),
    path.win32.join(programFiles, 'Git', 'bin'),
    path.win32.join(programFilesX86, 'Git', 'cmd'),
    path.win32.join(programFilesX86, 'Git', 'bin'),
  ];

  const segments = pathValue.split(';').filter(Boolean);
  const seen = new Set(segments.map((segment) => segment.toLowerCase()));
  const takeUnseen = (candidates: string[]): string[] => {
    const out: string[] = [];
    for (const candidate of candidates) {
      const key = candidate.toLowerCase();
      if (!seen.has(key)) {
        out.push(candidate);
        seen.add(key);
      }
    }
    return out;
  };
  const prefix = takeUnseen(prepends);
  const suffix = takeUnseen(appends);
  return [...prefix, ...segments, ...suffix].join(';');
}

function resolveWindowsPowerShellShell(): string | undefined {
  const systemRoot = windowsSystemRoot();
  if (!systemRoot) {
    return undefined;
  }
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// Locates Git-for-Windows' Git Bash launcher, if installed. Preferred over
// PowerShell as cursor-agent's executor because a console-less spawn
// (windowsHide) breaks PowerShell — its child loses System32/Git from PATH and
// swallows external-program stdout (ACP capture 2026-07-12) — whereas Git Bash
// resolves git from its own MSYS2 runtime and captures stdout through a pty
// without needing a Windows console.
function findWindowsGitBashShell(): string | undefined {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    path.win32.join(programFiles, 'Git', 'bin', 'bash.exe'),
    path.win32.join(programFilesX86, 'Git', 'bin', 'bash.exe'),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * cursor-agent picks a shell executor at startup using the host's Git-for-Windows
 * signals (MSYSTEM/EXEPATH/MINGW_PREFIX, SHELL). Those signals are preserved so
 * Bash tool calls keep running in Bash instead of silently switching executors.
 * GUI hosts like Obsidian often have a minimal PATH that omits System32, so
 * System32/WindowsPowerShell are prepended for discovery. When the host carries no
 * shell and no Git Bash signals, SHELL is pointed at Git Bash if Git for Windows is
 * installed (a console-less spawn breaks PowerShell — see findWindowsGitBashShell),
 * falling back to PowerShell only when Git Bash is absent.
 */
function applyWindowsCursorAgentShellEnvironment(
  env: Record<string, string>,
  customEnv: Record<string, string>,
): void {
  const userSet = (key: string) => Object.hasOwn(customEnv, key);

  // Cursor Agent uses these Git-for-Windows signals to select its Bash executor.
  // They are paths/mode flags rather than secrets, and preserving them keeps Bash
  // tool calls running in Bash instead of silently switching to PowerShell.
  for (const key of ['MSYSTEM', 'EXEPATH', 'MINGW_PREFIX']) {
    if (!userSet(key) && typeof process.env[key] === 'string' && !env[key]) {
      env[key] = process.env[key];
    }
  }

  env.PATH = ensureWindowsCursorAgentPath(env.PATH ?? '');

  if (!userSet('SHELL')) {
    const shell = env.SHELL ?? '';
    const looksLikeGitBash = /[\\/]git[\\/].*bash\.exe/i.test(shell) || /msys/i.test(shell);
    const hasGitBashSignals = !!env.MSYSTEM || !!env.EXEPATH || !!env.MINGW_PREFIX || looksLikeGitBash;
    if (!shell && !hasGitBashSignals) {
      // Prefer Git Bash over PowerShell: a windowsHide (console-less) spawn breaks
      // PowerShell as cursor-agent's executor (lost System32/Git PATH, swallowed
      // external-program stdout). Fall back to PowerShell only when Git Bash is absent.
      const gitBash = findWindowsGitBashShell();
      if (gitBash) {
        env.SHELL = gitBash;
        // Signals cursor-agent reads to select its Bash executor.
        if (!env.MSYSTEM) {
          env.MSYSTEM = 'MINGW64';
        }
        if (!env.EXEPATH) {
          env.EXEPATH = path.win32.dirname(path.win32.dirname(gitBash));
        }
      } else {
        const powershell = resolveWindowsPowerShellShell();
        if (powershell) {
          env.SHELL = powershell;
        }
      }
    }
  }
}

export function buildCursorAgentEnvironment(
  plugin: PluginContext,
  cliPath?: string,
): Record<string, string> {
  const customEnv = plugin.getResolvedEnvironmentVariables('cursor');
  const env = buildFullSubprocessEnvironment({
    processEnv: process.env,
    customEnv,
    // Passing the CLI path (parity with Claude/Opencode) lets getEnhancedPath
    // add the install dir when it carries a bundled node, so the agent's own
    // child tools can resolve node and sibling binaries.
    pathOverride: getEnhancedPath(pickEnvValueCaseInsensitive(customEnv, 'PATH'), cliPath),
  });

  if (process.platform === 'win32') {
    applyWindowsCursorAgentShellEnvironment(env, customEnv);
  }

  return env;
}
