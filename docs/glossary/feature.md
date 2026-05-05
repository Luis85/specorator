---
term: "Feature"
aliases: ["project feature", "workflow feature"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - workflow-state.md
  - workflow-stage.md
  - artifact.md
  - traceability-chain.md
  - scaffold.md
issues:
  - "#1"
  - "#169"
last_updated: 2026-05-05
---

# Feature

A unit of work tracked through the ADLC. A feature has a name, a slug-based folder under `specs/`, a `workflow-state.md` state file, a set of stage artifact files, and a root issue that it traces back to.

## Vault structure

```
specs/
└── auth-flow/                    ← feature slug
    ├── workflow-state.md         ← state file (frontmatter anchor)
    ├── idea.md                   ← stage artifact (Stage 1)
    ├── research.md               ← stage artifact (Stage 2)
    ├── requirements.md           ← stage artifact (Stage 3)
    └── sessions/                 ← agent session logs
        ├── idea-session-20260504-0900.md
        └── requirements-session-20260505-1437.md
```

## Feature states

A feature can be:
- **Active** — currently being worked on; has a `current_stage` in `workflow-state.md`
- **Archived** — completed through all relevant stages; preserved in the vault
- **Abandoned** — work stopped before completion; documented with a reason

## Feature hierarchy

Features can be nested: a root epic feature can have child features, each with their own ADLC pipeline. `workflow-state.md` records `parent_feature` and `child_features` to make the hierarchy queryable. The fleet dashboard renders this as a tree where the user can see both the portfolio overview and any feature's sub-pipeline.

## Relationship to GitHub issues

A feature corresponds to one or more GitHub issues, with a `root_issue` field in `workflow-state.md` linking back to the primary issue. The vault is the source of truth for feature state; GitHub is the coordination surface.
