---
title: 'Specorator repository overview'
doc_type: home
status: draft
owner: product
last_updated: 2026-05-01
references:
  - docs/product-vision.md
  - docs/prd.md
  - docs/roadmap-v1.md
---

# Specorator

Specorator is an Obsidian plugin and companion app for spec-driven, agentic software development. It guides users through a structured workflow — from idea to release — keeping all artifacts as editable Markdown inside the vault.

**Current status:** Plugin shell complete. v1 alpha feature delivery in progress.

## What it does

**v1 alpha** establishes the plugin foundation:

- Installs and manages the [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) template inside an Obsidian vault.
- Provides a workflow cockpit: active stage, required artifacts, next actions, and quality checks.
- Keeps all generated content as plain Markdown — readable and usable without the plugin.

**v2.0** adds a companion-app experience:

- Integrates [`agentonomous`](https://github.com/Luis85/agentonomous) to provide a team of agentic coworkers that assist with drafting, review, and workflow progression.
- Users stay focused on their vault; they decide what context agents can see, what they propose, and what becomes a durable artifact.

## Documentation

| Document                                                                   | Purpose                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| [docs/product-vision.md](docs/product-vision.md)                           | Product north star, principles, and v1/v2.0 direction |
| [docs/prd.md](docs/prd.md)                                                 | v1 and v2.0 product requirements documents            |
| [docs/roadmap-v1.md](docs/roadmap-v1.md)                                   | Phased delivery plan for v1 alpha                     |
| [docs/process/requirements-intake.md](docs/process/requirements-intake.md) | Intake-first requirements and design workflow         |

## Project tracking

| Issue                                                                            | Purpose                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| [#47 — Roadmap progress tracker](https://github.com/Luis85/specorator/issues/47) | Phase-by-phase checklist                 |
| [#1 — v1 alpha planning](https://github.com/Luis85/specorator/issues/1)          | v1 feature scope and acceptance criteria |
| [#23 — v2.0 planning](https://github.com/Luis85/specorator/issues/23)            | Companion-app and agentonomous direction |
| [#2 — Repo setup objective](https://github.com/Luis85/specorator/issues/2)       | Repository and GitHub foundation work    |
| [#11 — Plugin shell objective](https://github.com/Luis85/specorator/issues/11)   | Plugin architecture and toolchain        |
| [#24 — Product setup objective](https://github.com/Luis85/specorator/issues/24)  | PRDs, use cases, and product artifacts   |

## Development

See [docs/local-development.md](docs/local-development.md) for the full setup guide: prerequisites, commands, sideloading into an Obsidian test vault, and pre-PR verification steps.

**Stack:** Obsidian community plugin · Vue 3 · Vue Router · Pinia 2 · TypeScript 5.8 · Vite · Vitest · ESLint · TypeDoc

## Contributing

Issues and pull requests are welcome. See the [roadmap](docs/roadmap-v1.md) for current priorities.

**Intake-first workflow:** new requirements and design decisions go through a structured intake process before implementation begins.

- Open a **Requirement intake** or **Design intake** issue using the provided templates.
- Add a requirement draft under `requirements/intake/` using `REQ-0000-template.md`.
- Follow `docs/process/requirements-intake.md` for triage and promotion steps.

## Related repositories

- [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) — workflow methodology, templates, and quality gates. [Upstream planning issue](https://github.com/Luis85/agentic-workflow/issues/96).
- [`agentonomous`](https://github.com/Luis85/agentonomous) — agent orchestration engine used in v2.0.
