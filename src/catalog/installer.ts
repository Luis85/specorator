import { stringify as stringifyYaml } from "yaml";
import type { AssetMeta, FileSystem, Platform } from "./types";
import { resolveOrder } from "./deps";
import { targetPath } from "./platforms";
import { sha256 } from "./hash";
import { scanForInjection, HARD_BLOCK_KINDS } from "./scanner";
import { loadState, saveRecord, removeRecord } from "./sidecar";

/** Thrown when the pre-write injection scan finds a hard-block finding. */
export class ScanBlockedError extends Error {
  constructor(public assetId: string, public kinds: string[]) {
    super(`scan blocked install of ${assetId}: ${kinds.join(", ")}`);
    this.name = "ScanBlockedError";
  }
}

/**
 * Build the SKILL.md file content (frontmatter + body) for an asset.
 * Decision 2: emit YAML via `yaml` stringify so a description containing a
 * colon/comma/quote can never break the `---` block.
 */
function renderSkillFile(a: AssetMeta): string {
  const frontmatter = stringifyYaml({ name: a.name, description: a.description }).trimEnd();
  return `---\n${frontmatter}\n---\n${a.body}`;
}

export async function enableAsset(
  fs: FileSystem,
  asset: AssetMeta,
  catalog: AssetMeta[],
  platforms: Platform[]
): Promise<void> {
  const order = resolveOrder(asset.id, catalog);
  let state = await loadState(fs); // H1: refreshed at the end of each iteration

  for (const id of order) {
    if (Object.hasOwn(state, id)) continue; // already installed (state is current — see H1 refresh)
    const a = catalog.find((x) => x.id === id)!;

    // Decision 4 / B3: scan gate runs BEFORE any write and hard-blocks.
    const scan = scanForInjection(a.body);
    const blocking = scan.findings.filter((f) => HARD_BLOCK_KINDS.includes(f.kind));
    if (blocking.length > 0)
      throw new ScanBlockedError(a.id, blocking.map((f) => f.kind));

    // Decision 5 / H4: track every path written for THIS asset so we can roll
    // back if a later platform write — or the record write — throws mid-asset.
    const written: string[] = [];
    try {
      for (const platform of platforms) {
        const path = targetPath(a, platform);
        if ((await fs.exists(path)) && !isTracked(state, path))
          throw new Error(`conflict: ${path} already exists and is not managed by Specorator`);
        await fs.mkdirp(parentDir(path));
        await fs.write(path, renderSkillFile(a));
        written.push(path);
      }
      await saveRecord(fs, id, {
        version: a.version, platforms, paths: written, hash: await sha256(a.body),
      });
    } catch (e) {
      for (const path of written) {
        if (await fs.exists(path)) await fs.remove(path);
      }
      await removeRecord(fs, id); // ensure no partial record survives
      throw e; // no record saved for this asset
    }

    state = await loadState(fs); // H1: refresh so shared deps are seen as installed
  }
}

export async function disableAsset(fs: FileSystem, id: string): Promise<void> {
  const state = await loadState(fs);
  if (!Object.hasOwn(state, id)) return;
  const rec = state[id];
  for (const path of rec.paths) {
    if (await fs.exists(path)) await fs.remove(path);
  }
  await removeRecord(fs, id);
}

function isTracked(state: Record<string, { paths: string[] }>, path: string): boolean {
  return Object.values(state).some((r) => r.paths.includes(path));
}
function parentDir(path: string): string {
  return path.slice(0, path.lastIndexOf("/")) || ".";
}
