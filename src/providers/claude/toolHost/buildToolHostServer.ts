import type { McpStdioServerConfig } from '../../../core/types/mcp';

/** Reserved mcpServers key for the local tool host. Tools surface as `mcp__specorator-tools__<name>`. */
export const LOCAL_TOOL_HOST_SERVER_NAME = 'specorator-tools';

export interface BuildToolHostServerInput {
  enabled: boolean;
  nodePath: string | null;
  hostEntry: string;
  toolsDir: string;
  vaultPath: string;
  /** Curated base env for the child (from curateStdioMcpEnv). */
  baseEnv: Record<string, string>;
  disabledFiles: string[];
  declaredSecrets: string[];
  resolveSecret: (id: string) => string | null;
  /**
   * Monotonic revision bumped on every successful reload. Emitted as an env var
   * the host ignores; its only job is to change the serialized config so the
   * dynamic-update `mcpServersKey` differs → `setMcpServers` re-spawns the host →
   * fresh dir scan, even when tools/secrets/disabled didn't change.
   */
  toolsRev: number;
}

export function buildToolHostServer(input: BuildToolHostServerInput): McpStdioServerConfig | null {
  if (!input.enabled || !input.nodePath) return null;

  const env: Record<string, string> = {
    ...input.baseEnv,
    SPECORATOR_TOOLS_DIR: input.toolsDir,
    SPECORATOR_VAULT_PATH: input.vaultPath,
    // JSON, not comma-join: vault filenames may contain commas, which would split into wrong names.
    SPECORATOR_DISABLED_FILES: JSON.stringify(input.disabledFiles),
    SPECORATOR_TOOLS_REV: String(input.toolsRev),
  };
  for (const id of input.declaredSecrets) {
    const value = input.resolveSecret(id);
    if (value !== null) env[`SPECORATOR_SECRET_${id}`] = value;
  }

  return { type: 'stdio', command: input.nodePath, args: [input.hostEntry], env };
}
