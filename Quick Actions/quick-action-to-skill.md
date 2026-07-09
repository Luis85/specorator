---
type: quick-action
name: Quick action to skill
description: Turn a quick-action note into a reusable Claude skill (SKILL.md), asking whether to save it to the project or to your user settings. Portable across vaults.
icon: wand-2
tags:
  - skill
  - quick-action
  - portable
---
Convert a **quick-action** into a reusable **skill** (`SKILL.md`). A quick-action is a one-tap prompt; a skill is a reusable capability an agent auto-loads when its trigger matches. This turns the former into the latter.

## Input
- The source is the **quick-action note** attached to this message (its frontmatter has `name`, `description`, `icon`, `tags`; its body is the prompt). If nothing is attached, ask me which quick-action to convert.

## What a skill is (Claude Code `SKILL.md`)
- A skill lives in its own folder: `<skills-root>/<skill-name>/SKILL.md`.
- Frontmatter: `name` (lowercase-hyphen, **must equal the folder name**, unique across the root), `description` (the dispatch trigger — third person, leads with "Use when …", states the conditions **and** what it does), and optional `allowed-tools` (comma-separated) only when the skill truly needs a fixed tool set.
- Body: concise, imperative instructions — the reusable "how", not a one-off command.

## 1. Choose the save location — ASK me first, don't write until I pick
- **Project** → `.claude/skills/<name>/SKILL.md` inside this project/vault. Shared with the repo, committed, scoped to this project only.
- **User settings (global)** → `~/.claude/skills/<name>/SKILL.md` in my home directory. Available in every project for me, not committed. Resolve `~` to the real home path (`$HOME` / `%USERPROFILE%`) and write with the absolute path (this lands **outside** the vault).
- If this project targets a non-Claude agent, use that agent's skills root instead (e.g. Codex `.codex/skills/<name>/SKILL.md`) — same project-vs-user choice.

## 2. Derive the skill
- **name**: from the quick-action name → lowercase, hyphens, unique; prefer a verb/gerund phrasing; it must equal the folder name. Check for a collision in the chosen root; if taken, propose a variant.
- **description** — the single most important field. It is the *only* thing an agent reads when deciding whether to load this skill, so a weak description means the skill never fires. Write it third person, lead with "Use when …", enumerate the concrete trigger situations, then say what the skill does. Mine triggers from the quick-action's name, description, and tags — do **not** just copy the quick-action's description.
- **body** — rewrite the quick-action prompt as a *reusable* skill:
  - Generalize one-shot phrasing ("the attached note") into conditions ("the note or target the user provides").
  - Keep the concrete steps, rules, formats, and gotchas that carry the value — those are the point.
  - Keep it tight. If it is long, move reference detail into sibling files (`<name>/reference.md`, `<name>/examples.md`) and point to them from `SKILL.md` so the skill stays scannable.
  - Imperative voice, no filler, no restating the description.
- **allowed-tools**: include only if the source clearly requires a specific tool set; otherwise omit and let the skill inherit the session's tools.

## 3. Preview, then write
- Show me the target path, the `name`, the full `description`, and the complete `SKILL.md` body. Get a yes before writing.
- Create the folder and write `SKILL.md`. Frontmatter safety: unaliased links only, quote any value containing `#` `/` `:` `|` `@`, and never start a scalar with a backtick or `@`.
- Confirm the path and how it becomes discoverable: **project** skills load from the repo for anyone on it; **user** skills apply across all my projects. Note a new skill may need an app reload / skills rescan before it appears.

## Keep the source
Produce the skill **from** the quick-action — do not delete or modify the original quick-action unless I ask.

Start by confirming which quick-action you're converting, then ask me: **project or user settings?**
