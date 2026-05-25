import { parse as parseYaml } from "yaml";
import type { AssetMeta, AssetType } from "./types";

const NAME_RE = /^[a-z0-9-]{1,64}$/;
const TYPES: AssetType[] = ["skill", "command", "agent", "hook"];
const MAX_DESCRIPTION = 1024;
// A usable skill/asset description tells the agent WHEN to fire it. Accept any
// natural "when"-clause (not a fixed 4-phrase whitelist — R7) so good
// descriptions like "...fires whenever the user mentions orphans" are allowed.
const TRIGGER_RE = /\b(use when|use this when|use to|invoke when|trigger|whenever|when the user|fires when)\b/i;
// Anthropic skill convention: skill names are gerunds. Accept a gerund in ANY
// segment (R7) — "auditing-vault" OR "vault-auditing" — not only the first.
const GERUND_RE = /\b[a-z0-9]*ing\b/;

export function parseAsset(id: string, raw: string): AssetMeta {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`asset ${id}: missing YAML frontmatter`);
  const fm = parseYaml(m[1]) ?? {};
  const body = m[2] ?? "";

  if (typeof fm.name !== "string" || !NAME_RE.test(fm.name))
    throw new Error(`asset ${id}: name must be lowercase-hyphen, <=64 chars`);
  if (fm.name !== id)
    throw new Error(`asset ${id}: frontmatter name must match folder id`);
  if (typeof fm.description !== "string" || fm.description.trim() === "")
    throw new Error(`asset ${id}: description required`);
  if (fm.description.length > MAX_DESCRIPTION)
    throw new Error(`asset ${id}: description must be <=${MAX_DESCRIPTION} chars (got ${fm.description.length})`);
  if (!TYPES.includes(fm.type))
    throw new Error(`asset ${id}: invalid type`);
  // Skills are model-invoked → the description MUST say WHEN to fire. Commands
  // and agents are explicitly invoked (slash command / subagent) and are exempt
  // from the trigger-phrase + gerund rules (R7 scoping).
  if (fm.type === "skill" && !TRIGGER_RE.test(fm.description))
    throw new Error(`asset ${id}: skill description must contain a "use when"/trigger phrase so the agent knows when to fire it`);
  if (fm.type === "skill" && !GERUND_RE.test(fm.name))
    throw new Error(`asset ${id}: skill name should contain a gerund (e.g. "auditing-vault" or "vault-auditing")`);
  if (typeof fm.version !== "string")
    throw new Error(`asset ${id}: version required`);

  return {
    id,
    name: fm.name,
    description: fm.description,
    type: fm.type,
    version: fm.version,
    bundle: fm.bundle ?? "Misc",
    requires: Array.isArray(fm.requires) ? fm.requires.map(String) : [],
    dependsOn: Array.isArray(fm.dependsOn) ? fm.dependsOn.map(String) : [],
    body,
  };
}
