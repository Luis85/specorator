---
term: "Agentic Development Lifecycle"
aliases: ["ADLC"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - pipeline.md
  - workflow-stage.md
  - gate.md
  - h-acd.md
  - fleet-dashboard.md
issues:
  - "#1"
  - "#23"
  - "#164"
last_updated: 2026-05-05
---

# Agentic Development Lifecycle (ADLC)

The complete twelve-stage lifecycle through which a feature travels from initial idea to retrospective. The ADLC is the backbone of the `agentic-workflow` methodology that Specorator surfaces. Each stage has a defined agent role, expected artifacts, and a human governance gate before the next stage begins.

## The twelve stages

| # | Stage slug | Plain label | Agent role | User's governance decision |
|---|---|---|---|---|
| 1 | `idea` | Exploring the idea | Articulates and stress-tests the concept | "Is this worth pursuing?" |
| 2 | `research` | Understanding the space | Structures research, surfaces patterns | "What does this mean for us?" |
| 3 | `requirements` | Defining what to build | Transforms discussion into structured requirements | "Does this describe what we want?" |
| 4 | `design` | Figuring out how it works | Proposes architecture, documents tradeoffs | "Is this the right approach?" |
| 5 | `spec` | Writing it all down | Synthesises prior work into a complete spec | "Is this ready to build?" |
| 6 | `tasks` | Planning the work | Breaks spec into tasks, surfaces dependencies | "Is this plan realistic?" |
| 7 | `implementation-log` | Building it | Writes code from spec and task list | "Does this match what we wanted?" |
| 8 | `test-plan` | Making sure it works | Writes tests from requirements and implementation | "Does this plan catch the right things?" |
| 9 | `test-report` | What we found | Runs tests, reports results in plain language | "Are we ready to ship?" |
| 10 | `review` | Getting a second opinion | Reviews code, design, and requirements | "Is this good enough?" |
| 11 | `release-notes` | Telling people what changed | Drafts release notes from implementation log | "Does this tell the right story?" |
| 12 | `retrospective` | What we learned | Structures retrospective, identifies patterns | "What do we do differently next time?" |

## The pipeline view

The ADLC stages form a **pipeline**: every feature enters at `idea` and exits at `retrospective`. The fleet dashboard (#168) visualises this pipeline as a matrix — features as rows, stages as columns — so the user can see the state of all features simultaneously. See [pipeline.md](./pipeline.md).

## v1 vs v2.0

In v1, the ADLC is served conversationally via the Claude CLI chat sidebar. In v2.0, `specorator-runtime` orchestrates dedicated agents through each stage with stateful, resumable sessions.
