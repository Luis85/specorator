import type { AssetMeta, FileSystem, Platform } from "./types";
import { resolveOrder } from "./deps";
import { targetPath, supportedPlatforms } from "./platforms";
import { renderAsset } from "./render";
import { decideAction } from "./conflict";
import { sha256 } from "./hash";
import { writeBackup } from "./backup";
import { loadState, saveRecord, removeRecord } from "./sidecar";
import { appendAudit } from "./auditlog";
import { partitionTools, allowedToolsLine } from "./policy";
import { geminiManifest, GEMINI_MANIFEST_PATH } from "./gemini";
import { scanForInjection, HARD_BLOCK_KINDS } from "./scanner";

export class ConflictError extends Error {
  constructor(public path: string) {
    super(`conflict: ${path} is not managed by Specorator`);
    this.name = "ConflictError";
  }
}

/** R2: the Phase 2 installer rewrite must KEEP the Phase 1 scan gate — dropping
 *  it silently regressed B3. A hard-block finding (hidden-unicode) throws this. */
export class ScanBlockedError extends Error {
  constructor(public assetId: string, public kinds: string[]) {
    super(`scan blocked install of ${assetId}: ${kinds.join(", ")}`);
    this.name = "ScanBlockedError";
  }
}

export type ConflictChoice = "overwrite" | "backup" | "skip";

export interface EnableOptions {
  /** H5: resolve an untracked-file conflict (skip/backup/overwrite). If absent, throw. */
  onConflict?: (path: string) => Promise<ConflictChoice>;
  /** resolve a Specorator-tracked-but-user-edited file. */
  onUserModified?: (path: string) => Promise<ConflictChoice>;
}

/** What enableAsset reports back so the consent UI can surface destructive grants (B4). */
export interface EnableResult {
  /** "<id> → <tool>" pairs requiring explicit consent (default-denied). */
  destructive: string[];
}

function parentDir(p: string): string { return p.slice(0, p.lastIndexOf("/")) || "."; }

function trackedHashFor(
  state: Record<string, { paths: string[]; hash: string }>, path: string,
): string | null {
  for (const r of Object.values(state)) {
    if (r.paths.includes(path)) return r.hash;
  }
  return null;
}

export async function enableAsset(
  fs: FileSystem, root: AssetMeta, catalog: AssetMeta[],
  platforms: Platform[], opts: EnableOptions = {},
): Promise<EnableResult> {
  const order = resolveOrder(root.id, catalog);
  let state = await loadState(fs);
  const destructiveAll: string[] = [];

  for (const id of order) {
    if (state[id]) continue;
    const a = catalog.find((x) => x.id === id)!;
    const bodyHash = await sha256(a.body);

    // R2 / Decision 4: scan gate runs BEFORE any write and HARD-BLOCKS,
    // independent of the UI. (Phase 2 must keep this — its absence regressed B3.)
    const scan = scanForInjection(a.body);
    const blocking = scan.findings.filter((f) => HARD_BLOCK_KINDS.includes(f.kind));
    if (blocking.length > 0) throw new ScanBlockedError(a.id, blocking.map((f) => f.kind));

    // B4: partition this asset's requires; destructive tools are surfaced, never auto-granted.
    const { destructive } = partitionTools(a.requires);
    for (const t of destructive) destructiveAll.push(`${id} → ${t}`);

    // R5: least-privilege allowed-tools value, injected into the asset's frontmatter.
    const allowedTools = allowedToolsLine(a.requires);

    // Only emit for platforms that actually support this asset type (H7 scoping).
    const targets = platforms.filter((p) => supportedPlatforms(a).includes(p));

    // H4 / Decision 5: track everything written for THIS asset so we can roll back
    // atomically if any later platform write fails.
    const written: string[] = [];
    const rollback = async (): Promise<void> => {
      for (const p of written) {
        if (await fs.exists(p)) await fs.remove(p);
      }
    };

    try {
      const paths: string[] = [];
      for (const platform of targets) {
        const path = targetPath(a, platform);
        const exists = await fs.exists(path);
        const trackedHash = trackedHashFor(state, path);
        const action = decideAction({
          exists, tracked: trackedHash !== null, hashMatches: trackedHash === bodyHash,
        });

        if (action === "conflict") {
          // H5: defer to the UI; throw only if no handler was provided.
          if (!opts.onConflict) throw new ConflictError(path);
          const choice = await opts.onConflict(path);
          if (choice === "skip") continue;
          if (choice === "backup") await writeBackup(fs, path);
        }
        if (action === "user-modified") {
          const choice = (await opts.onUserModified?.(path)) ?? "skip";
          if (choice === "skip") continue;
          if (choice === "backup") await writeBackup(fs, path);
        }

        await fs.mkdirp(parentDir(path));
        // R5: allowed-tools is injected into the asset's own frontmatter (the
        // location the host agent reads), NOT a sidecar file Claude ignores.
        const content = allowedTools ? renderAsset(a, platform, allowedTools) : renderAsset(a, platform);
        await fs.write(path, content);
        written.push(path);
        paths.push(path);

        // B6: ensure Gemini registers the extension dir.
        if (platform === "gemini" && !(await fs.exists(GEMINI_MANIFEST_PATH))) {
          await fs.mkdirp(parentDir(GEMINI_MANIFEST_PATH));
          await fs.write(GEMINI_MANIFEST_PATH, geminiManifest(a.version));
          written.push(GEMINI_MANIFEST_PATH);
          paths.push(GEMINI_MANIFEST_PATH);
        }
      }

      await saveRecord(fs, id, { version: a.version, platforms: targets, paths, hash: bodyHash });
      await appendAudit(fs, { action: "enable", id, hash: bodyHash });
      state = await loadState(fs);
    } catch (e) {
      await rollback();          // remove partial files for this asset
      throw e;                   // ...and do NOT save a record (Decision 5)
    }
  }

  return { destructive: destructiveAll };
}

export async function disableAsset(fs: FileSystem, id: string): Promise<void> {
  const state = await loadState(fs);
  const rec = state[id];
  if (!rec) return;
  for (const path of rec.paths) {
    if (await fs.exists(path)) await fs.remove(path);
  }
  await removeRecord(fs, id);
  await appendAudit(fs, { action: "disable", id, hash: rec.hash });
}
