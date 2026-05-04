# Ecosystem Product Vision Refinement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate the ecosystem-first product vision update through all dependent docs so every document in the repo consistently reflects the 4-component architecture (`specorator-plugin`, `specorator-runtime`, `agentic-workflow`, `agentonomous`).

**Architecture:** `docs/product-vision.md` was restructured on branch `feature/product-vision-refinement` (commits `ace3de3`, `17105bb`, `d9528b5`). That doc is the source of truth. All other docs must be brought into alignment with it — no document should describe `agentonomous` as the orchestration engine, and every doc covering v2.0 or ecosystem architecture must include `specorator-runtime`.

**Tech Stack:** Markdown only. No code changes. Branch: `feature/product-vision-refinement`. All edits happen in `.worktrees/feature/product-vision-refinement/`.

---

## Chunk 1: PR for product-vision.md

### Task 1: Open PR for the product vision update

**Files:**
- Already committed: `docs/product-vision.md` (3 commits on branch `feature/product-vision-refinement`)

- [ ] **Step 1: Verify the worktree is clean**

```bash
cd .worktrees/feature/product-vision-refinement
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Push the branch**

```bash
git push origin feature/product-vision-refinement
```

Expected: branch pushed, no errors.

- [ ] **Step 3: Open PR targeting develop**

```bash
gh pr create \
  --title "docs(vision): ecosystem-first restructure — add specorator-runtime, fix agentonomous role" \
  --body "$(cat <<'EOF'
## Summary

- Adds `specorator-runtime` as a first-class ecosystem component (was entirely absent)
- Fixes `agentonomous` role description (was "orchestration engine"; it is the agent capabilities provider)
- Leads the doc with a 4-component ecosystem architecture diagram
- Reframes the plugin explicitly as the UI layer for the whole ecosystem
- Updates v2.0 section to reference `specorator-runtime` as the execution layer
- Adds "Runtime transparency" principle

## Related

- Part of #148 (dependent docs follow-up tracked in Chunks 2–5 of this branch)
- Spec reviewed and approved (2 reviewer passes, 0 blockers)

## Test plan

- [ ] Read `docs/product-vision.md` in the PR diff — every section should consistently describe plugin as UI layer
- [ ] Verify no section describes `agentonomous` as the orchestration engine
- [ ] Verify `specorator-runtime` appears in ecosystem table with correct role
- [ ] Verify v1/v2.0 split is consistent throughout
EOF
)"
```

Expected: PR URL printed to stdout (e.g. `https://github.com/Luis85/specorator/pull/NNN`)

---

## Chunk 2: prd.md alignment

### Task 2: Add specorator-runtime to PRD relationship table and fix agentonomous description

**Files:**
- Modify: `docs/prd.md` — section "Relationship to Upstream Projects" (near line 98–102 in original)

Context: The PRD has a relationship table at the bottom of the v1 section. It needs a `specorator-runtime` row and an updated `agentonomous` description.

- [ ] **Step 1: Locate the relationship table in prd.md**

Open `docs/prd.md`. Find the section titled `## Relationship to Upstream Projects` (it exists in the original product-vision.md, but the PRD does not have a direct equivalent — the PRD has dependencies tables in §10.1 and §12). Check both.

In `docs/prd.md`:
- Search for "agentonomous" to find every occurrence of the incorrect description.
- The v1 PRD §10.1 Dependencies table references `agentic-workflow` releases. It does not currently mention `agentonomous` or `specorator-runtime`.
- The v2.0 PRD §12 Dependencies table currently lists `agentonomous` as "Coworker definitions, invocation contracts, run lifecycle, and output structures are defined in `agentonomous`."
- The v2.0 PRD §5.5 Integration Bridge requirements reference `agentonomous` directly.
- Open questions V2-OQ-001 and V2-OQ-002 ask about the `agentonomous` runtime boundary — now answered by `specorator-runtime`.

- [ ] **Step 2: Update v2.0 §12 Dependencies — add specorator-runtime row**

In the v2.0 PRD `## 12. Dependencies on agentonomous and agentic-workflow` table, add a new first row before the existing agentonomous row:

```markdown
| `specorator-runtime` execution engine | Hard | The npm library that orchestrates workflow execution, manages session lifecycle, invokes agents, and emits the event stream the plugin subscribes to. Must be available and stable before v2.0 integration implementation begins. |
```

