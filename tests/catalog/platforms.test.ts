import { describe, it, expect } from "vitest";
import { targetPath } from "../../src/catalog/platforms";
import type { AssetMeta } from "../../src/catalog/types";

const partial = (fields: Pick<AssetMeta, "id" | "type">): AssetMeta =>
  fields as unknown as AssetMeta;

describe("targetPath", () => {
  it("maps a skill to .claude/skills/<id>/SKILL.md", () => {
    expect(targetPath(partial({ id: "auditing-vault", type: "skill" }), "claude"))
      .toBe(".claude/skills/auditing-vault/SKILL.md");
  });
  it("throws for non-skill in phase 1", () => {
    expect(() => targetPath(partial({ id: "x", type: "command" }), "claude"))
      .toThrow(/skill/i);
  });
  it("throws for unsupported platform in phase 1", () => {
    expect(() => targetPath(partial({ id: "x", type: "skill" }), "cursor"))
      .toThrow(/claude/i);
  });
});
