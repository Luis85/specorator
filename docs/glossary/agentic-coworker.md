---
term: "Agentic coworker"
aliases: ["coworker", "AI coworker", "agent role"]
category: core
status: draft
version: "v2.0"
related:
  - companion-app.md
  - agentonomous.md
  - specorator-runtime.md
  - adlc.md
issues:
  - "#23"
  - "#164"
last_updated: 2026-05-05
---

# Agentic coworker

A purpose-built agent defined in `agentonomous` that appears as a named, role-specific helper in the Specorator UI. Coworkers are invoked by `specorator-runtime` for the appropriate ADLC stage; they produce proposed outputs that the user reviews, edits, and accepts or rejects. **Not available in v1.**

## Coworker roles

| Role | Stages | Responsibility |
|---|---|---|
| PM agent | 1–3 (idea, research, requirements) | Articulates concepts, structures research, drafts requirements |
| Architect agent | 4 (design) | Proposes architecture, documents tradeoffs |
| Writer agent | 5, 11 (spec, release notes) | Synthesises prior work into complete documents |
| Planner agent | 6 (tasks) | Breaks spec into tasks, surfaces dependencies |
| Engineering agent | 7 (implementation-log) | Writes code from spec and task list |
| QA agent | 8–9 (test-plan, test-report) | Writes tests, runs them, reports results |
| Review agent | 10 (review) | Reviews code, design, and requirements; flags issues |

## What coworkers are not

Coworkers are not generic AI assistants that can do anything. Each coworker has a defined input contract (from the runtime), a defined output contract (a specific artifact type or action), and explicit scope limits. A coworker that tries to do work outside its scope is a configuration bug, not a feature.

## User-facing representation

In the chat sidebar and fleet dashboard, coworkers may have plain-language names visible to the user ("your requirements assistant", "the engineer reviewing this"). The underlying `agentonomous` role name, model, or tool set is never exposed. See [workflow-encapsulation.md](./workflow-encapsulation.md).