Also rename the section heading from `## 12. Dependencies on agentonomous and agentic-workflow` to `## 12. Dependencies` to reflect the now-broader scope (keep the number).

- [ ] **Step 3: Update v2.0 §12 — fix agentonomous row**

Change the existing `agentonomous coworker/agent model` row description from:
> "Coworker definitions, invocation contracts, run lifecycle, and output structures are defined in `agentonomous`."

To:
> "Agent implementations and capabilities are defined in `agentonomous`. The runtime invokes these agents; the plugin does not call `agentonomous` directly."

- [ ] **Step 4: Update v2.0 §5.5 Integration Bridge — clarify specorator-runtime as the boundary**

In requirement `V2-FR-040`, update the text to reflect that the plugin integrates with `specorator-runtime` (not `agentonomous` directly):

Change:
> "The plugin SHALL integrate with `agentonomous` through a typed service interface; the Vue UI SHALL NOT import `agentonomous` directly."

To:
> "The plugin SHALL integrate with `specorator-runtime` through a typed service interface; the Vue UI SHALL NOT import `specorator-runtime` or `agentonomous` directly."

Update `V2-FR-042`:
Change:
> "The bridge interface SHALL represent: coworker capabilities, context bundles, run invocation, run state, proposed outputs, review decisions, and diagnostics."

To:
> "The bridge interface SHALL represent: runtime session lifecycle, task graph state, agent invocation events, proposed outputs, review decisions, and diagnostics."

- [ ] **Step 5: Retire V2-OQ-001 and V2-OQ-002**

In `## 13. Open Questions and Architectural Decisions Needed`, mark V2-OQ-001 and V2-OQ-002 as resolved:

Change V2-OQ-001:
> "What is the correct runtime boundary for `agentonomous` inside an Obsidian plugin..."

To:
> "~~What is the correct runtime boundary for `agentonomous` inside an Obsidian plugin...~~ **Resolved:** `specorator-runtime` is the execution boundary. The plugin depends on `specorator-runtime` as an npm library; `agentonomous` agents are invoked by the runtime, not the plugin directly."

Change V2-OQ-002:
> "Can `agentonomous` run safely within the Obsidian plugin renderer process..."

To:
> "~~Can `agentonomous` run safely within the Obsidian plugin renderer process...~~ **Resolved:** `agentonomous` runs within `specorator-runtime`, which is responsible for its isolation boundary. See `specorator-runtime` PRD issue #1 OQ for the module format decision."

- [ ] **Step 6: Verify no remaining incorrect agentonomous descriptions**

```bash
grep -n "agentonomous.*orchestration\|orchestration.*agentonomous" docs/prd.md
```

Expected: zero matches. (`routing` and `handoff` appear legitimately elsewhere in the PRD — e.g. `V2-AO-006` references agent-to-agent handoffs — so do not treat those as errors.)

- [ ] **Step 7: Commit**

```bash
git add docs/prd.md
git commit -m "docs(prd): add specorator-runtime dependency, fix agentonomous role, retire V2-OQ-001/OQ-002"
```

---

## Chunk 3: roadmap-v1.md alignment

### Task 3: Update roadmap Phase 4 agent placeholder description

**Files:**
- Modify: `docs/roadmap-v1.md` — Phase 4 table row "Agent interaction placeholder"

- [ ] **Step 1: Update Phase 4 agent placeholder row**

In `docs/roadmap-v1.md`, find the Phase 4 table. Change the "Agent interaction placeholder" row:

Change:
```markdown
| Agent interaction placeholder | Extension point and documented handoff for v2.0 coworkers | #16, #23, #27 |
```

To:
```markdown
| Agent interaction placeholder | Extension point and documented handoff for v2.0 `specorator-runtime` integration; defines the plugin-side event subscription surface | #16, #23, #27 |
```

- [ ] **Step 2: Replace the existing v2.0 direction note in Phase 4**

Find and replace this exact text:

```markdown
**v2.0 direction:** Issue #23 defines the companion-app and `agentonomous` integration vision. No v2.0 orchestration features are in scope for v1 alpha, but the shell (#11) and bridge API (#16) must leave clean, documented extension points for them.
```

With:

