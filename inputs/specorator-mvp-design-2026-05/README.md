# Specorator MVP design — May 2026

Source: full UI design package handed in by the product owner on 2026-05-14 for the **Specorator core plugin MVP** — the three-panel workspace (Left Sidebar · Main View · Right Sidebar) that turns the Obsidian plugin into a GitHub-integrated, AI-agent-driven issue/task/PR workspace.

## Files

- `index.html` — package landing page; links the three primary artifacts (prototype, design brief, user stories).
- `Specorator_Screen_v2.html` — **interactive prototype**. Full-fidelity, clickable, self-contained reference implementation (vanilla HTML/CSS/JS — all data, state, render logic in one file). The handoff explicitly designates this as the authoritative visual and interaction spec.
- `Specorator_Design_Brief.html` — component specs, visual language, interaction patterns, and design rationale for all three sections (Left Sidebar, Main View, Right Sidebar). Includes per-component property rows, interaction chips, visual specs, state lists, and flow diagrams.
- `Specorator_User_Stories.html` — 52 user stories with acceptance criteria, priority levels (18 high / 24 medium / 10 low), and persona mapping (Developer, PM/Lead, Agent Supervisor). Grouped by panel: Left Sidebar (12), Main View (24), Right Sidebar (16).
- `Specorator_Handoff.html` — developer handoff doc: TypeScript data models (`Issue`, `Task`, `Agent`, `Proposal`, `PullRequest`, `ActivityEvent`), `AppState` shape, state/routing flows, component breakdown by panel, key interactions (proposal review, PR merge gate, task assignment), and Obsidian integration notes (recommended plugin structure, prototype-vs-production data sources, known gaps).

## Status

Filed under `inputs/` per `docs/inputs-ingestion.md` — not auto-extracted. Conductors consult during scope phase. The companion spec entry being created from this design package is `specs/specorator-mvp-workspace/` (or successor — see open issue for the kickoff epic).

## Scope summary

Three-panel fixed layout:

```
Left Sidebar (240px) │ Main View (flex)              │ Right Sidebar (284px)
Actions · Issues · PRs │ Issue / PR / Task / Activity │ Tasks / Agents / PR
```

Four main-view states (`issue`, `pr`, `task`, `activity`) and four right-panel states (`tasks`, `agents`, `agent`, `pr`). State held in a single flat `AppState` object; `renderMain()` and `renderRight()` re-render on state mutation.

## Relationship to existing work

- **`specs/agent-sidepanel-mvp/`** — earlier sidepanel work (chat sidebar) is a *narrower* feature. The MVP design here is the **superset**: it elevates the sidepanel into a full three-panel workspace and adds the issue/PR/task surfaces around the chat.
- **`specs/plugin-architecture/`** and ADR-001 (DDD layered) — the design must be implemented inside the existing layered architecture. The Handoff's recommended structure (`SpecoratorView.tsx`, state store, components, data ports) maps cleanly onto our `src/{domain,application,infrastructure,ui,plugin}/` layout.
- **ADR-008 narrow ports** — production data sources called out in the Handoff (GitHub REST/GraphQL, agent WebSocket/SSE, vault JSON for proposals) imply at least two new ports beyond the existing six: a GitHub port and an agent-runtime port. These are spec-first decisions, not implementation defaults.

## Known gaps & open questions (from the Handoff doc)

1. **Proposal persistence** — store as `.specorator/proposals.json` in the vault.
2. **Agent WebSocket/SSE** — live agent stream is mocked in the prototype.
3. **Issue filtering** — "My Issues" / "Created Issues" wiring to GitHub API params.
4. **Activity Feed live updates** — append-only state updates, not full re-render.
5. **CSS tokens → Obsidian theme variables** — map `--bg`, `--t0`, etc. to Obsidian's `--color-base-*` and `--font-text-*`.

## Read order for any subagent starting a stage on this package

1. `index.html` — orient yourself on the three artifacts.
2. `Specorator_Handoff.html` — the developer-facing overview (data models, state, components, Obsidian notes).
3. `Specorator_Design_Brief.html` — visual + interaction specs per component.
4. `Specorator_User_Stories.html` — user-value and acceptance criteria.
5. `Specorator_Screen_v2.html` — open in a browser; it **is** the interactive spec.
