---
title: "Requirements intake workflow"
doc_type: process
status: draft
owner: product
last_updated: 2026-05-01
references:
  - requirements/intake/REQ-0000-template.md
  - docs/prd.md
---

# Requirements Intake Workflow

This repository uses frontmatter-backed Markdown files in `requirements/intake/` as the durable intake artifact for new requirements.

## Flow

1. Open a **Requirement intake** issue with a proposed `REQ-XXXX` identifier.
2. (Optional) Open a **Design intake** issue first when the requirement implies non-trivial UX or workflow decisions.
3. Create a draft PR that adds a requirement file copied from `requirements/intake/REQ-0000-template.md`.
4. Link both intake issues in the PR template.
5. Move status from `proposed` to `accepted` only after triage consensus.

## File conventions

- One requirement per file: `requirements/intake/REQ-XXXX-<slug>.md`
- Required frontmatter keys: `id`, `status`, `summary`, `source_issue`, `statement`, `acceptance_criteria`, `traceability`.
- Use `statement` with explicit SHALL wording.
- `acceptance_criteria` must be objective and testable.

## Triaging GitHub issues in order

To process issues predictably:

1. Sort by oldest first.
2. Confirm each issue is one of: design intake, requirement intake, implementation task, or maintenance.
3. Convert under-specified issues into intake issues before implementation.
4. Reject or close issues missing a clear user need or testable outcome.

A future automation can validate required frontmatter keys and ID format.
