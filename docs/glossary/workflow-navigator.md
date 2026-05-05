---
term: "Workflow navigator"
aliases: ["navigator", "workflow navigation view"]
category: ui
status: stable
version: "v1"
related:
  - cockpit.md
  - fleet-dashboard.md
  - workflow-stage.md
  - workflow-state.md
issues:
  - "#47"
  - "#1"
last_updated: 2026-05-05
---

# Workflow navigator

The v1 sidebar or panel view that surfaces workflow state for a single feature: active project, current stage (in plain language), which artifacts are present, next required artifacts, and controls for opening or creating workflow files. Implemented as a Vue 3 component in the isolated browser runtime.

## What the navigator shows

- The active feature's name and its current stage as a plain-language label (never a slug)
- A visual progress strip showing which stages are done, current, and upcoming
- Quick-access links to the current stage's artifact and related notes
- A "what comes next?" prompt tailored to the current stage

## Relationship to the fleet dashboard

The workflow navigator is the **per-feature pipeline view** — it shows one feature at a time. The fleet dashboard (v2.0, #168) extends this concept to N features simultaneously. The navigator is the v1 foundation; the fleet dashboard is the v2.0 evolution. The data model and visual conventions established in the navigator carry forward unchanged.

## Roadmap

The workflow navigator ships in Phase 4 Increment 2 (see #47). It is the Specorator UI component that first establishes the "pipeline" mental model for users.
