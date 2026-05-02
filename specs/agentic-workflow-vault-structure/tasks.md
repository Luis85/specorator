---
id: TASKS-AVS-001
title: Vault structure alignment — implementation tasks
stage: tasks
feature: agentic-workflow-vault-structure
status: in-progress
created: 2026-05-02
updated: 2026-05-02
---

## Task breakdown

### T-AVS-01 — Feature domain: add `area` field ✅

**File:** `src/domain/feature/Feature.ts`
**Satisfies:** REQ-AVS-006

- Add `area?: string` to `FeatureProps`.
- Add `area: string` to `FeaturePlainObject`.
- Update `Feature.create()` signature to accept optional `area`.
- Add `Feature.area` getter (returns `''` if unset).
- Update `toPlainObject()` to include `area`.

---

### T-AVS-02 — IFeatureRepository: add `createStageFile()` ✅

**File:** `src/domain/feature/IFeatureRepository.ts`
**Satisfies:** REQ-AVS-004, REQ-AVS-005

- Add `createStageFile(feature: Feature, stepNumber: number): Promise<Result<void>>`.

---

### T-AVS-03 — FeatureRepository: fix serializer ✅

**File:** `src/infrastructure/bridge/FeatureRepository.ts`
**Satisfies:** REQ-AVS-001, REQ-AVS-002, REQ-AVS-003, REQ-AVS-006

- Remove `title:` from serialized output.
- Write full `artifacts:` YAML block map (12 entries).
- Derive `area` from slug initials if `feature.area` is empty.
- Write `last_updated` as `YYYY-MM-DD` date string.

---

### T-AVS-04 — FeatureRepository: fix frontmatter parser ✅

**File:** `src/infrastructure/bridge/FeatureRepository.ts`
**Satisfies:** REQ-AVS-002

- Skip indented lines (block map child values).
- Skip keys with no inline value (`artifacts:` parent line).
- Keep `title:` as fallback for `feature:` in deserializer.

---

### T-AVS-05 — FeatureRepository: upsert save + idea.md creation ✅

**File:** `src/infrastructure/bridge/FeatureRepository.ts`
**Satisfies:** REQ-AVS-004, REQ-AVS-001

- `save()` becomes upsert: overwrites `workflow-state.md` if it exists.
- On first creation: also writes `idea.md` stub.
- Remove the old "already exists" guard that blocked updates.

---

### T-AVS-06 — FeatureRepository: implement `createStageFile()` ✅

**File:** `src/infrastructure/bridge/FeatureRepository.ts`
**Satisfies:** REQ-AVS-004, REQ-AVS-005

- Resolve step slug from `FEATURE_STEPS[stepNumber - 1]`.
- If file exists: `showNotice` + return `ok(undefined)`.
- If file absent: write minimal stub with agentic-workflow frontmatter.

---

### T-AVS-07 — CreateFeatureUseCase: add optional `area` input ✅

**File:** `src/application/feature/CreateFeatureUseCase.ts`
**Satisfies:** REQ-AVS-006

- Add `area?: string` to `CreateFeatureInput`.
- Pass `input.area` to `Feature.create()`.

---

### T-AVS-08 — AdvanceFeatureStageUseCase: new use case ✅

**File:** `src/application/feature/AdvanceFeatureStageUseCase.ts`
**Satisfies:** REQ-AVS-004, REQ-AVS-005

- Implement `AdvanceFeatureStageUseCase`.
- Calls `feature.advanceStep()`, `createStageFile()`, `save()` in sequence.

---

### T-AVS-09 — main.ts: legacy vault detection + settings migration ✅

**File:** `src/plugin/main.ts`
**Satisfies:** DESIGN-AVS-001 Decision 2, NFR-AVS-004

- Add `detectLegacyVaultLayout()` called from `onload`.
- Add `featuresFolder → specsFolder` migration in `loadSettings`.

---

### T-AVS-10 — Update dev fixtures ✅

**File:** `src/infrastructure/mock/fixtures.ts`
**Satisfies:** REQ-AVS-001, REQ-AVS-002

- Remove `title:` fields.
- Replace `artifacts: []` with full block maps.
- Update `last_updated` to date-only format.

---

### T-AVS-11 — Update and extend tests ✅

**File:** `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts`
**Satisfies:** all REQ-AVS-001–006

- Assert `feature:` present, `title:` absent in serialized output.
- Assert full `artifacts:` block map written.
- Assert `last_updated` is date-only.
- Assert `idea.md` created on first save.
- Assert user-supplied area stored uppercase.
- Assert area derived from slug when not supplied.
- Assert `ActivateFeatureUseCase` succeeds for existing feature (upsert).
- Assert `AdvanceFeatureStageUseCase` creates stage file.
- Assert existing stage file preserved; notice shown.

---

### T-AVS-12 — Write spec.md and tasks.md ✅

- Created this document.
- Created `specs/agentic-workflow-vault-structure/spec.md`.

---

## Quality gate

- [ ] `npm test` — all tests pass (including new AVS tests)
- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run lint` — zero lint errors
- [ ] Manual: `npm run dev` shows features under `specs/` with correct frontmatter
- [ ] PR opened and ready for review