```markdown
**v2.0 direction:** v2.0 runtime integration work is tracked in the [`specorator-runtime`](https://github.com/Luis85/specorator-runtime) repository. The plugin's v2.0 scope is confined to the UI surface — session trigger, event subscription, and output review. Execution, scheduling, and agent invocation are owned by the runtime.
```

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap-v1.md
git commit -m "docs(roadmap): update Phase 4 agent placeholder to reference specorator-runtime"
```

---

## Chunk 4: glossary.md alignment

### Task 4: Add specorator-runtime entry and fix agentonomous entry

**Files:**
- Modify: `docs/glossary.md` — Ecosystem Terms section

- [ ] **Step 1: Fix the "Specorator" term entry**

The current "Specorator" entry says v2.0 is "powered by `agentonomous`." Update to:

Change:
> "In v2.0, Specorator becomes a companion app offering a team of agentic coworkers powered by `agentonomous`."

To:
> "In v2.0, Specorator connects to `specorator-runtime` as a live agentic cockpit — triggering workflow sessions, subscribing to runtime events, and presenting agent-proposed outputs for user review."

- [ ] **Step 2: Fix the "companion app" term entry**

Change:
> "A Specorator instance with active `agentonomous` integration..."

To:
> "A Specorator instance connected to `specorator-runtime`, enabling live agentic workflow execution. The companion app presents session state, agent activity, and proposed outputs while the runtime and `agentonomous` agents operate behind the UI surface."

- [ ] **Step 3: Fix the "agentonomous" ecosystem entry**

Change:
> "The upstream agent orchestration library (`Luis85/agentonomous`) that will power v2.0 agentic coworker interactions."

To:
> "The upstream autonomous-agent library (`Luis85/agentonomous`) that provides the agent implementations invoked by `specorator-runtime`. Agents are selected per workflow task, provided context, and return structured output. The plugin does not call `agentonomous` directly."

- [ ] **Step 4: Fix the "agent run" term entry**

Change:
> "A single execution of an agentic coworker flow in `agentonomous`, triggered by a user action in the Specorator UI."

To:
> "A single workflow session execution managed by `specorator-runtime`, triggered by a user action in the Specorator UI. The runtime interprets the workflow definition, invokes `agentonomous` agents at each task, and emits a typed event stream the plugin subscribes to."

- [ ] **Step 5: Add "specorator-runtime" ecosystem entry**

After the `agentonomous` entry (not after `agentic-workflow` — keeps ecosystem component entries together) in the Ecosystem Terms section, add:

```markdown
### specorator-runtime

The execution engine library (`Luis85/specorator-runtime`) that sits between the plugin and the rest of the ecosystem. Consumed by the Specorator plugin as an npm package. Responsible for: session lifecycle, workflow interpretation (consuming `agentic-workflow` definitions), agent invocation (calling `agentonomous`), event bus, state store, and runtime API. The plugin is a subscriber and trigger surface; the runtime owns all execution logic.
```

- [ ] **Step 6: Add "runtime session" term entry**

After the "specorator-runtime" entry, add:

```markdown
### runtime session

