import type { McpStdioServerConfig } from '../../../core/types/mcp';
import type { ToolHostSecretRef } from '../settings';

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
  /**
   * Cataloged per-tool secrets declaration (file → declared ids). Emitted as the
   * `SPECORATOR_TOOL_SECRETS` JSON env var so the host grants each tool only the
   * ids its own file declared at catalog time — never the serve-time manifest.
   */
  toolSecretsByFile: Record<string, string[]>;
  /**
   * SEC: the user's explicit allowlist (`name` → keychain `secretId`). A declared
   * secret id resolves ONLY through a matching `name` here, so a tool can never
   * pull an arbitrary global secret (provider keys, MCP creds) by naming its id —
   * the keychain handle is user-chosen, never derived from tool-controlled input.
   */
  allowedSecrets: ToolHostSecretRef[];
  /** Resolve a keychain (SecretStorage) handle to its value, or null when unset. */
  resolveSecret: (secretId: string) => string | null;
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
    // Per-tool cataloged declaration: the host grants ctx.secrets keyed off THIS map.
    SPECORATOR_TOOL_SECRETS: JSON.stringify(input.toolSecretsByFile),
  };
  // Fail closed: a declared id is injected only when the user allowlisted that name.
  // The keychain handle comes from the allowlist entry (user-chosen), so a tool that
  // declares another credential's id gains nothing — it isn't on the allowlist.
  const allowed = new Map(input.allowedSecrets.map((ref) => [ref.name, ref.secretId]));
  for (const id of input.declaredSecrets) {
    const secretId = allowed.get(id);
    if (secretId === undefined) continue;
    const value = input.resolveSecret(secretId);
    if (value !== null) env[`SPECORATOR_SECRET_${id}`] = value;
  }

  return { type: 'stdio', command: input.nodePath, args: [input.hostEntry], env };
}
