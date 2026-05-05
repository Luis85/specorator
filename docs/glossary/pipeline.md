---
term: "Pipeline"
aliases: ["ADLC pipeline", "workflow pipeline"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - adlc.md
  - workflow-stage.md
  - gate.md
  - fleet-dashboard.md
  - hitl.md
issues:
  - "#164"
  - "#168"
last_updated: 2026-05-05
---

# Pipeline

The mental model for understanding how a feature moves through the twelve ADLC stages. Each feature is conceptually a "build" running through a pipeline: it enters at `idea`, passes through stages with agent execution and human governance gates, and exits at `retrospective`.

This framing maps intentionally to CI/CD pipelines in software delivery. Just as a CI pipeline defines stages (lint → test → build → deploy) with pass/fail gates between them, the ADLC defines stages (idea → research → requirements → … → retrospective) with human approval gates between them. The difference is who approves the gates: in CI/CD, automated checks; in the ADLC, the user — always.

## Why the pipeline model matters

The pipeline model makes the governance structure explicit:

- **Stages** are units of execution (agents work within a stage)
- **Gates** are units of governance (the user decides at the boundary)
- **The fleet dashboard** is the pipeline monitor (all features, all stages, one view)

Without this mental model, the ADLC can feel like a vague checklist. With it, every interaction has a clear place: either you are inside a stage (agent working or awaiting review) or you are at a gate (user deciding whether to advance).

## The pipeline as a portfolio view

When N features are active simultaneously, the portfolio IS a set of parallel pipelines. The fleet dashboard renders this as a matrix: features as rows, stages as columns, each cell showing the current state of that stage for that feature. The user can scan the entire portfolio at a glance and see where their attention is needed.

## Ambiguity note

"Pipeline" can refer to a CI/CD pipeline (GitHub Actions workflow), the ADLC feature pipeline, or a data processing pipeline. In Specorator documentation, "pipeline" without qualification means the ADLC feature pipeline unless the context clearly indicates otherwise.
