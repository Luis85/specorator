import path from 'node:path';

export interface ToolHostPathsInput {
  vaultPath: string;
  /** Plugin folder relative to the vault root (Obsidian `manifest.dir`). */
  pluginDir: string;
}

export interface ToolHostPaths {
  hostEntry: string;
  toolsDir: string;
}

export function resolveToolHostPaths(input: ToolHostPathsInput): ToolHostPaths {
  return {
    hostEntry: path.join(input.vaultPath, input.pluginDir, 'tool-host.mjs'),
    toolsDir: path.join(input.vaultPath, '.specorator', 'tools'),
  };
}
