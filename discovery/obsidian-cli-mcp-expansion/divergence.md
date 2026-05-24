# Divergence — Obsidian CLI MCP Expansion

## Open clarifications
- No `frame.md` exists in this discovery folder. Concepts below are anchored on the brief in the consult prompt; HMW is treated as **"How might we expose the ~120 Obsidian CLI commands as loopback MCP tools so the embedded Claude agent unlocks workflows the current search/read/append surface cannot?"** Confirm or restate.

## 1. Lightning demos (transferable mechanics)
- **Chrome DevTools Protocol remote-debug** → an agent can *see what the user sees* via `dev:dom` / `dev:screenshot` instead of guessing from markdown.
- **Reader-mode "send to Kindle"** → `web url=…` makes the vault a reading-room; agent can fetch + clip + tag in one motion.
- **Git bisect** → `sync:history` + `diff` lets an agent binary-search when a note "broke" (lost a section, wrong frontmatter).
- **Spotify Discover Weekly** → `random` + tags + backlinks = a weekly "forgotten notes" rotation.
- **Figma "try-on" variants** → `themes` / `snippets` toggle lets an agent A/B a visual change and screenshot both states.

## 2. Crazy 8s / Concept catalog (>=12, deduped)

| # | Concept (one sentence) | HMW slot |
|---|---|---|
| C1 | **Webviewer research loop** — agent runs `web url=<source>` then `dev:dom` to scrape readable text, summarises into a `## Sources` block via proposal-gated append; user gets a cited research note without leaving Obsidian. | core |
| C2 | **Link-graph cartographer** — agent walks `links:backlinks`, `orphans`, `deadends`, `unresolved` across the vault and produces a weekly "vault health" map with severity ranks. | core |
| C3 | **Daily-note coach** — every morning agent reads yesterday's daily note (`daily-notes:read`), extracts open tasks, prepends a triaged agenda to today's note (`daily-notes:prepend`). | core |
| C4 | **Sync-history forensics** — when a user says "this note used to have X," agent walks `sync:history` + `diff` to locate the revision and offers `sync:restore` as a proposal. | core |
| C5 | **Plugin marketplace shopper** — user describes a need in chat, agent surveys `plugin:*` registry, installs a candidate disabled, screenshots its settings pane via `dev:screenshot`, and asks before enabling. | core |
| C6 | **Theme/snippet try-on** — agent cycles through `themes` + `snippets`, captures `dev:screenshot` of the same note in each, returns a contact-sheet so the user picks visually. | core |
| C7 | **Publish curator** — agent diffs `publish:list` vs vault tags, flags drift, proposes `publish:add`/`remove` batches with rationale; keeps the public site coherent. | core |
| C8 | **Task triage swarm** — agent reads `tasks` across the vault, clusters by project via tags, proposes `tasks:done`/reschedule with a one-line reason each. | core |
| C9 | **Workspace orchestrator** — agent infers user intent ("I'm writing the spec"), calls `workspace:load spec-mode` + `tabs` setup + recents pinning so the layout matches the verb. | core |
| C10 | **Screenshot-to-doc loop** — on `dev:errors` or visible UI bug, agent captures `dev:screenshot` + `dev:dom`, files a structured bug note with reproduction steps under `bugs/`. | core |
| C11 | **Base-query librarian** — agent translates natural-language asks ("notes I touched last week that link to ADRs") into Bases queries, runs them, and saves the query as a reusable base file. | core |
| C12 | **Unique-note minter** — agent produces Zettel IDs via `unique-notes`, scaffolds with `templates:insert`, sets frontmatter via `properties:set`, all in one MCP call chain. | core |
| C13 | **Outline-aware refactor** — agent reads `outline` of a long note, proposes a split into linked children, executes via file CRUD + backlink rewrites once approved. | core |
| C14 | **Grep-driven audit** — agent runs `search:context` for forbidden patterns (TODOs, broken callouts, secret-like strings) and produces a remediation checklist. | core |

## 3. SCAMPER variants (on C1, C2, C5)
- **Substitute (C1)** — replace `web` with a local PDF viewer URL; same DOM scrape mechanic, offline.
- **Combine (C1+C10)** — webviewer + screenshot = "visual citation" — store the rendered page image alongside the quoted text.
- **Adapt (C2)** — apply the cartographer to a *single folder* as a "feature-area health" report instead of vault-wide.
- **Modify (C5)** — instead of installing, agent only *reads* `plugin:restrict` policies and recommends what to disable for focus mode.
- **Put-to-another-use (C6)** — theme try-on becomes accessibility audit: cycle high-contrast themes, screenshot, flag illegible callouts.
- **Eliminate (C4)** — drop `diff`; just surface raw `sync:history` timestamps as a timeline UI element.
- **Reverse (C7)** — instead of agent curating publish, *publish state drives vault tagging*: anything `publish:status=live` gets a `#published` tag stamped via `properties:set`.

## 4. Wild cards (kept deliberately strange)
- **W1 — Vault seance** — `random` + `links:orphans` once a week opens a forgotten note in a side tab with the prompt "should this still exist?"; agent proposes archive/merge/keep.
- **W2 — Webviewer adversary** — agent opens the user's own published site via `web`, reads it back through `dev:dom` as a *stranger* would, and writes a "first-impression critique" note. Closes the loop between author and reader.
- **W3 — CDP-driven UX test** — agent uses `dev:cdp` to simulate clicks through a user's own template, catches dead buttons / missing handlers, files findings — Obsidian testing Obsidian.

## 5. Breadth check (for game-designer annotation pass)
- **Users covered:** first-time (C5, C6), power (C2, C11, C13), maintainer (C4, C7, C10, W3), reader-self (W2).
- **Time horizons:** seconds (C9, C12), daily (C3), weekly (C2, W1), incident-driven (C4, C10).
- **Input modalities:** chat (C1, C8), scheduled (C2, C3, W1), event-triggered (C10), passive sensing via DOM (C1, W2, W3).
- **Social shape:** mostly solo; C7 and W2 touch public-audience surface.
- **Aesthetics to spot-check:** Discovery (W1), Challenge (W3), Narrative (W2), Expression (C6), Submission (C3, C9).

_MDA / lens / motivation columns intentionally left blank for the game-designer pass._
