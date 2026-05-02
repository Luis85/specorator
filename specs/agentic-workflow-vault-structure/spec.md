---
id: SPEC-AVS-001
title: Vault structure and workflow-state.md serializer — implementation spec
stage: spec
feature: agentic-workflow-vault-structure
status: accepted
owner: engineer
inputs:
  - DESIGN-AVS-001
  - PRD-AVS-001
created: 2026-05-02
updated: 2026-05-02
---

## Summary

Specifies the exact function signatures, data contracts, and acceptance tests for the vault structure changes described in DESIGN-AVS-001 and required by REQ-AVS-001–006.

---

## Modules in scope

| Module | File |
|---|---|
| Feature domain | `src/domain/feature/Feature.ts` |
| IFeatureRepository | `src/domain/feature/IFeatureRepository.ts` |
| FeatureRepository | `src/infrastructure/bridge/FeatureRepository.ts` |
| CreateFeatureUseCase | `src/application/feature/CreateFeatureUseCase.ts` |
| AdvanceFeatureStageUseCase | `src/application/feature/AdvanceFeatureStageUseCase.ts` |
| Plugin entry point | `src/plugin/main.ts` |
| Dev fixtures | `src/infrastructure/mock/fixtures.ts` |

---

## 1. Feature domain — `area` field

### Added to `FeatureProps` and `FeaturePlainObject`

```ts
area?: string   // optional in FeatureProps; always present in FeaturePlainObject
```

### `Feature.create` signature

```ts
static create(id: string, slug: Slug, title: string, area?: string): Result<Feature>
```

- If `area` is provided, stores it uppercased and trimmed.
- If omitted, stores `''`; the serializer derives the area from slug initials.

### `Feature.area` getter

```ts
get area(): string  // returns '' if not set
```

### Area derivation (serializer responsibility)

```ts
function deriveArea(slugValue: string): string
// 'dark-mode' → 'DM', 'onboarding-flow' → 'OF', 'export-pdf' → 'EP'
// max 5 characters, all uppercase
```

---

## 2. IFeatureRepository — new method

```ts
createStageFile(feature: Feature, stepNumber: number): Promise<Result<void>>
```

- Resolves step slug from `FEATURE_STEPS[stepNumber - 1]`.
- Returns `err` if `stepNumber` is out of range.
- If the file already exists: calls `bridge.showNotice(...)` and returns `ok(undefined)` — **no overwrite** (REQ-AVS-005).
- If the file does not exist: writes a stub (see §4).

### `save` contract change

`save(feature)` is now an **upsert**:

- If `workflow-state.md` does not exist: create folder + write `workflow-state.md` + write `idea.md` stub.
- If `workflow-state.md` exists: overwrite `workflow-state.md` only (no idea.md re-write).

---

## 3. `workflow-state.md` serializer target schema

```
---
id: {uuid}
slug: {slug}
feature: "{title}"
area: {AREA}
status: {draft|active|archived|abandoned}
currentStep: {N}
current_stage: {stage-slug}
last_updated: {YYYY-MM-DD}
last_agent: ""
artifacts:
  idea: {status}
  research: {status}
  requirements: {status}
  design: {status}
  spec: {status}
  tasks: {status}
  implementation-log: {status}
  test-plan: {status}
  test-report: {status}
  review: {status}
  release-notes: {status}
  retrospective: {status}
createdAt: {ISO-8601 datetime}
updatedAt: {ISO-8601 datetime}
---
```

**Removed:** `title:` field (DESIGN-AVS-001 §Serializer changes).

**`artifacts` derivation from `currentStep`:**

| Step range | Status |
|---|---|
| `stepNum < currentStep` | `complete` |
| `stepNum === currentStep`, step 1 | `complete` (idea is always complete at creation) |
| `stepNum === currentStep`, step > 1 | `in-progress` |
| `stepNum > currentStep` | `pending` |

---

## 4. Stage artifact stub template

Written by `save()` (idea.md) and `createStageFile()` (other stages):

```markdown
---
stage: {stage-slug}
feature: {slug}
status: in-progress
created: {YYYY-MM-DD}
---

<!-- {Display name} artifact for {feature title}. -->
```

Display name: title-case stage slug with hyphens replaced by spaces.

---

## 5. Frontmatter parser

`parseFrontmatter` skips:

1. Lines starting with whitespace (block map child values such as `  idea: complete`).
2. Keys with no inline value (block map parent keys such as `artifacts:`).

Backward-compat: deserializer reads `feature` as title; falls back to `title` if `feature` is absent.

---

## 6. `CreateFeatureInput` change

```ts
export interface CreateFeatureInput {
  readonly title: string
  readonly area?: string   // optional; derived from slug if absent
}
```

---

## 7. `AdvanceFeatureStageUseCase`

```ts
export class AdvanceFeatureStageUseCase implements UseCase<AdvanceFeatureStageInput, Feature> {
  async execute(input: { featureId: string }): Promise<Result<Feature>>
}
```

Sequence:
1. `findById` — return `err` if not found.
2. `feature.advanceStep()` — return `err` on domain failure.
3. `createStageFile(advanced, advanced.currentStep)` — create file or show notice.
4. `save(advanced)` — write updated `workflow-state.md`.
5. Return `ok(advanced)`.

---

## 8. `main.ts` migration detection (DESIGN-AVS-001 Decision 2)

On `onload`, after `loadSettings`:

```ts
private detectLegacyVaultLayout(): void
```

- Checks `app.vault.getAbstractFileByPath('features') instanceof TFolder`.
- Checks `app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder`.
- If `features/` exists and `specsFolder/` does not: shows `Notice` with message:
  > "Specorator: this vault uses the old `features/` folder. Please rename it to `{specsFolder}/` or update the Specs folder setting."

---

## 9. `loadSettings` settings migration (NFR-AVS-004)

```ts
// In loadSettings():
if (raw.featuresFolder && !raw.specsFolder) {
  raw.specsFolder = raw.featuresFolder
}
```

---

## Acceptance tests (automated)

Covered by `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts`:

| Test | REQ |
|---|---|
| `workflow-state.md` contains `feature:` not `title:` | REQ-AVS-002 |
| Full `artifacts:` block map written (not `artifacts: []`) | REQ-AVS-002 |
| `last_updated` is `YYYY-MM-DD` date string | REQ-AVS-002 |
| `idea.md` created alongside `workflow-state.md` | REQ-AVS-004 |
| User-supplied `area` stored uppercase | REQ-AVS-006 |
| Area derived from slug initials when not supplied | REQ-AVS-006 |
| `ActivateFeatureUseCase` succeeds for existing feature (upsert) | REQ-AVS-002 |
| `AdvanceFeatureStageUseCase` creates stage file | REQ-AVS-004 |
| Existing stage file preserved; notice shown | REQ-AVS-005 |

---

## Out of scope

- Automated `features/` → `specs/` migration command (post-v1 issue).
- `traceability.md` generation (explicitly excluded by PRD-AVS-001).
- Per-feature ADR folders (deferred to v2.0 per DESIGN-AVS-001).
