import type { AssetMeta, FileSystem, Platform, InstalledRecord } from "./types";
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
import { mergeHook, unmergeHook, HOOKS_PATH, type HookFragment } from "./hooks";
import { detectSyncedVault } from "../settings/HookConsentModal";

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
  /** Phase 3: opt-in flag to merge hook assets into hooks.json. OFF by default. */
  enableHooks?: boolean;
  /** Phase 3: sink for non-fatal warnings (synced-vault notice, backup paths). */
  warn?: (msg: string) => void;
}

/** What enableAsset reports back so the consent UI can surface destructive grants (B4). */
export interface EnableResult {
  /** "<id> → <tool>" pairs requiring explicit consent (default-denied). */
  destructive: string[];
}

function parentDir(p: string): string { return p.slice(0, p.lastIndexOf("/")) || "."; }

function parseHookFragment(body: string): HookFragment {
  const m = /```json\n([\s\S]*?)\n```/.exec(body);
  if (!m) throw new Error("hook asset missing ```json fragment");
  return JSON.parse(m[1]) as HookFragment;
}

function trackedHashFor(
  state: Record<string, { paths: string[]; hash: string }>, path: string,
): string | null {
  for (const r of Object.values(state)) {
    if (r.paths.includes(path)) return r.hash;
  }
  return null;
}

/** Resolve the conflict/user-modified action and return false if the path should be skipped. */
async function resolveConflict(
  action: "conflict" | "user-modified",
  path: string,
  fs: FileSystem,
  opts: EnableOptions,
): Promise<boolean> {
  if (action === "conflict") {
    if (opts.onConflict === undefined) throw new ConflictError(path);
    const choice = await opts.onConflict(path);
    if (choice === "skip") return false;
    if (choice === "backup") await writeBackup(fs, path);
  } else {
    // user-modified
    const handler = opts.onUserModified;
    const choice = handler !== undefined ? await handler(path) : "skip";
    if (choice === "skip") return false;
    if (choice === "backup") await writeBackup(fs, path);
  }
  return true;
}

/** Emit the Gemini extension manifest if this is a gemini write and the manifest is absent. */
async function maybeEmitGeminiManifest(
  platform: Platform, version: string, fs: FileSystem, written: string[], paths: string[],
): Promise<void> {
  if (platform !== "gemini") return;
  if (await fs.exists(GEMINI_MANIFEST_PATH)) return;
  await fs.mkdirp(parentDir(GEMINI_MANIFEST_PATH));
  await fs.write(GEMINI_MANIFEST_PATH, geminiManifest(version));
  written.push(GEMINI_MANIFEST_PATH);
  paths.push(GEMINI_MANIFEST_PATH);
}

async function writePlatformFile(
  a: AssetMeta, platform: Platform, bodyHash: string, allowedTools: string,
  state: Record<string, { paths: string[]; hash: string; version: string; platforms: Platform[] }>,
  fs: FileSystem, opts: EnableOptions, written: string[], paths: string[],
): Promise<void> {
  const path = targetPath(a, platform);
  const exists = await fs.exists(path);
  const trackedHash = trackedHashFor(state, path);
  const action = decideAction({ exists, tracked: trackedHash !== null, hashMatches: trackedHash === bodyHash });

  if (action === "conflict" || action === "user-modified") {
    const proceed = await resolveConflict(action, path, fs, opts);
    if (!proceed) return;
  }

  await fs.mkdirp(parentDir(path));
  await fs.write(path, renderAsset(a, platform, allowedTools !== "" ? allowedTools : undefined));
  written.push(path);
  paths.push(path);
  await maybeEmitGeminiManifest(platform, a.version, fs, written, paths);
}

async function installHookAsset(
  fs: FileSystem,
  a: AssetMeta,
  opts: EnableOptions,
): Promise<void> {
  // Hooks are opt-in — never merge without explicit consent.
  if (opts.enableHooks !== true) return;

  const bodyHash = await sha256(a.body);

  // Synced-vault warning before any merge.
  const sync = await detectSyncedVault(fs);
  if (sync !== null) {
    const warnFn = opts.warn ?? ((m: string) => { console.warn(m); });
    warnFn(
      `specorator: enabling hook "${a.id}" in a vault under ${sync}; ` +
        `the auto-running command will propagate to everything that syncs this vault.`,
    );
  }

  const frag = parseHookFragment(a.body);
  await mergeHook(fs, HOOKS_PATH, frag);
  await saveRecord(fs, a.id, {
    version: a.version,
    platforms: ["claude"],
    paths: [HOOKS_PATH],
    hash: bodyHash,
  });
  await appendAudit(fs, { action: "enable", id: a.id, hash: bodyHash });
}

