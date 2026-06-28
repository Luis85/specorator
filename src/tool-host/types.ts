/** MCP tool result content block (text-only for v1). */
export interface McpTextContent {
  type: 'text';
  text: string;
}

/** Raw MCP CallTool result a handler may return directly. */
export interface CallToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

/** JSON Schema object describing a tool's input (passed straight to MCP). */
export type JsonSchema = Record<string, unknown>;

export interface ToolManifest {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** SecretStorage-backed secret ids this tool needs (exposed via ctx.secrets). */
  secrets?: string[];
}

export interface ToolHandlerCtx {
  vaultPath: string;
  vault: {
    read(relPath: string): Promise<string>;
    write(relPath: string, content: string): Promise<void>;
    exists(relPath: string): Promise<boolean>;
    list(relPath: string): Promise<string[]>;
  };
  logger: {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  secrets: Record<string, string>;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolHandlerCtx,
) => Promise<string | CallToolResult> | string | CallToolResult;

export interface ToolModule {
  manifest: ToolManifest;
  handler: ToolHandler;
}

export interface LoadedTool {
  file: string;
  manifest: ToolManifest;
  handler: ToolHandler;
}

export interface LoadError {
  file: string;
  message: string;
}

export interface LoadResult {
  tools: LoadedTool[];
  errors: LoadError[];
}

export interface CatalogPayload {
  tools: Array<{ file: string; name: string; description: string; secrets: string[] }>;
  errors: LoadError[];
}

/**
 * Result of one runtime-independent local-tool-host scan. `catalog` is null when
 * the feature is off or Node is missing/<18 (the host stays disabled). `materialized`
 * is true only when the embedded host was written/confirmed on disk this pass.
 *
 * `scanFailed` is true when the host materialized but `--catalog` failed (process
 * error, non-zero/timeout exit, or invalid output). It must NOT be treated as a
 * disabled scan or a successful empty catalog: applying it leaves prior caches
 * (declared-secret union, `hostMaterialized`) intact rather than clobbering a
 * previously-good union with `[]` — a silent secrets-drop.
 *
 * `nodePath`/`env` are the VALIDATED spawn parameters this scan used: the Node
 * binary that passed the ≥18 probe and the curated env it ran with. The sync
 * per-turn builder reuses these cached values instead of re-resolving Node (which
 * can't re-run the async probe), so a PATH change that points at an older `node`
 * is honored only on the NEXT scan — never injected into a `node18`-targeted host
 * mid-session. Present only on a successful scan.
 */
export interface ToolHostScan {
  catalog: CatalogPayload | null;
  declaredSecretIds: string[];
  materialized: boolean;
  scanFailed?: boolean;
  /** Validated Node binary (passed the ≥18 probe) the host/catalog spawned with. */
  nodePath?: string;
  /** Curated env the host/catalog spawned with (PATH-resolved, NODE_OPTIONS-stripped). */
  env?: Record<string, string>;
}
