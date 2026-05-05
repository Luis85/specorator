---
term: "agentic-workflow"
aliases: ["agentic workflow", "workflow methodology", "upstream methodology"]
category: ecosystem
status: stable
version: "v1 and v2.0"
related:
  - adlc.md
  - workflow-stage.md
  - artifact.md
  - scaffold.md
  - specorator.md
issues:
  - "#97"
  - "#76"
last_updated: 2026-05-05
---

# agentic-workflow

The upstream methodology repository (`Luis85/agentic-workflow`) that defines the twelve ADLC stages, stage artifacts, templates, traceability conventions, and quality gates that Specorator surfaces. Specorator consumes released versions of the `agentic-workflow` template package as the authoritative source of template content.

## What it defines

- The twelve stage slugs and their sequencing
- The `specs/{slug}/` vault structure (ADR-005)
- The `workflow-state.md` schema and required frontmatter fields
- Stage artifact filenames and template content
- Quality gate conventions and gate check definitions
- AGENTS.md instructions for coding agents working within the methodology

## Relationship to Specorator

Specorator is the Obsidian plugin that *surfaces* `agentic-workflow`. The methodology is the content; the plugin is the interface. Specorator's role is to make the methodology invisible to the user while ensuring its benefits (structure, traceability, quality gates) are delivered automatically.

## Version tracking

The plugin tracks the installed `agentic-workflow` template version in plugin settings and will notify the user when an update is available. Issue #97 tracks adoption of the upstream v1 release.

## Ambiguity note

"Workflow" can refer to the `agentic-workflow` methodology, a feature's per-feature workflow path, or a GitHub Actions CI workflow. Use "`agentic-workflow`" for the methodology repository, "the ADLC" or "the workflow methodology" for the methodology itself, and "CI workflow" for GitHub Actions.
