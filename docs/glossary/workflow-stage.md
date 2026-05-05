---
term: "Workflow stage"
aliases: ["stage", "ADLC stage"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - adlc.md
  - pipeline.md
  - gate.md
  - artifact.md
  - workflow-state.md
issues:
  - "#1"
  - "#161"
last_updated: 2026-05-05
---

# Workflow stage

One of the twelve named phases in the ADLC through which a feature progresses. Each stage has a slug (the internal identifier), a plain-language label (what users see), an agent role, expected artifacts, and a quality gate before the next stage begins.

## Stage slugs and plain labels

| Slug | Plain label |
|---|---|
| `idea` | Exploring the idea |
| `research` | Understanding the space |
| `requirements` | Defining what to build |
| `design` | Figuring out how it works |
| `spec` | Writing it all down |
| `tasks` | Planning the work |
| `implementation-log` | Building it |
| `test-plan` | Making sure it works |
| `test-report` | What we found |
| `review` | Getting a second opinion |
| `release-notes` | Telling people what changed |
| `retrospective` | What we learned |

## User-facing rule

Stage slugs **never appear in user-facing text**. The UI always uses plain labels. This is a workflow encapsulation requirement enforced via ESLint and design review.

## Stage artifacts

Each stage has one canonical artifact file created lazily when the user advances to that stage. The file lives at `specs/{slug}/{stage-slug}.md`. If the file already exists when a stage begins, Specorator shows a notice and skips creation without overwriting (overwrite protection, REQ-AVS-005).

## Ambiguity note

"Stage" and "step" are sometimes used interchangeably in older documentation. Prefer "stage" for the twelve ADLC phases; "step" is a deprecated synonym from an earlier design iteration.
