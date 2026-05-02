---
id: PRD-AVS-001
title: Agentic-workflow-compatible vault folder structure
stage: requirements
feature: agentic-workflow-vault-structure
status: accepted
owner: pm
inputs:
  - IDEA-AVS-001
created: 2026-05-01
updated: 2026-05-01
---

## Summary

The Specorator plugin must create and manage vault artifacts using the folder layout, file names, and `workflow-state.md` frontmatter schema defined by the [agentic-workflow](https://github.com/luis85/agentic-workflow) template. This makes Specorator-managed vaults natively compatible with the agentic-workflow agent skills, ADR tooling, and traceability conventions without requiring any translation layer.

## Goals

- Vault layout produced by Specorator is a valid agentic-workflow project root.
- `workflow-state.md` in each spec folder is readable and writeable by both the plugin and agentic-workflow agent prompts.
- The specorator repo itself uses `specs/` for its own feature development tracking (self-hosting the convention).

## Non-goals

- Automated migration of vaults that use the old `features/` folder structure.
- Full implementation of agentic-workflow agent prompts or skills inside the plugin.
- Traceability index (`traceability.md`) generation in v1.
- Support for the agentic-workflow Discovery or Project Scaffolding tracks (Lifecycle Track only).

---

## Functional requirements (EARS)

### REQ-AVS-001

**Pattern:** ubiquitous
**Statement:** The plugin shall store all feature artifacts under a root `specs/` folder (configurable) using the path pattern `specs/{slug}/`.
**Acceptance:**
- The default value of the `specsFolder` plugin setting is `specs`.
- Running "Create feature" with title "Dark mode" creates `specs/dark-mode/workflow-state.md` in the vault.
- No feature artifacts are created under a `features/` folder unless the user explicitly configures that path.
**Priority:** must
**Satisfies:** IDEA-AVS-001

---

### REQ-AVS-002

**Pattern:** ubiquitous
**Statement:** The plugin shall create a `workflow-state.md` file as the primary tracking artifact for each feature, with YAML frontmatter fields compatible with the agentic-workflow `workflow-state-template.md` schema.
**Acceptance:**
- `workflow-state.md` frontmatter includes at minimum: `feature`, `area`, `current_stage`, `status`, `last_updated`, `last_agent`, and `artifacts`.
- The `artifacts` field is a YAML map with one key per stage and values from the set `pending | in-progress | complete | skipped | blocked`.
- An agentic-workflow agent reading `workflow-state.md` can determine the current stage and all artifact statuses without additional parsing.
**Priority:** must
**Satisfies:** IDEA-AVS-001

---

### REQ-AVS-003

**Pattern:** ubiquitous
**Statement:** The plugin shall name stage artifact files using the agentic-workflow 11-stage lifecycle names so that agents and skills can resolve artifacts by path without configuration.
**Acceptance:**
- Stage files are named: `idea.md`, `research.md`, `requirements.md`, `design.md`, `spec.md`, `tasks.md`, `implementation-log.md`, `test-plan.md`, `test-report.md`, `review.md`, `release-notes.md`, `retrospective.md`.
- No stage file uses a numeric prefix (e.g., `01-vision.md`) in the default configuration.
- The `FeatureStep` domain type maps each stage number to the correct agentic-workflow slug.
**Priority:** must
**Satisfies:** IDEA-AVS-001

---

### REQ-AVS-004

**Pattern:** event-driven
**Statement:** When the user advances a feature to a new stage, the plugin shall create the corresponding stage artifact file using the agentic-workflow filename if it does not already exist.
**Acceptance:**
- Advancing from stage 1 (idea) to stage 2 creates `specs/{slug}/research.md` with a stub containing the stage template header.
- If the file already exists, it is not overwritten.
- The `workflow-state.md` `artifacts` map is updated to reflect the new stage status.
**Priority:** must
**Satisfies:** IDEA-AVS-001

---

### REQ-AVS-005

**Pattern:** unwanted-behaviour
**Statement:** The plugin shall not silently delete or overwrite any vault file that was not created by Specorator, so that manually edited agentic-workflow artifacts are preserved.
**Acceptance:**
- If `specs/{slug}/requirements.md` exists and was not written by the plugin, advancing to the Requirements stage does not overwrite it.
- A notice is shown informing the user that the file already exists and was preserved.
**Priority:** must
**Satisfies:** IDEA-AVS-001

---

### REQ-AVS-006

**Pattern:** optional-feature
**Statement:** When the user configures an `area` code for a feature, the plugin shall use it in the `workflow-state.md` frontmatter and in requirement IDs scaffolded into `requirements.md`.
**Acceptance:**
- The feature creation form includes an optional `area` field (3–5 uppercase letters).
- If provided, `workflow-state.md` `area` field is set to the user-supplied value; otherwise it defaults to the feature slug initials in uppercase.
- Scaffolded `requirements.md` uses `REQ-{AREA}-001` as the first requirement ID.
**Priority:** should
**Satisfies:** IDEA-AVS-001

---

## Non-functional requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-AVS-001 | Compatibility | `workflow-state.md` is valid YAML parseable by js-yaml 4.x | 100 % of created files |
| NFR-AVS-002 | Reversibility | No vault data is lost when the plugin is disabled | All files remain in vault |
| NFR-AVS-003 | Portability | Vault files are readable in any Markdown editor without plugin | Plain Markdown + YAML frontmatter only |
| NFR-AVS-004 | Settings migration | If `featuresFolder` is present in saved settings, treat it as the `specsFolder` value | Backward-compatible load |

---

## Quality gate

- [ ] `npm run dev` shows features under `specs/` in the mock bridge fixtures
- [ ] Creating a feature via the UI writes `specs/{slug}/workflow-state.md` with all required frontmatter fields
- [ ] `workflow-state.md` passes YAML lint without errors
- [ ] Advancing a stage creates the correct agentic-workflow filename
- [ ] Existing files are not overwritten; a notice is shown
- [ ] `npm test` — all tests pass with updated folder convention
- [ ] `npm run type-check` — zero TypeScript errors