A single execution instance of a workflow managed by `specorator-runtime`. A session contains: a workflow reference, execution state, task graph, agent interactions, produced artifacts, and event log. The plugin surfaces session state in the cockpit and allows the user to start, monitor, cancel, and inspect sessions. **v2.0 concept; not available in v1.**
```

- [ ] **Step 7: Update the Scope Boundaries table**

In the Scope Boundaries section, update the `agentonomous` integration row and add a `specorator-runtime` row:

Change:
```markdown
| `agentonomous` integration | Extension point only | Full integration |
```

To:
```markdown
| `specorator-runtime` integration | Not implemented | Full integration as npm library |
| `agentonomous` integration | Not applicable (accessed via runtime only) | Invoked by runtime per task |
```

- [ ] **Step 8: Verify no remaining "orchestration library" description for agentonomous**

```bash
grep -n "orchestration" docs/glossary.md
```

Expected: zero matches.

- [ ] **Step 9: Commit**

```bash
git add docs/glossary.md
git commit -m "docs(glossary): add specorator-runtime entry, fix agentonomous role, add runtime session term"
```

---

## Chunk 5: DESIGN_BRIEF.md check + final verification

### Task 5: Check DESIGN_BRIEF and USE_CASES, then close issue #148

**Files:**
- Check: `docs/design/DESIGN_BRIEF.md`
- Check: `docs/design/USE_CASES.md`

- [ ] **Step 1: Check DESIGN_BRIEF for incorrect agentonomous description**

```bash
grep -n "agentonomous\|specorator-runtime\|orchestration" docs/design/DESIGN_BRIEF.md
```

The DESIGN_BRIEF lists "AI agent inside Specorator" as out-of-scope for v1 (line 167). It does not describe `agentonomous` as an orchestration engine. If grep returns no incorrect descriptions, no edit is needed. If any "orchestration" usage is found describing agentonomous, apply the same fix as in the glossary.

- [ ] **Step 2: Check USE_CASES for incorrect agentonomous description**

```bash
grep -n "agentonomous\|specorator-runtime\|orchestration" docs/design/USE_CASES.md
```

If any use case describes the plugin calling `agentonomous` directly (bypassing the runtime), note it. For v1 use cases, no fix is needed since agentonomous is not in scope. For v2.0 use cases that say "Specorator calls agentonomous," update to "Specorator triggers a runtime session; the runtime invokes agentonomous agents."

- [ ] **Step 3: Commit any changes from the above checks**

Only commit if edits were made:

```bash
git add docs/design/DESIGN_BRIEF.md docs/design/USE_CASES.md
git commit -m "docs(design): align agentonomous role with ecosystem architecture"
```

Skip this step if no edits were needed.

- [ ] **Step 4: Run final grep across all docs**

Verify no remaining incorrect descriptions across all updated docs:

```bash
grep -rn "orchestration engine\|orchestration library" docs/
```

Expected: zero matches.

- [ ] **Step 5: Close issue #148**

```bash
gh issue close 148 --repo Luis85/specorator --comment "All dependent docs updated on branch feature/product-vision-refinement. Changes: prd.md (specorator-runtime added, V2-OQ-001/002 retired), roadmap-v1.md (Phase 4 agent placeholder updated), glossary.md (specorator-runtime entry added, agentonomous role fixed). DESIGN_BRIEF and USE_CASES verified clean."
```

- [ ] **Step 6: Verify all chunks committed and PR up to date**

Open the PR created in Task 1 and confirm all commits from Chunks 2–5 appear in the PR diff.

---

## Chunk 6: Product page — update brief, build page, publish

### Task 6: Update product-page-brief.md and build the GitHub Pages product page

**Files:**
- Modify: `docs/product-page-brief.md` — Section 4 ecosystem table + Section 6 v2.0 description
- Create: `docs/index.html` — static GitHub Pages product page
- Create: PR `develop → demo` to publish

**Branch:** Run all steps on the existing `feature/product-vision-refinement` branch (same branch as Chunks 1–5). Steps 1–6 commit to that branch; Step 7 opens a `develop → demo` PR *after* the feature branch has been merged to `develop` via the PR from Task 1.

**Note:** The actual HTML product page does not yet exist (issue #22, Phase 4). This task implements it. Use the `frontend-design` skill when building `docs/index.html`.

- [ ] **Step 1: Fix product-page-brief.md Section 4 ecosystem table**

In `docs/product-page-brief.md`, find Section 4 ("How does it relate to `agentic-workflow`?"). The current ecosystem table reads:

```markdown
| `agentic-workflow` | The methodology — workflow stages, artifacts, templates, quality gates. Specorator consumes released versions. |
| Specorator | The Obsidian plugin — installs, navigates, and surfaces the methodology from inside the vault. |
| `agentonomous` | The agent orchestration engine — powers v2.0 agentic coworkers. Not used in v1. |
```

Replace with the 4-component table:

```markdown
| `agentic-workflow` | The methodology — workflow stages, artifacts, templates, quality gates. Specorator consumes released versions. |
| `specorator-runtime` | The execution engine — interprets workflow definitions, invokes agents, manages sessions, emits events. npm library consumed by the plugin. v2.0 only. |
| `agentonomous` | The agent capabilities library — provides the agent implementations the runtime invokes. v2.0 only. |
| Specorator (this plugin) | The UI layer — installs the methodology, navigates workflow state, and in v2.0 becomes the cockpit for live agentic sessions. |
```

- [ ] **Step 2: Fix product-page-brief.md Section 6 v2.0 description**

In Section 6, update the body copy:

Change:
> "In v2.0, Specorator becomes a companion app powered by `agentonomous`. Users get a team of purpose-built agentic coworkers..."

To:
> "In v2.0, Specorator connects to `specorator-runtime` to become a live agentic cockpit. The runtime executes workflow sessions, invoking agents from `agentonomous` at each task. Users see real-time execution state in the panel and review every agent-proposed output before it is written to the vault."

Also update the Secondary Message in Section 1:

Change:
> "In v2.0, Specorator becomes a companion app powered by `agentonomous`, giving you a team of agentic coworkers..."

To:
> "In v2.0, Specorator connects to `specorator-runtime` as a live agentic cockpit — executing workflow sessions, invoking agents from `agentonomous`, and surfacing every proposed output for your review before it touches the vault."

- [ ] **Step 3: Commit product-page-brief.md changes**

```bash
git add docs/product-page-brief.md
git commit -m "docs(product-page-brief): update ecosystem table and v2.0 description to reflect 4-component architecture"
```

- [ ] **Step 4: Build the GitHub Pages product page**

Create `docs/index.html` — a static HTML product page with no build step, readable via `file://` in a browser. Follow the 9-section structure in `docs/product-page-brief.md` exactly.

