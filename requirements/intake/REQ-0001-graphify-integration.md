---
id: REQ-0001
status: proposed
summary: "Integrate graphify knowledge-graph tooling into the Specorator plugin repository"
owner: "Luis85"
created: 2026-05-10
last_updated: 2026-05-10
source_issue: "#207"
related_design: ""
tags: [requirements, intake, tooling, architecture]
priority: medium
risk: low
verification:
  - "graphify generates a queryable knowledge graph from the project codebase"
  - "AI coding tools (Claude Code, Cursor, etc.) can query the graph via the graphify skill"
  - "CLAUDE.md documents the graphify trigger and graph location"
  - ".graphifyignore present at repo root and excludes build artifacts, generated dirs, and graphify-out/ itself"
  - "graphify-out/ is committed to the repo and not listed in .gitignore"
statement: "The project SHALL adopt graphify (https://github.com/safishamsi/graphify) as its knowledge-graph layer, producing a queryable graph of the codebase that AI coding assistants can interrogate for architecture, symbol, and relationship queries. The generated graph SHALL be committed to the repository so all contributors benefit without a local Python environment. Scope SHALL be controlled via a .graphifyignore at the repo root."
rationale: "The Specorator plugin codebase spans multiple DDD layers, a growing MCP tool surface, and strict port/use-case boundaries that are hard for AI tools to reason about from raw file reads alone. A persistent knowledge graph lets agents issue targeted graph queries rather than diffuse grep/read sweeps, improving accuracy and reducing context overhead during agentic development sessions. Committing graphify-out/ gives every contributor instant access to the graph without setup; .graphifyignore keeps extraction focused on source code and docs, excluding build artifacts and generated output."
acceptance_criteria:
  - "A .graphifyignore file exists at the repository root and excludes: node_modules/, all build output dirs, docs/api/, coverage/, and graphify-out/ itself."
  - "graphify-out/ is committed to the repository (not in .gitignore)."
  - "Running the graphify skill against the repository root (respecting .graphifyignore) produces graph.json, GRAPH_REPORT.md, and graph.html under graphify-out/."
  - "CLAUDE.md references the graphify skill trigger, the output location, and the update cadence."
  - "At least one sample query (e.g. 'list all VaultPort implementations') returns correct, current results from the committed graph."
  - "CLAUDE.md or a developer note documents when to regenerate the graph (e.g. after significant structural changes)."
traceability:
  upstream:
    - "CLAUDE.md — graphify skill already available at ~/.claude/skills/graphify/SKILL.md"
    - "https://github.com/safishamsi/graphify — upstream skill definition"
  downstream:
    - "TBD — implementation task after acceptance"
---

## Notes

- graphify is a Python-based AI coding assistant skill (45k+ stars) that turns any folder of code, docs, SQL schemas, or scripts into a queryable knowledge graph.
- The skill is already installed in this Claude Code session (`~/.claude/skills/graphify/SKILL.md`). This requirement tracks the project-level adoption: configuration, output path commitment, CLAUDE.md documentation, and CI guidance.
- Risk is low: graphify is read-only over source files and produces a standalone output directory. No build pipeline changes required.
- **Resolved:** `graphify-out/` SHALL be committed to the repository so all contributors and AI tools get the graph without needing a local Python env. `.graphifyignore` was created at repo root to control extraction scope.
