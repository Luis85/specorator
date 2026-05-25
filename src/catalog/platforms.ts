import type { AssetMeta, Platform } from "./types";

// Phase 1: skills + Claude only. Table is ready to extend (research §5):
//   codex skills => .agents/skills/<id>/SKILL.md  (NOT .codex/)
//   gemini       => <ext>/skills/<id>/SKILL.md
//   cursor       => .cursor/skills/<id>/SKILL.md
export function targetPath(asset: AssetMeta, platform: Platform): string {
  if (asset.type !== "skill")
    throw new Error(`phase 1 supports skill assets only (got ${asset.type})`);
  if (platform !== "claude")
    throw new Error(`phase 1 supports the claude platform only (got ${platform})`);
  return `.claude/skills/${asset.id}/SKILL.md`;
}
