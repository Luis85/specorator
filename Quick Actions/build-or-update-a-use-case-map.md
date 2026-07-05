---
type: quick-action
name: Build or update a use-case map
description: Discover a project's user-facing views and use-cases and render them as an Obsidian canvas — each view and use-case its own note. Creates or updates; portable across any vault or project.
icon: workflow
tags:
  - use-case-map
  - canvas
  - portable
---
Build or update a **use-case map** for this project: an Obsidian canvas that puts every user-facing **view / surface** of the app on the left, and to the right of each, every **use-case** — where each view and each use-case is its own Markdown note (frontmatter + body), and edges wire each view to its use-cases.

## Mode: create vs update
- If a use-case-map canvas (or its map folder) already exists — attached to this message, or found at the map folder below — run in **update** mode: re-discover, add missing views and use-cases, refresh changed ones, and **preserve existing notes and any manual canvas node positions**. Report a diff of what you added / changed / would remove.
- Otherwise run in **create** mode from scratch.
- If a canvas with a couple of example nodes is attached, treat it as the seed for the `View → Use-case` pattern and the target to overwrite.

## 1. Discover — ground everything in the real code
- Identify the product's user-facing **views** = distinct surfaces a user actually interacts with (e.g. main window, side panel, settings, modals, boards, libraries, wizards). Read the source and any docs; do not guess from memory.
- For each view, enumerate **every user-facing use-case** = one concrete thing a user can do there. Be exhaustive, including small affordances.
- For thoroughness and speed, dispatch **parallel read-only subagents** — one per view or subsystem — each returning a structured list. For each use-case capture: `name` (short imperative), `description` (one sentence), `actors` (which variants apply — e.g. providers / roles / platforms / plans), `trigger` (button, key, prefix char, menu, automatic), and 1–3 key `source-files`.
- **Curate to user-facing actions only.** Drop internal plumbing (caching, serialization, event emission, prompt/threading internals, projection). Those are implementation, not use-cases.

## 2. Confirm scope before writing
Present a short preview and get a yes:
- the view list with a use-case count per view,
- the target map folder,
- granularity (every use-case its own note vs. clustered),
- which surfaces deserve their own view with fanned-out use-cases, and which are better as a **single reference note** with no per-use-case children (settings-style surfaces usually don't need per-item notes).

## 3. Structure & naming conventions
- **Map folder** (default) `Conceptboards/use-case-map/`, sitting next to `use-case-map.canvas`. One subfolder per view. Confirm/override the folder in step 2.
- **View note** `<map>/<view-key>.md` — frontmatter: `type: view`, `view`, `surface`, `use-case-count`, `tags: [use-case-map, view]`. Body: one-line purpose + use-cases grouped by cluster as links.
- **Use-case note** `<map>/<view-key>/<slug>.md` — frontmatter: `type: use-case`, `view: "[[<view-key>]]"`, `cluster`, `actors` (list), `trigger`, `source-files` (list), `tags: [use-case-map, use-case]`. Body: description + trigger + source list.
- `slug` = lowercase the name, replace every run of non-alphanumeric with `-`, trim leading/trailing `-`. De-duplicate collisions with a numeric suffix.
- **Canvas** `<map>/use-case-map.canvas` — view nodes are `file` nodes in the left column, one **distinct color per view**; each view's use-cases are `file` nodes fanned to the right, stacked in vertical columns (wrap ~12 per column so bands stay readable); one edge per view→use-case (`fromSide: "right"`, `toSide: "left"`, colored to match the view). A surface with no per-use-case notes is a single lone node with no edges. Add a title node and a color legend node at the top.

## 4. Obsidian frontmatter rules — critical, these silently break otherwise
- Frontmatter wikilinks must be **unaliased**: write `view: "[[view-key]]"`, never `"[[view-key|Nice Name]]"`. An aliased link in a property makes Obsidian flag the property as invalid.
- No YAML scalar may **begin with a backtick** `` ` `` or `@` (reserved indicators) — the note will show "invalid frontmatter". **Quote** any value containing `#`, `/`, `:`, `|`, `@`, or a leading special char.
- Keep aliased/clickable links and backticked `code` in the note **body**, not in frontmatter. Prefer plain text or lists for property values.

## 5. Build & verify
- Prefer a **deterministic** build: assemble the data (views + use-cases with their fields) as one source, then generate all notes and the canvas JSON from it, so re-runs are consistent and idempotent. Use whatever scripting the project already has available, or write the files directly.
- Canvas integrity: every node `id` is unique; every `file` node's `file` is a vault-relative path with forward slashes pointing at a note that exists; every edge references existing node ids.
- **Verify before claiming done** (report the numbers): every canvas file-node resolves to a real note; YAML parses for every note; **zero aliased links in any frontmatter**; no node overlaps; edge count == use-case count.

## Update-mode care
Match existing use-cases by slug/name, keep their notes and their canvas coordinates, and only add / modify / mark-removed. Never wipe the user's manual node positions or hand edits without saying so first.

Start by telling me whether you detected an existing map (update) or none (create), then do step 1.
