---
term: "Scaffold"
aliases: ["project scaffold", "feature scaffold"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - feature.md
  - artifact.md
  - workflow-state.md
issues:
  - "#1"
  - "#162"
last_updated: 2026-05-05
---

# Scaffold

The initial set of folders and template files created when the user starts a new feature through the plugin. The scaffold establishes the feature's vault structure and creates the `workflow-state.md` state file and the first stage artifact (`idea.md`).

## What scaffolding creates

For a new feature with slug `auth-flow`:

```
specs/
└── auth-flow/
    ├── workflow-state.md       ← created with initial frontmatter
    └── idea.md                 ← Stage 1 artifact, ready to fill in
```

Subsequent stage artifacts are created lazily — only when the user advances to that stage — rather than all at once. This prevents an overwhelming folder of empty files and means every present file represents real work.

## Overwrite protection

If any scaffold file already exists when a scaffold operation runs, Specorator shows a notice and skips creation for that file without overwriting. This is a hard requirement (REQ-AVS-005) that applies equally to manual scaffold operations and agent-proposed scaffold writes.

## Template installation vs feature scaffold

Template installation (see the onboarding flow) installs the `agentic-workflow` template into the vault — creating the folder structure, AGENTS instructions, and process docs. Feature scaffolding creates the per-feature folder under `specs/` for a single new feature. These are distinct operations.
