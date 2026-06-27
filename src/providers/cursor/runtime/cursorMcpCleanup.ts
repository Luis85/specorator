import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Shape Cursor reads from `~/.cursor/mcp.json`. Entries other than our managed
 * `specorator` server are opaque and must be preserved unmodified.
 */
interface CursorMcpJsonShape {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Removes the plugin-managed `mcpServers.specorator` entry from a parsed
 * `~/.cursor/mcp.json` object, preserving every other server and top-level key.
 * Pure: returns whether anything changed plus the new object (the input is not
 * mutated). `changed: false` means the caller can skip the disk write.
 */
export function withoutSpecoratorServer(
  existing: CursorMcpJsonShape | null,
): { changed: boolean; result: CursorMcpJsonShape } {
  const base = existing ?? {};
  const servers = isPlainObject(base.mcpServers) ? base.mcpServers : null;
  if (!servers || !('specorator' in servers)) {
    return { changed: false, result: base };
  }

  const rest = { ...servers };
  delete rest.specorator;
  return { changed: true, result: { ...base, mcpServers: rest } };
}

/**
 * One-shot migration for the dropped user-tool library: older builds wrote a
 * loopback `mcpServers.specorator` entry into `~/.cursor/mcp.json` before each
 * Cursor spawn. The HTTP tool server no longer starts, so that entry now points
 * at a dead server and makes `cursor-agent` retry it on every launch. This
 * strips it (preserving any user-configured servers). Tolerates a missing or
 * unparseable file and never throws — cleanup failure must not block a turn.
 */
export async function cleanupStaleCursorMcpServer(): Promise<void> {
  const mcpJsonPath = path.join(os.homedir(), '.cursor', 'mcp.json');

  try {
    const raw = await fs.readFile(mcpJsonPath, 'utf-8');
    const value = JSON.parse(raw) as unknown;
    const { changed, result } = withoutSpecoratorServer(isPlainObject(value) ? value : null);
    if (changed) {
      await fs.writeFile(mcpJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
    }
  } catch {
    // Missing file, invalid JSON, or write failure → leave config untouched.
    // Best-effort cleanup must never block a turn.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