**Content rules (from the brief):**
- Hero: plugin name + tagline, no agent capabilities claimed
- Problem: AI coding generates code fast but not good software — structure makes the difference
- How it works (v1 only): template installation, workflow navigation, artifact creation
- Ecosystem: 4-component table from the updated Section 4
- Status: what's built vs. in active development (be honest — plugin shell built, Phase 4 features in progress)
- v2.0 direction: cockpit + runtime + agentonomous, link to issue #23
- Get started: `npm install`, `npm run dev`, `npm run build` + sideloading note
- Contribute: links to local-dev docs, open issues, roadmap
- Footer: repo links for all 4 ecosystem components

**Technical constraints:**
- Single static HTML file, no external JS frameworks or build step
- CSS inline or in `<style>` block — no external stylesheets other than system fonts
- Must render correctly via `file://` (no relative path issues)
- Obsidian-appropriate aesthetic: clean, dark-mode compatible, minimal

**Step 4a — Invoke `frontend-design` skill before writing any HTML.** This is not optional.

**Step 4b — Write `docs/index.html`** following the skill's output and the content rules above.

- [ ] **Step 5: Verify page renders correctly**

Open `docs/index.html` directly in a browser (`file://`) and confirm:
- All 9 sections render
- All internal `#anchor` links resolve (every `href="#id"` must have a matching `id=` on a target element)
- 4-component ecosystem table appears correctly
- v1/v2.0 distinction is clear throughout

For a more realistic check, also run: `npx serve docs/` and open `http://localhost:3000`

- [ ] **Step 6: Commit the product page**

```bash
git add docs/index.html
git commit -m "feat(product-page): add GitHub Pages product page (issue #22)"
```

- [ ] **Step 7: Open PR develop → demo to publish**

Before opening this PR:
1. Confirm the feature branch PR (Task 1) has been merged into `develop`.
2. Verify GitHub Pages is configured to serve from the `docs/` folder on the `demo` branch (GitHub repo Settings → Pages → Source). If not configured, set it before merging.

**On Linux/macOS or Git Bash (recommended):**

```bash
gh pr create \
  --base demo \
  --head develop \
  --title "chore(demo): publish ecosystem vision update + product page" \
  --body "## What this publishes

- Updated product vision (ecosystem-first restructure)
- Updated product-page-brief, glossary, PRD, roadmap
- New GitHub Pages product page (docs/index.html — issue #22)

## Verify after merge

- [ ] \`https://luis85.github.io/specorator/\` resolves and renders the product page
- [ ] Ecosystem table shows all 4 components correctly
- [ ] v1/v2.0 distinction is clear throughout"
```

**On Windows PowerShell:**

```powershell
gh pr create --base demo --head develop `
  --title "chore(demo): publish ecosystem vision update + product page" `
  --body @'
## What this publishes

- Updated product vision (ecosystem-first restructure)
- Updated product-page-brief, glossary, PRD, roadmap
- New GitHub Pages product page (docs/index.html — issue #22)

## Verify after merge

- [ ] `https://luis85.github.io/specorator/` resolves and renders the product page
- [ ] Ecosystem table shows all 4 components correctly
- [ ] v1/v2.0 distinction is clear throughout
'@
```