async function installAsset(
  fs: FileSystem,
  a: AssetMeta,
  state: Record<string, { paths: string[]; hash: string; version: string; platforms: Platform[] }>,
  platforms: Platform[],
  opts: EnableOptions,
  destructiveAll: string[],
): Promise<void> {
  // Phase 3: hook assets follow a separate path (hooks.json merge, not file write).
  if (a.type === "hook") {
    await installHookAsset(fs, a, opts);
    return;
  }

  const bodyHash = await sha256(a.body);

  // R2 / Decision 4: scan gate BEFORE any write, HARD-BLOCKS.
  const scan = scanForInjection(a.body);
  const blocking = scan.findings.filter((f) => HARD_BLOCK_KINDS.includes(f.kind));
  if (blocking.length > 0) throw new ScanBlockedError(a.id, blocking.map((f) => f.kind));

  // B4: partition requires; destructive tools are surfaced, never auto-granted.
  const { destructive } = partitionTools(a.requires);
  for (const t of destructive) destructiveAll.push(`${a.id} → ${t}`);

  // R5: least-privilege allowed-tools value.
  const allowedTools = allowedToolsLine(a.requires);

  // Only emit for platforms that support this asset type (H7 scoping).
  const targets = platforms.filter((p) => supportedPlatforms(a).includes(p));

  // H4 / Decision 5: per-asset rollback list.
  const written: string[] = [];
  const rollback = async (): Promise<void> => {
    for (const p of written) {
      if (await fs.exists(p)) await fs.remove(p);
    }
  };

  try {
    const paths: string[] = [];
    for (const platform of targets) {
      await writePlatformFile(a, platform, bodyHash, allowedTools, state, fs, opts, written, paths);
    }
    await saveRecord(fs, a.id, { version: a.version, platforms: targets, paths, hash: bodyHash });
    await appendAudit(fs, { action: "enable", id: a.id, hash: bodyHash });
  } catch (e) {
    await rollback();
    throw e;
  }
}

export async function enableAsset(
  fs: FileSystem, root: AssetMeta, catalog: AssetMeta[],
  platforms: Platform[], opts: EnableOptions = {},
): Promise<EnableResult> {
  const order = resolveOrder(root.id, catalog);
  const destructiveAll: string[] = [];

  for (const id of order) {
    // Refresh state each iteration so shared deps installed earlier are visible (H1).
    const state = await loadState(fs);
    if (Object.hasOwn(state, id)) continue;
    const a = catalog.find((x) => x.id === id)!;
    await installAsset(fs, a, state, platforms, opts, destructiveAll);
  }

  return { destructive: destructiveAll };
}

// Timestamped backup so a second update does not clobber the first .bak.
// Returns the created backup path (or null if there was nothing to back up).
// A numeric suffix guarantees a unique path even within the same millisecond.
async function writeRotatedBackup(fs: FileSystem, path: string): Promise<string | null> {
  if (!(await fs.exists(path))) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  let bak = `${path}.${ts}.bak`;
  for (let n = 1; await fs.exists(bak); n++) bak = `${path}.${ts}-${n}.bak`;
  await fs.write(bak, (await fs.read(path)) ?? "");
  return bak;
}

export async function updateAsset(
  fs: FileSystem,
  asset: AssetMeta,
  catalog: AssetMeta[],
  platforms: Platform[],
  opts: EnableOptions = {},
): Promise<void> {
  const state = await loadState(fs);
  const rec = (state as Record<string, InstalledRecord | undefined>)[asset.id];
  if (rec === undefined) return; // not installed (or hook never opted-in) → nothing to update
  const baks: string[] = [];
  for (const path of rec.paths) {
    // Hooks share the hooks.json — skip rotated backup for the shared file
    // (mergeHook/unmergeHook handle that internally); only back up asset-owned files.
    if (path === HOOKS_PATH) continue;
    const b = await writeRotatedBackup(fs, path);
    if (b !== null) baks.push(b);
  }
  await disableAsset(fs, asset.id);               // removes old files + record
  await enableAsset(fs, asset, catalog, platforms, opts); // forward opts (enableHooks etc.)
  await appendAudit(fs, { action: "update", id: asset.id, hash: await sha256(asset.body) });
  // Surface the rotated backups so the caller can offer cleanup.
  if (baks.length > 0) {
    const warnFn = opts.warn ?? ((m: string) => { console.warn(m); });
    warnFn(
      `specorator: updated "${asset.id}"; previous version(s) backed up at ${baks.join(", ")}`,
    );
  }
}

export async function disableAsset(fs: FileSystem, id: string): Promise<void> {
  const state = await loadState(fs);
  if (!Object.hasOwn(state, id)) return;
  const rec = state[id];
  // Phase 3: hook records have exactly [HOOKS_PATH] — unmerge instead of remove.
  if (rec.paths.length === 1 && rec.paths[0] === HOOKS_PATH) {
    await unmergeHook(fs, HOOKS_PATH, id);
  } else {
    for (const path of rec.paths) {
      if (await fs.exists(path)) await fs.remove(path);
    }
  }
  await removeRecord(fs, id);
  await appendAudit(fs, { action: "disable", id, hash: rec.hash });
}
