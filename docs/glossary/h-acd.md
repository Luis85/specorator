---
term: "Human-Agent Centered Design"
aliases: ["H-ACD"]
category: governance
status: stable
version: "v1 and v2.0"
related:
  - workflow-encapsulation.md
  - human-authority.md
  - intent-first.md
  - vault-as-operating-environment.md
  - hitl.md
  - hotl.md
issues:
  - "#164"
last_updated: 2026-05-05
---

# Human-Agent Centered Design (H-ACD)

The foundational product philosophy that governs every design decision in Specorator. H-ACD defines a model in which agents handle execution and humans govern outcomes — making rigorous product delivery accessible to everyone, regardless of technical background.

H-ACD is built on four principles:

1. **Workflow encapsulation** — methodology complexity is hidden from the user; they experience results, not machinery
2. **Human authority over outcomes** — agents propose; humans decide; nothing is committed without user approval
3. **Intent-first interaction** — the user expresses what they want; the system handles the how
4. **The vault as the agentic operating environment** — agents operate through Obsidian's own data model; the vault is not a storage location but the primary workspace

## Why it matters

Traditional software delivery gates participation behind technical expertise. H-ACD removes that gate. A product manager with no coding background can govern every stage of a feature's lifecycle — from idea articulation to test result review — because the governance decisions are human decisions, not technical ones. Agents bring the expertise; the user brings the intent and the final authority.

## In practice

Every feature, interaction, and piece of copy in Specorator is evaluated against H-ACD's four principles. If a proposed UI element exposes a stage slug, a methodology term, or an agent configuration option to the user, it violates workflow encapsulation and must be redesigned. If a workflow can advance without user approval, it violates human authority and must be corrected.

## Reference

[Human-Agent Centered Design](https://hacd.lovable.app/) — the foundational framework that Specorator applies.

For the full product philosophy document, see [docs/h-acd.md](../h-acd.md).
