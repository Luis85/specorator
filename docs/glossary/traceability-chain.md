---
term: "Traceability chain"
aliases: ["traceability", "end-to-end traceability"]
category: workflow
status: draft
version: "v1 and v2.0"
related:
  - session-log.md
  - artifact.md
  - workflow-state.md
  - fleet-dashboard.md
  - vault-as-operating-environment.md
issues:
  - "#169"
  - "#164"
last_updated: 2026-05-05
---

# Traceability chain

The complete, navigable link from a feature's root issue through every stage artifact to the final retrospective note, where every node references the ones before and after it via vault `[[wikilinks]]`. The traceability chain is the property that makes the vault an audit trail rather than a file collection.

## The chain

For any feature with slug `auth-flow`, the chain runs:

```
Root issue (#161)
  └── specs/auth-flow/idea.md                    (Stage 1)
  └── specs/auth-flow/workflow-state.md           (canonical state; references all artifacts)
  └── specs/auth-flow/research.md                 (Stage 2)
  └── specs/auth-flow/requirements.md             (Stage 3)
  └── specs/auth-flow/design.md                   (Stage 4)
  └── specs/auth-flow/spec.md                     (Stage 5)
  └── specs/auth-flow/tasks.md                    (Stage 6)
  └── specs/auth-flow/implementation-log.md       (Stage 7)
  └── specs/auth-flow/test-plan.md                (Stage 8)
  └── specs/auth-flow/test-report.md              (Stage 9)
  └── specs/auth-flow/review.md                   (Stage 10)
  └── specs/auth-flow/release-notes.md            (Stage 11)
  └── specs/auth-flow/retrospective.md            (Stage 12)
  └── specs/auth-flow/sessions/                   (session logs for each stage)
```

Every artifact in this chain links to related artifacts via `[[wikilinks]]`, so the relationship enters Obsidian's knowledge graph as first-class backlinks.

## Why traceability is a requirement, not a feature

Without a complete traceability chain:

- The fleet dashboard cannot reconstruct the state of any feature from vault data alone
- Agents starting a new session cannot discover what was decided in prior sessions
- The user cannot answer "how did we get here?" for any stage output
- The retrospective agent cannot synthesise the project's full decision history

Traceability is the property that makes the vault the authoritative source of truth rather than a collection of disconnected files.

## The mechanism: `workflow-state.md`

`workflow-state.md` is the anchor of the traceability chain. Its frontmatter references every stage artifact and session log, stores the root issue number, and links parent and child features. It is the single file from which the complete chain can be reconstructed without graph traversal.

## The mechanism: wikilinks

Every stage artifact links to adjacent artifacts and related decisions via `[[wikilinks]]`. This means Obsidian's backlink graph encodes the traceability chain as a navigable knowledge graph — the user can follow the chain in either direction from any note.

## Full specification

Issue #169.
