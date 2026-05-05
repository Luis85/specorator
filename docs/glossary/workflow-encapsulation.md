---
term: "Workflow encapsulation"
aliases: []
category: governance
status: stable
version: "v1 and v2.0"
related:
  - h-acd.md
  - human-authority.md
  - intent-first.md
  - workflow-stage.md
  - adlc.md
issues:
  - "#164"
last_updated: 2026-05-05
---

# Workflow encapsulation

One of the four H-ACD principles. The methodology complexity of the ADLC — stage slugs, artifact types, frontmatter schema, agent routing, quality gate logic — is hidden inside Specorator. The user experiences the outcomes of the methodology without touching its machinery.

## What this means in practice

The user says "I want to figure out what to build." Specorator determines the current stage, assembles the appropriate context, routes to the right agent capability, and returns "here's a draft of what you described — what do you think?" The twelve-stage ADLC executed; the user never saw it.

From the user's perspective, they are having a conversation about their work. From Specorator's perspective, every message is contextualised by stage, feature, persona, vault state, and workflow expectations — none of which the user had to specify.

## What encapsulation forbids

Any feature, interaction, or piece of copy that exposes the following to the user violates workflow encapsulation and must be redesigned:

- Stage slugs (`idea`, `requirements`, `implementation-log`) in user-facing text
- Artifact type names or frontmatter keys
- Agent role names, model names, or prompt engineering terminology
- Workflow state machine transitions or gate logic

## Encapsulation vs hiding

Encapsulation is not about deceiving the user. Users who want to understand the methodology can read the `agentic-workflow` documentation. The plugin simply does not require them to. The goal is that the methodology serves the user — the user does not serve the methodology.

## Reference

[Workflow Encapsulation in H-ACD](https://www.designative.info/2025/12/16/workflow-encapsulation-in-human-agent-centered-design-from-doing-work-to-governing-outcomes/)
