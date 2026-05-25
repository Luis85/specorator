import { describe, it, expect } from "vitest";
import { enableAsset, updateAsset } from "../../src/catalog/installer";
import { loadState } from "../../src/catalog/sidecar";
import { memFs } from "./memfs";
import type { AssetMeta } from "../../src/catalog/types";

const v1: AssetMeta = { id: "x", name: "x", description: "d", type: "skill", version: "0.1.0", bundle: "B", requires: [], dependsOn: [], body: "# Old" };
const v2: AssetMeta = { ...v1, version: "0.2.0", body: "# New" };
const v3: AssetMeta = { ...v1, version: "0.3.0", body: "# Newer" };
const PATH = ".claude/skills/x/SKILL.md";

const hookV1: AssetMeta = {
  id: "h", name: "h", description: "d", type: "hook", version: "0.1.0",
  bundle: "B", requires: [], dependsOn: [],
  body: '```json\n{"id":"h","event":"SessionStart","entry":{"matcher":"*","command":"echo v1"}}\n```',
};
const hookV2: AssetMeta = {
  ...hookV1, version: "0.2.0",
  body: '```json\n{"id":"h","event":"SessionStart","entry":{"matcher":"*","command":"echo v2"}}\n```',
};

// Capture the backup paths the update flow reports via its warn sink.
function bakCollector() {
  const baks: string[] = [];
  const warn = (m: string) => {
    const at = m.indexOf("backed up at ");
    if (at >= 0) for (const p of m.slice(at + "backed up at ".length).split(", ")) baks.push(p.trim());
  };
  return { baks, warn };
}

describe("updateAsset", () => {
  it("backs up the old file, writes the new version, bumps the record", async () => {
    const fs = memFs();
    const { baks, warn } = bakCollector();
    await enableAsset(fs, v1, [v1], ["claude"]);
    await updateAsset(fs, v2, [v2], ["claude"], { warn });
    expect(await fs.read(PATH)).toContain("# New");
    expect((await loadState(fs)).x.version).toBe("0.2.0");
    // a timestamped .bak preserves the old body
    expect(baks.length).toBe(1);
    expect(baks[0]).toMatch(/SKILL\.md\..*\.bak$/);
    expect(await fs.read(baks[0])).toContain("# Old");
  });

  it("rotates .bak files so a second update does not overwrite the first backup", async () => {
    const fs = memFs();
    const { baks, warn } = bakCollector();
    await enableAsset(fs, v1, [v1], ["claude"]);
    await updateAsset(fs, v2, [v2], ["claude"], { warn }); // 0.1.0 -> 0.2.0 (backs up # Old)
    await updateAsset(fs, v3, [v3], ["claude"], { warn }); // 0.2.0 -> 0.3.0 (backs up # New)
    expect(baks.length).toBe(2);            // both backups retained, distinct paths
    expect(new Set(baks).size).toBe(2);     // not clobbered onto the same path
    const bodies = await Promise.all(baks.map((p) => fs.read(p)));
    expect(bodies.join("\n")).toContain("# Old");
    expect(bodies.join("\n")).toContain("# New");
    expect(await fs.read(PATH)).toContain("# Newer");
  });

  it("threads opts so updating a HOOK does not silently drop it", async () => {
    const fs = memFs();
    await enableAsset(fs, hookV1, [hookV1], ["claude"], { enableHooks: true });
    await updateAsset(fs, hookV2, [hookV2], ["claude"], { enableHooks: true });
    const json = JSON.parse((await fs.read(".claude/hooks/hooks.json"))!);
    expect(json.SessionStart[0].command).toBe("echo v2"); // still present + updated
    expect((await loadState(fs)).h.version).toBe("0.2.0");
  });

  it("does not throw when the audit record is missing (e.g. hook off / conflict skip)", async () => {
    const fs = memFs();
    await enableAsset(fs, hookV1, [hookV1], ["claude"]); // enableHooks omitted → nothing recorded
    // record never created; updateAsset must no-op rather than throw on a missing record
    await expect(updateAsset(fs, hookV2, [hookV2], ["claude"])).resolves.toBeUndefined();
  });
});
