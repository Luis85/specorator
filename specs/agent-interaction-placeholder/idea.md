---
id: IDEA-AIP-001
title: "Agent interaction placeholder for v2.0 extension"
stage: idea
feature: agent-interaction-placeholder
status: accepted
owner: pm
created: 2026-05-02
updated: 2026-05-02
---

## Problem statement

Specorator v1 is designed to leave a clear extension point for the v2.0 `agentonomous`-powered agent coworker experience (#23). Without a deliberate placeholder — a named location in the UI and a typed interface in the code — v1 risks either blocking v2.0 with tight coupling or drifting into an architecture where adding agents later requires a large rewrite. The v1 shell must define the shape of agent interaction without implementing it.

## Primary users

- **v2.0 developers** who will wire `agentonomous` into the plugin; they need a stable, documented extension point to target.
- **v1 users** who should see a clearly labelled "future" surface in the UI so expectations are set correctly.
- **Evaluators and contributors** who want to understand the v2.0 direction from the v1 codebase.

## Success criteria

- The plugin UI contains a clearly labelled agent interaction area (panel, section, or placeholder card) at the appropriate stage in the navigator.
- The placeholder is disabled or shows a "coming in v2.0" message — it does not pretend to do anything in v1.
- A typed `IAgentBridge` or equivalent interface is defined in the infrastructure layer with stub methods, ready for a real implementation to satisfy.
- The plugin bridge (`IBridge`) has an optional `agentBridge` property or equivalent seam so the placeholder can be replaced without modifying call sites.
- Documentation (inline or in `docs/`) describes what v2.0 must implement to activate the extension point.

## Constraints

- Must not introduce any live `agentonomous` dependency in v1; stubs only.
- UI placeholder must not mislead users into thinking agent features are available.
- The typed interface must be designed to be stable — v2.0 should satisfy it, not replace it.
- Must work in both Obsidian and standalone browser UI contexts.

## Research questions

- What is the minimal typed interface surface that covers the v2.0 use cases described in #23 without over-engineering for v1?
- Should the placeholder appear per-stage (inline in the navigator) or as a separate panel?
- What documentation format best communicates the extension contract to future developers?

## Preliminary scope

**In scope:** `IAgentBridge` typed stub interface; disabled UI placeholder in the navigator; `IBridge` seam for agent bridge injection; inline documentation of the extension contract.

**Out of scope:** Any live agent execution, `agentonomous` integration, API key management, or vault permission controls (all deferred to v2.0 per #23).
