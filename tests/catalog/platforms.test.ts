import { describe, it, expect } from "vitest";
import { targetPath } from "../../src/catalog/platforms";

describe("targetPath", () => {
  it("maps a skill to .claude/skills/<id>/SKILL.md", () => {
    expect(targetPath({ id: "auditing-vault", type: "skill" } as any, "claude"))
      .toBe(".claude/skills/auditing-vault/SKILL.md");
  });
  it("throws for non-skill in phase 1", () => {
    expect(() => targetPath({ id: "x", type: "command" } as any, "claude"))
      .toThrow(/skill/i);
  });
  it("throws for unsupported platform in phase 1", () => {
    expect(() => targetPath({ id: "x", type: "skill" } as any, "cursor"))
      .toThrow(/claude/i);
  });
});
