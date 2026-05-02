---
id: ADR-005
title: Align vault structure with agentic-workflow conventions
status: accepted
date: 2026-05-02
references:
  - specs/agentic-workflow-vault-structure/design.md
  - specs/agentic-workflow-vault-structure/requirements.md
---

# ADR-005 — Align vault structure with agentic-workflow conventions

## Decision

The plugin stores all feature artifacts under `specs/{slug}/` (configurable via the `specsFolder` setting, default `specs`). Each feature folder contains a `workflow-state.md` tracking file with YAML frontmatter compatible with the [agentic-workflow](https://github.com/luis85/agentic-workflow) template schema. Stage artifact files use the 12 agentic-workflow lifecycle slugs as filenames.

### Folder layout

```
{specsFolder}/
  {slug}/
    workflow-state.md          ← primary tracking artifact (created on feature creation)
    idea.md                    ← created when stage 1 is active
    research.md                ← created when user advances to stage 2
    requirements.md
    design.md
    spec.md
    tasks.md
    implementation-log.md
    test-plan.md
    test-report.md
    review.md
    release-notes.md
    retrospective.md
```

### `workflow-state.md` frontmatter schema

```yaml
---
id: {uuid}
feature: "{title}"
area: "{AREA}"
current_stage: {stage-slug}
status: draft | active | archived | abandoned
last_updated: YYYY-MM-DD
last_agent: ""
artifacts:
  idea: complete | in-progress | pending | skipped | blocked
  research: pending
  requirements: pending
  design: pending
  spec: pending
  tasks: pending
  implementation-log: pending
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
createdAt: {ISO-8601 datetime}
updatedAt: {ISO-8601 datetime}
slug: {slug}
---
```

`feature` is the canonical title field (matches agentic-workflow). `id` and `slug` are plugin-internal. `last_agent` is empty in v1; reserved for agentonomous v2.0.

### Stage file creation rule

Stage files are created lazily — only when the user advances to that stage. `idea.md` is created alongside `workflow-state.md` at feature creation time. If a file already exists at the expected path, the plugin shows a notice and skips creation without overwriting (REQ-AVS-005).

### ADR storage

Architecture decision records are stored globally in `docs/adr/`. Per-feature ADR folders (`specs/{slug}/adr/`) are not used in v1.

### Migration of `features/` vaults

If the vault contains a `features/` folder but not a `specs/` folder on plugin load, the plugin shows a notice informing the user and takes no automatic action. A migration command is deferred to a post-v1 issue.

## Rationale

The previous structure (`features/{slug}/` with numbered step files like `01-vision.md`) diverged from the upstream agentic-workflow template that Specorator is designed to support. The misalignment meant:

- Vaults managed by Specorator were incompatible with agentic-workflow agent skills and ADR tooling.
- Stage files had numeric prefixes that agents could not resolve by path without extra configuration.
- The `_meta.md` tracking file used different field names from the agentic-workflow `workflow-state-template.md`.

Aligning with upstream conventions removes the translation layer and makes Specorator-managed vaults natively usable with agentic-workflow tooling.

## Consequences

- `FeatureRepository.serializeFeature` writes `feature:` (not `title:`), the `artifacts` YAML block map, and `last_updated` as a date string.
- `FeatureRepository.deserializeFeature` reads `feature` as the title (with `title` as a fallback for backward compatibility during the transition).
- `PluginSettings.specsFolder` defaults to `specs`; `featuresFolder` is treated as an alias of `specsFolder` if present in saved settings (NFR-AVS-004).
- The `FeatureStep` domain type already maps step numbers to the correct agentic-workflow slugs (`FEATURE_STEPS` in `src/domain/feature/FeatureStep.ts`).
- All vault files remain plain Markdown with YAML frontmatter — readable and editable without the plugin.
